var chownr = require('chownr');
var tar = require('tar-stream');
var pump = require('pump');
var mkdirp = require('mkdirp-classic');
var fs = require('fs');
var path = require('path');
var os = require('os');

var win32 = os.platform() === 'win32';

var noop = function () {};

var echo = function (name) {
  return name;
};

var normalize = !win32 ? echo : function (name) {
  return name.replace(/\\/g, '/').replace(/[:?<>|]/g, '_');
};

var strip = function (map, level) {
  return function (header) {
    header.name = header.name.split('/').slice(level).join('/');

    var linkname = header.linkname;
    if (linkname && (header.type === 'link' || path.isAbsolute(linkname))) {
      header.linkname = linkname.split('/').slice(level).join('/');
    }

    return map(header);
  };
};

var head = function (list) {
  return list.length ? list[list.length - 1] : null;
};

var processGetuid = function () {
  return process.getuid ? process.getuid() : -1;
};

var processUmask = function () {
  return process.umask ? process.umask() : 0;
};

exports.extract = function (cwd, opts) {
  if (!cwd) cwd = '.';
  if (!opts) opts = {};

  var xfs = opts.fs || fs;
  var ignore = opts.ignore || opts.filter || noop;
  var map = opts.map || noop;
  var mapStream = opts.mapStream || echo;
  var own = opts.chown !== false && !win32 && processGetuid() === 0;
  var extract = opts.extract || tar.extract();
  var stack = [];
  var now = new Date();
  var umask = typeof opts.umask === 'number' ? ~opts.umask : ~processUmask();
  var dmode = typeof opts.dmode === 'number' ? opts.dmode : 0;
  var fmode = typeof opts.fmode === 'number' ? opts.fmode : 0;
  var strict = opts.strict !== false;

  if (opts.strip) map = strip(map, opts.strip);

  if (opts.readable) {
    dmode |= parseInt(555, 8);
    fmode |= parseInt(444, 8);
  }
  if (opts.writable) {
    dmode |= parseInt(333, 8);
    fmode |= parseInt(222, 8);
  }

  var utimesParent = function (name, cb) { // we just set the mtime on the parent dir again everytime we write an entry
    var top;
    while ((top = head(stack)) && name.slice(0, top[0].length) !== top[0]) stack.pop();
    if (!top) return cb();
    xfs.utimes(top[0], now, top[1], cb);
  };

  var utimes = function (name, header, cb) {
    if (opts.utimes === false) return cb();

    if (header.type === 'directory') return xfs.utimes(name, now, header.mtime, cb);
    if (header.type === 'symlink') return utimesParent(name, cb); // TODO: how to set mtime on link?

    xfs.utimes(name, now, header.mtime, function (err) {
      if (err) return cb(err);
      utimesParent(name, cb);
    });
  };

  var chperm = function (name, header, cb) {
    var link = header.type === 'symlink';
    var chmod = link ? xfs.lchmod : xfs.chmod;
    var chown = link ? xfs.lchown : xfs.chown;
    if (!chmod) return cb();

    var mode = (header.mode | (header.type === 'directory' ? dmode : fmode)) & umask;

    if (chown && own) chown.call(xfs, name, header.uid, header.gid, onchown);
    else onchown(null);

    function onchown(err) {
      if (err) return cb(err);
      if (!chmod) return cb();
      chmod.call(xfs, name, mode, cb);
    }
  };

  extract.on('entry', function (header, stream, next) {
    header = map(header) || header;
    header.name = normalize(header.name);
    var name = path.join(cwd, path.join('/', header.name));

    if (ignore(name, header)) {
      stream.resume();
      return next();
    }

    var stat = function (err) {
      if (err) return next(err);
      utimes(name, header, function (err) {
        if (err) return next(err);
        if (win32) return next();
        chperm(name, header, next);
      });
    };

    var onsymlink = function () {
      if (win32) return next(); // skip symlinks on win for now before it can be tested
      xfs.unlink(name, function () {
        xfs.symlink(header.linkname, name, stat);
      });
    };

    var onlink = function () {
      if (win32) return next(); // skip links on win for now before it can be tested
      xfs.unlink(name, function () {
        var srcpath = path.join(cwd, path.join('/', header.linkname));

        xfs.link(srcpath, name, function (err) {
          if (err && err.code === 'EPERM' && opts.hardlinkAsFilesFallback) {
            stream = xfs.createReadStream(srcpath);
            return onfile();
          }

          stat(err);
        });
      });
    };

    var onfile = function () {
      var ws = xfs.createWriteStream(name);
      var rs = mapStream(stream, header);

      ws.on('error', function (err) { // always forward errors on destroy
        rs.destroy(err);
      });

      pump(rs, ws, function (err) {
        if (err) return next(err);
        ws.on('close', stat);
      });
    };

    if (header.type === 'directory') {
      stack.push([name, header.mtime]);
      return mkdirfix(name, {
        fs: xfs, own: own, uid: header.uid, gid: header.gid
      }, stat);
    }

    var dir = path.dirname(name);

    validate(xfs, dir, path.join(cwd, '.'), function (err, valid) {
      if (err) return next(err);
      if (!valid) return next(new Error(dir + ' is not a valid path'));

      mkdirfix(dir, {
        fs: xfs, own: own, uid: header.uid, gid: header.gid
      }, function (err) {
        if (err) return next(err);

        switch (header.type) {
          case 'file': return onfile();
          case 'link': return onlink();
          case 'symlink': return onsymlink();
        }

        if (strict) return next(new Error('unsupported type for ' + name + ' (' + header.type + ')'));

        stream.resume();
        next();
      });
    });
  });

  if (opts.finish) extract.on('finish', opts.finish);

  return extract;
};

function validate(fs, name, root, cb) {
  if (name === root) return cb(null, true);
  fs.lstat(name, function (err, st) {
    if (err && err.code !== 'ENOENT') return cb(err);
    if (err || st.isDirectory()) return validate(fs, path.join(name, '..'), root, cb);
    cb(null, false);
  });
}

function mkdirfix(name, opts, cb) {
  mkdirp(name, {fs: opts.fs}, function (err, made) {
    if (!err && made && opts.own) {
      chownr(made, opts.uid, opts.gid, cb);
    } else {
      cb(err);
    }
  });
}
