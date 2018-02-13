'use strict';

const fs = require('xfs');
const _ = require('lodash');
const path = require('path');
const rmdir = require('rmdir');
const async = require('async');
const formidable = require('formidable');

const message = require('../../message');
const config = require('../../../config');
const log = require('../../../common/log');
const utils = require('../../../common/utils');
const gatherUsage = require('../gather_usage');

/**
 * 下线应用接口
 */
exports.stopApp = function (req, res, next) {
  let appid = req.params.appid;
  let appPkgDir = path.join(config.appsRoot, appid);
  async.waterfall([
    function (callback) {
      message.send({
        action: '$unmount',
        arguments: [appid]
      }, function (err, info) {
        err = err && err.code === 'APP_NOT_MOUNTED' ? null : err;
        err && log.error(err);
        callback(err, info);
      });
    },
    function (info, callback) {
      rmdir(appPkgDir, function (err) {
        err = err && err.code === 'ENOENT' ? null : err;
        err && log.error(err);
        callback(err, info);
      });
    }
  ], function (err, info) {
    if (err) {
      return next({
        code: 'STOP_APP_ERROR',
        message: err.stack || err.message || err
      });
    }
    res.json({
      code: 'SUCCESS',
      data: info
    });
  });
};

exports.deleteApp = function (req, res, next) {
  let appid = req.params.appid;
  let appPkgDir = path.join(config.appsRoot, appid);
  async.series([
    function (callback) {
      message.send({
        action: '$unmount',
        arguments: [appid]
      }, function (err) {
        err = err && err.code === 'APP_NOT_MOUNTED' ? null : err;
        err && log.error(err);
        callback(err);
      });
    },
    function (callback) {
      rmdir(appPkgDir, function (err) {
        err = err && err.code === 'ENOENT' ? null : err;
        err && log.error(err);
        callback(err);
      });
    },
    function (callback) {
      rmdir(appPkgDir + '.tgz', function (err) {
        err = err && err.code === 'ENOENT' ? null : err;
        err && log.error(err);
        callback(err);
      });
    }
  ], function (err) {
    if (err) {
      log.error('Delete app failed:', err);
      return next({
        code: 'DELETE_APP_ERROR',
        message: err.stack || err.message || err
      });
    }
    res.json({
      code: 'SUCCESS'
    });
  });
};

exports.startApp = function (req, res, next) {
  let detailInfos = [];
  let appid = req.params.appid;

  let appPkgDir = path.join(config.appsRoot, appid);
  async.waterfall([
    function (callback) {
      rmdir(appPkgDir, function (err) {
        detailInfos.push('[' + new Date() + '] Delete the dir of ' + appid);
        if (err && err.code !== 'ENOENT') {
          log.error('Delete app pkg failed: ', err);
        }
        callback();
      });
    },
    function (callback) {
      detailInfos.push('[' + new Date() + '] Unpack the package of ' + appid);
      utils.exec(`tar zxfm ${appid}.tgz`, {
        cwd: config.appsRoot
      }, callback);
    },
    function (rows, callback) {
      detailInfos.push('[' + new Date() + '] Starting mount the app: ' + appid);
      detailInfos.push(rows);
      message.send({
        action: '$mount',
        arguments: [
          appid, {
            dir: appPkgDir
          }
        ]
      }, callback);
    }
  ], function (err, info) {
    if (err) {
      log.error('Start app failed:', err);
      return next({
        code: 'START_APP_ERROR',
        message: err.stack || err.message || err
      });
    }
    detailInfos.push(info);
    detailInfos.push('[' + new Date() + '] Mount the Package of ' + appid + 'Success');
    res.json({
      code: 'SUCCESS',
      data: detailInfos
    });
  });
};

exports.reloadApp = function (req, res, next) {
  let appid = req.params.appid;

  message.send({
    action: '$reload',
    arguments: [appid]
  }, function (err) {
    if (err) {
      return next({
        code: err.code,
        message: err.message
      });
    }
    return res.json({code: 'SUCCESS'});
  });
};

exports.restartApp = function (req, res, next) {
  let appid = req.params.appid;
  let detailInfos = [];
  let appPkgDir = path.join(config.appsRoot, appid);
  async.waterfall([
    function (callback) {
      message.send({
        action: '$unmount',
        arguments: [appid]
      }, function (err) {
        err = err && err.code === 'APP_NOT_MOUNTED' ? null : err;
        err && log.error(err);
        callback(err);
      });
    },
    function (callback) {
      detailInfos.push('[' + new Date() + '] Starting mount the app: ' + appid);
      message.send({
        action: '$mount',
        arguments: [
          appid, {
            dir: appPkgDir
          }
        ]
      }, callback);
    }
  ], function (err, info) {
    if (err) {
      return next({
        code: 'RESTART_APP_ERROR',
        message: err.stack || err.message || err
      });
    }
    detailInfos.push(info);
    detailInfos.push('[' + new Date() + '] Mount the Package of ' + appid + 'Success');
    res.json({
      code: 'SUCCESS',
      data: detailInfos
    });
  });
};

