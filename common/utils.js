'use strict';
const _ = require('lodash');
const mkdirp = require('mkdirp');
const crypto = require('crypto');
const path = require('path');
const fs = require('xfs');
const compressing = require('compressing');
const childProcess = require('child_process');

exports.mkdirp = function (dir, mode) {
  mode = mode || '0755';
  mkdirp.sync(dir, mode);
};

exports.md5 = function (str) {
  if (typeof str !== 'string') {
    throw new Error('md5 only support string');
  }
  let hash = crypto.createHash('md5');
  hash.update(str);
  return hash.digest('hex');
};

exports.sha256 = function (str) {
  if (typeof str !== 'string') {
    throw new Error('sha256 only support string');
  }
  let hash = crypto.createHash('sha256');
  hash.update(str);
  return hash.digest('hex');
};

exports.md5base64 = function (buf) {
  return crypto.createHash('md5').update(buf, 'utf8').digest('base64');
};

exports.sha1 = function (str, secret) {
  return crypto.createHmac('sha1', secret).update(str).digest('base64');
};

/*
exports.getUidAndGid = function (changeUser) {
  if (!changeUser) { return {}; }
  const uid = process.getuid();
  if (uid >= 500) {
    return {uid: process.getuid(), gid: process.getgid()};
  }
  const gidFile = '/etc/passwd';
  const str = fs.readFileSync(gidFile, 'utf-8');
  const reg  = /[^app]admin:x:+(\d+):(\d+)/;
  const res  = str.match(reg);
  if (!res) { return {}; }
  const user = {
    uid: +res[1],
    gid: +res[2]
  };
  return user;
};
*/

/**
 * @param {String} command the command string
 * @param {Object} options
 *        - timeout unit ms, default is 10's
 *        - maxBuffer default is 200k
 * @param {Function} cb()
 */
exports.exec = function (command, options, cb) {
  if ('function' === typeof options) {
    cb = options;
    options = {};
  }
  if (options.timeout === undefined) {
    options.timeout = 120000;
  }
  if (!options.maxBuffer) {
    options.maxBuffer = 1024 * 1024;
  }
  childProcess.exec(command, options, function (err, stdout, stderr) {
    // Mac 下打包的tgz文件和linux下不一致，但不影响解压，只是会报如下信息的错误, 所有当此错误时忽略
    if (err && err.stack && err.stack.indexOf('tar: Ignoring unknown extended header keyword') < 0) {
      err.message = `exec command: ${command} failed, ${err.message}`;
      return cb(err, [stdout, stderr]);
    }
    return cb(null, [stdout, stderr]);
  });
};


const REGEXP_APPNAME_END_WITH_VERSION = /^(.+)?_(\d+\.\d+\.\d+)$/;
const REGEXP_APPNAME_END_WITH_BUILDNUM = /^(.+)?_(\d+)$/;
const REGEXP_APPNAME_END_WITH_VERSION_BUILDNUM = /^(.+)?_(\d+\.\d+\.\d+)+_(\d+)$/;

exports.parseAppId = function (appId) {
  let version = '0.0.0';
  let appName;
  let buildNum = '0';

  let m;
  // 全名字 name_version_buildnum
  if ((m = appId.match(REGEXP_APPNAME_END_WITH_VERSION_BUILDNUM))) {
    appName = m[1];
    version = m[2];
    buildNum = m[3];
  } else if ((m = appId.match(REGEXP_APPNAME_END_WITH_VERSION))) {
    appName = m[1];
    version = m[2];
    buildNum = '0';
  } else if ((m = appId.match(REGEXP_APPNAME_END_WITH_BUILDNUM))) {
    appName = m[1];
    version = '0.0.0';
    buildNum = m[2];
  } else {
    appName = appId;
    version = '0.0.0';
    buildNum = '0';
  }

  return {
    name: appName,
    version: version,
    buildNum: buildNum
  };
};

/**
 * 计算版本号大小
 */