function findApps(path, callback) {
  let map = {};
  // apps from disk, scan appsRoot
  try {
    let files = fs.readdirSync(path);
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      if (/\.tgz$/.test(file)) {
        let stat = fs.statSync(path + '/' + file);
        let birthtime = new Date(stat.birthtime).toLocaleString();
        let appId = file.substring(0, file.length - 4);
        let info = utils.parseAppId(appId);
        map[appId] = {
          appId: appId,
          name: info.name,
          version: info.version,
          buildNum: info.buildNum,
          publishAt: birthtime,
          status: 'offline'
        };
      }
    }
  } catch (e) {
    log.error('scanning apps on disk error:', e);
    return callback(e);
  }
  findOnlineApps(function (err, info) {
    if (err) {
      return callback(err);
    }
    info.forEach(function (v) {
      let origin = map[v.appId];
      // JSON stringify and parse to delete the undefined property
      map[v.appId] = _.assign(origin, JSON.parse(JSON.stringify(v)));
    });

    let apps = [];
    Object.keys(map).forEach(function (k) {
      apps.push(map[k]);
    });
    // let mergedApps = mergeApps(apps);
    callback(null, apps);
  });
}

function findOnlineApps(callback) {
  message.send({
    action: '$list',
  }, function (err, info) {
    if (err) {
      log.error('rpc call $list failed:', err);
      return callback(err);
    }
    let apps = [];
    Object.keys(info).forEach(function (k) {
      let data = info[k];
      apps.push({
        appId: data.appId,
        name: data.name,
        version: data.version,
        buildNum: data.buildNum,
        workerNum: data.workerNum,
        expectWorkerNum: data.expectWorkerNum,
        status: data.status,
        errorExitCount: data.errorExitCount,
        errorExitRecord: data.errorExitRecord,
        isCurrWorking: data.isCurrWorking,
        extra: data.extra || {}
      });
    });
    callback(null, apps);
  });
}

exports.listApps = function (req, res, next) {
  findApps(config.appsRoot, function (err, apps) {
    if (err) {
      return next({
        code: err.code || 'QUERY_APPLIST_ERROR',
        message: err.message || err
      });
    }
    res.json(apps);
  });
};

exports.publishApp = function (req, res, next) {
  var nostart = req.query.nostart;
  var form = new formidable.IncomingForm();
  form.uploadDir = config.appsRoot;
  var appId = null;
  async.waterfall([
    function (callback) {
      form.parse(req, function (err, fields, files) {
        if (err) {
          err.message = 'uploading app package failed, ' + err.message;
          return callback(err);
        }
        let pkg = files.pkg || files.file;
        var fileName = pkg.name;
        appId = fileName.substring(0, fileName.length - 4); // 4 === '.tgz'.length
        let error = utils.checkAppId(appId);
        if (err) {
          return callback(error);
        }
        fs.renameSync(pkg.path, config.appsRoot + '/' + fileName);
        callback(null, fileName);
      });
    },
    function (fileName, callback) {
      utils.exec('tar zxfm ' + fileName, {cwd: config.appsRoot, maxBuffer: 64 * 1024 * 1024}, callback);
    },
    function (rows, callback) {
      if (nostart) {
        callback(null);
      } else {
        message.send({
          action: '$mount',
          arguments: [
            appId, {
              dir: config.appsRoot + '/' + appId
            }
          ]
        }, callback);
      }
    }
  ], function (err) {
    if (err) {
      let msg = err.message || err.stack || err;
      log.error('publish app failed', msg);
      res.statusCode = 500;
      return next({
        code: 'PUBLISH_APP_FAILED',
        message: msg
      });
    } else {
      return res.json({
        code: 'SUCCESS'
      });
    }
  });
};

/**
 * 获取 app 的配置
 */
exports.getAppConfig = function (req, res) {
  let appName = req.params.appName;
  let type = req.params.type;
  let configFile = getResolvedFile(type, appName);
  fs.readFile(configFile, function (err, data) {
    if (err && err.code !== 'ENOENT') {
      log.error('read config file error', err);
      return res.json({code: 'ERROR', message: err.message});
    }
    let cfg;
    try {
      cfg = JSON.parse(data || '{}');
    } catch (e) {
      return res.json({code: 'ERROR', message: 'config file format error:' + e.message});
    }
    res.json({code: 'SUCCESS', data: cfg});
  });
};

/**
 * 更新 app 的配置
 */
exports.setAppConfig = function (req, res, next) {
  let appName = req.params.appName;
  let type = req.params.type;
  let configFile = getResolvedFile(type, appName);
  let cfg = req.body;

  cfg = utils.encryptObject(cfg, config.configSecret);

  fs.save(configFile, JSON.stringify(cfg, null, 2), function (err) {
    if (err) {
      return next({
        code: 'ERROR',
        message: err.message
      });
    }
    /**
     * reload config
     */
    config.reload();
    /**
     * update
     */
    gatherUsage();
    /**
     * tell master config changed
     */
    message.send({
      action: '$reloadConfig'
    }, function (err) {
      if (err) {
        return next({
          code: 'ERROR',
          message: 'reload master Config error' + err.message
        });
      }
      res.json({code: 'SUCCESS'});
    });
  });
};

exports.cleanAppExitRecord = function (req, res, next) {
  message.send({
    action: '$cleanExitRecord',
    arguments: [req.params.appid]
  }, function (err) {
    if (err) {
      return next({
        code: 'ERROR',
        message: 'clean app exit record failed: ' + (err.message || err)
      });
    }
    res.json({code: 'SUCCESS'});
  });
};

function getResolvedFile(type, appName) {
  let resolved;
  if (type === 'server') {
    switch (appName) {
      case 'common':
        resolved = path.join(config.serverRoot, 'conf/common.json');
        break;
      case 'server':
        resolved = path.join(config.serverRoot, 'conf/server.json');
    }
  } else {
    switch (appName) {
      case 'common':
        resolved = path.join(config.serverRoot, 'conf/common.json');
        break;
      case 'config_server':
        resolved = path.join(config.serverRoot, 'conf/server.json');
        break;
      default:
        resolved = path.join(config.serverRoot, `conf/apps/${appName}.json`);
        break;
    }
  }
  return resolved;
}

/**
 * 单机上线 (健康检查)
 */
exports.online = function (req, res, next) {
  message.send({
    action: '$online',
    arguments: []
  }, function (err) {
    if (err) {
      return next({
        code: 'ERROR',
        message: 'online server failed: ' + (err.message || err)
      });
    } else {
      res.json({code: 'SUCCESS'});
    }
  });
};
/**
 * 单机下线 (健康检查)
 */
exports.offline = function (req, res, next) {
  message.send({
    action: '$offline',
    arguments: []
  }, function (err) {
    if (err) {
      return next({
        code: 'ERROR',
        message: 'offline server failed: ' + (err.message || err)
      });
    } else {
      res.json({code: 'SUCCESS'});
    }
  });
};

/**
 * 检查 coredump 文件
 */
exports.listCoreDump = function (req, res) {
  let honeycombRoot = path.join(__dirname, '../../../');
  let list = fs.readdirSync(honeycombRoot);
  let coreList = [];
  list.forEach((v) => {
    if (/^core.\d+$/.test(v)) {
      coreList.push(v);
    }
  });
  res.json({code: 'SUCCESS', data: coreList});
};

/**
 * 清理 coredump 文件
 */
exports.deleteCoreDump = function (req, res, next) {
  let files = req.body.files;
  let honeycombRoot = path.join(__dirname, '../../../');

  async.eachSeries(files, function (file, done) {
    if (!/^core.\d+$/.test(file)) {
      return done(new Error('unknow core dump file:' + file));
    }
    fs.unlink(path.join(honeycombRoot, file), done);
  }, function (err) {
    if (err) {
      next({
        code: 'ERROR',
        message: err.message
      });
    } else {
      res.json({
        code: 'SUCCESS'
      });
    }
  });
};

/**
 * ps 检查进程
 */
function listProcessors(callback) {
  async.waterfall([
    function (done) {
      message.send({
        action: '$getAppPids'
      }, function (err, data) {
        if (err) {
          return done(err);
        }
        let pidsFromHoneycomb = {};
        Object.keys(data).forEach(function (appId) {
          let pidLists = data[appId];
          pidLists.forEach((id) => {
            pidsFromHoneycomb[id] = true;
          });
        });
        done(null, pidsFromHoneycomb);
      });
    },
    function (pidsFromHoneycomb, done) {
      // let cmd = 'ps aux|grep "./node_modules/.bin/node" | grep runtime.js | grep -v grep';
      let cmd = 'ps aux|grep "bin/node " | grep "./lib/run.js" | grep -v grep';
      utils.exec(cmd, function (err, std) {
        if (err) {
          return done(err);
        }
        let lines = std[0].toString().trim().split(/\n/);
        let unknowPids = [];
        lines.forEach((line) => {
          let tmp = line.trim().split(/\s+/);
          let pid = tmp[1];
          if (!pidsFromHoneycomb[pid]) {
            unknowPids.push({
              pid: pid,
              info: line
            });
          }
        });
        done(null, unknowPids);
      });
    }
  ], callback);
}

exports.listUnknowProcess = function (req, res, next) {
  listProcessors(function (err, pids) {
    if (err) {
      return next({
        code: 'ERROR',
        message: err.message
      });
    } else {
      res.json({
        code: 'SUCCESS',
        data: pids
      });
    }
  });
};

exports.killUnknowProcess = function (req, res, next) {
  let pidsShouldKill = req.params.pid.trim().split(',');
  listProcessors(function (err, unknowPids) {
    let unknowPidsMap = {};
    unknowPids.forEach((proc) => {
      unknowPidsMap[proc.pid] = true;
    });
    async.eachSeries(pidsShouldKill, function (pid, done) {
      if (unknowPidsMap[pid] >= 0) {
        utils.exec('kill -9 ' + pid, done);
      } else {
        done(new Error('pid is not a unknow process:' + pid));
      }
    }, function (err) {
      if (err) {
        return next({
          code: 'ERROR',
          message: err.message
        });
      } else {
        res.json({
          code: 'SUCCESS'
        });
      }
    });
  });
};