exports.genWeight = function (version, buildNum) {
  let tmp = version.split('.');
  tmp = _.reverse(tmp);
  let weight = 0;
  tmp.forEach(function (t, i) {
    weight += Number(t) * Math.pow(10000, i);
  });
  weight += Number(buildNum) / 10000;
  return weight;
};

/**
 * ***********************************************************************
 * CreateCipher to createCipheriv migration script
 * Compute key+IV from passphrase
 * from https://gist.github.com/bnoordhuis/2de2766d3d3a47ebe41aaaec7e8b14df
 */
function sizes(cipher) {
  for (let nkey = 1, niv = 0; ;) {
    try {
      crypto.createCipheriv(cipher, '.'.repeat(nkey), '.'.repeat(niv));
      return [nkey, niv];
    } catch (e) {
      if (/(invalid iv length|Invalid initialization vector)/i.test(e.message)) {
        niv += 1;
      } else if (/invalid key length/i.test(e.message)) {
        nkey += 1;
      } else {
        throw e;
      }
    }
  }
}
function computeKeyAndIvFromPwd(cipher, passphrase) {
  let [nkey, niv] = sizes(cipher);
  for (let key = '', iv = '', p = ''; ;) {
    const h = crypto.createHash('md5');
    h.update(p, 'hex');
    h.update(passphrase);
    p = h.digest('hex');
    let n = 0;
    let i = 0;
    n = Math.min(p.length - i, 2 * nkey);
    nkey -= n / 2, key += p.slice(i, i + n), i += n;
    n = Math.min(p.length - i, 2 * niv);
    niv -= n / 2, iv += p.slice(i, i + n), i += n;
    if (nkey + niv === 0) {
      return [key, iv];
    }
  }
}
/**
 *************************************************************************
 */
exports.encrypt = function (data, key, iv) {
  if (!iv) {
    let tmp = computeKeyAndIvFromPwd('aes-256-cbc', key);
    key = Buffer.from(tmp[0], 'hex');
    iv = Buffer.from(tmp[1], 'hex');
  }
  var cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(true);
  return cipher.update(data, 'utf8', 'base64') + cipher.final('base64');
};
exports.encryptOld = function (data, key) {
  var cipher = crypto.createCipher('aes-256-cbc', key);
  cipher.setAutoPadding(true);
  return cipher.update(data, 'utf8', 'base64') + cipher.final('base64');
};
exports.decrypt = function (data, key, iv) {
  if (!iv) {
    let tmp = computeKeyAndIvFromPwd('aes-256-cbc', key);
    key = Buffer.from(tmp[0], 'hex');
    iv = Buffer.from(tmp[1], 'hex');
  }
  var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);
  return decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
};
exports.decryptOld = function (data, key) {
  var decipher = crypto.createDecipher('aes-256-cbc', key);
  decipher.setAutoPadding(true);
  return decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
};

/**
 * 加密对象的属性
 *   e::xxxx  >  d::yyyy
 */
exports.encryptObject = function (obj, secret, prefixEncode, prefixDecode) {
  prefixEncode = prefixEncode || 'e::';
  prefixDecode = prefixDecode || 'd::';
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i, a)=> {
      let type = typeof v;
      if (type === 'object') {
        exports.encryptObject(v, secret, prefixEncode, prefixDecode);
      } else if (type === 'string' && v.startsWith(prefixEncode)) {
        a[i] = prefixDecode + exports.encrypt(v.substr(prefixEncode.length), secret);
      }
    });
  } else {
    Object.keys(obj).forEach((key) => {
      let tmp = obj[key];
      let type = typeof tmp;
      if (type === 'object') {
        exports.encryptObject(tmp, secret, prefixEncode, prefixDecode);
      } else if (type === 'string' && tmp.startsWith(prefixEncode)) {
        obj[key] = prefixDecode + exports.encrypt(tmp.substr(prefixEncode.length), secret);
      }
    });
  }
  return obj;
};

/**
 * 解密对象
 *   d::yyyy > xxxxx
 */
exports.decryptObject = function (obj, secret, prefixDecode) {
  let prefixRaw = 'r::';
  prefixDecode = prefixDecode || 'd::';
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i, a)=> {
      let type = typeof v;
      if (v && type === 'object') {
        exports.decryptObject(v, secret, prefixDecode);
      } else if (type === 'string' && v.startsWith(prefixDecode)) {
        a[i] = exports.decrypt(v.substr(prefixDecode.length), secret);
      }
    });
  } else {
    Object.keys(obj).forEach((key) => {
      let tmp = obj[key];
      let type = typeof tmp;
      if (tmp && type === 'object') {
        exports.decryptObject(tmp, secret, prefixDecode);
      } else if (type === 'string') {
        if (tmp.startsWith(prefixDecode)) {
          obj[key] = exports.decrypt(tmp.substr(prefixDecode.length), secret);
        } else if (tmp.startsWith(prefixRaw)) {
          obj[key] = tmp.substr(prefixRaw.length);
        }
      }
    });
  }
  return obj;
};

/**
 * 定长字符，显示排版用
 * @param  {String} str  待处理的字符串
 * @param  {Number} length  对齐的长度
 * @param  {String} direction  左对齐还是右对齐， right | left, default is left
 * @return {String}
 */
exports.fixStringLength = function (str, length, direction) {
  // make sure str is a string
  str = str + '';
  direction = direction || 'left';
  let len = str.length;
  let delta = length - len;
  let deltStr = '';
  if (delta <= 0) {
    return str;
  }
  for (let i = 0; i < delta; i++) {
    deltStr += ' ';
  }
  if (direction === 'left') {
    return str + deltStr;
  } else {
    return deltStr + str;
  }
};


function indent(len) {
  return new Array(len + 1).join(' ');
}

exports.stringifyInfo = function (info) {
  info.forEach((v, i, a) => {
    if (typeof v === 'string') {
      return a[i] = v;
    } else {
      a[i] = indent(v[0]) + v[1];
    }
  });
  return info.join('\n');
};


let RegExpAppId = /^[a-zA-Z][\w-\.]+$/;
exports.checkAppId = function (appId) {
  if (!appId) {
    return new Error('name empty');
  }
  if (appId.indexOf('__') === 0) {
    return new Error('reserved name, no permission');
  }
  if (!RegExpAppId.test(appId)) {
    return new Error('name illegal, should match /^[\\w-\\.]+$/');
  }
  return null;
};

exports.fixPath = function (p) {
  if (typeof p !== 'string') {
    return p;
  }
  p = p.trim();
  if (p === '/') {
    return p;
  }
  if (!p.endsWith('/')) {
    p += '/';
  }
  return p;
};

exports.checkAppName = exports.checkAppId;

exports.untar = function (file, cwd, done) {
  if (fs.existsSync(path.join(cwd, file))) {
    compressing.tgz.uncompress(path.join(cwd, file), cwd)
      .then(done)
      .catch(done);
  } else {
    return done(new Error('pkg not found:' + file));
  }
};

/**
 * 返回内存大小对应的字节数。如果失败，返回0。
 * 另外，和Java类似，不支持5.2G这样的写法。
 * 单位：k/m/g，以及K/M/G，大小写无区别。
 * @param {String} sz 内存大小描述，例如：1k, 1M, 1G
 * @return {Number}
 */
exports.parseMemorySize = function (sz) {
  if (sz === undefined) {
    return 0;
  }
  if (!isNaN(sz)) {
    let n = parseInt(sz);
    return isNaN(n) ? 0 : n;
  }

  let num = sz.substring(0, sz.length - 1);
  if (sz.match(/[kK]$/)) {
    return parseInt(num) * 1024;
  } else if (sz.match(/[mM]$/)) {
    return parseInt(num) * 1024 * 1024;
  } else if (sz.match(/[gG]$/)) {
    return parseInt(num) * 1024 * 1024 * 1024;
  } else if (sz.match(/[tT]$/)) {
    return parseInt(num) * 1024 * 1024 * 1024 * 1024;
  }
  return 0;
};
