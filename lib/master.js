'use strict';

/* istanbul ignore else */
if (
  typeof process.setuid === 'function' &&
  typeof process.setgid === 'function' &&
  typeof process.getuid === 'function' &&
  typeof process.getgid === 'function'
) {
  process.setuid(process.getuid());
  process.setgid(process.getgid());
}

const fs = require('xfs');
const _ = require('lodash');
const path = require('path');
// const util = require('util');
const async = require('async');
const EventEmitter = require('events');

const Proxy = require('./proxy');
const Child = require('./child');
const Session = require('./session');
const log = require('../common/log');
const message = require('./message');
const messageWorker = require('./message_worker');
const utils = require('../common/utils');
const Worker = require('./worker');

const APPID_PROXY = '__PROXY__';
const APPID_ADMIN = '__ADMIN__';

let FLAG_MASTER = 'MASTER';

/**
 * Class Master
 * @param {Object} config
 *        - runDir
 *        - pidFile
 *        - workers
 */
class Master extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.online = true;
    this.flagExit = false;
    this.flagHealthCheck = false;
    /**
     * app的运行时状态
     * @type {Object}
     *       key: appName
     *       value: Child instance
     */
    this.children = {};
    /**
     * worker类型的app，主要是内部的一些服务
     * @type {Object}
     */
    this.workers = {};
    this.adminApiFile = path.join(__dirname, '../lib/admin');
    // this.proxyFile = path.join(__dirname, '../lib/proxy');
    this.appSession = new Session({file: config.appsSessionPath});

    this.startTime = new Date().getTime();

    process.nextTick(() => {
      this.emit('ready');
    });
  }
}

Master.prototype.init = function (done) {
  // init run dir, and write down pid file
  utils.mkdirp(this.config.runDir);
  utils.mkdirp(this.config.appsRoot);
  utils.mkdirp(path.join(this.config.proxy.nginxIncludePath, 'http'));
  utils.mkdirp(path.join(this.config.proxy.nginxIncludePath, 'stream'));
  fs.writeFileSync(this.config.pidFile, process.pid.toString());
  fs.writeFileSync(this.config.serverStatusFile, 'online');
  let self = this;

  function shutdown(sig, err) {
    // eslint-disable-next-line
    console.error(FLAG_MASTER, `server received ${sig}, will shutdown.`, err ? (err.stack || err) : 'unknow error');
    self.exit(function () {
      process.exit(1);
    });
  }

  process.on('uncaughtException', function (err) {
    shutdown('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason, p) => {
    log.error('UnhandledRejection', `at: Promise ${p}, reason: ${reason}`);
  });
  // 服务上下线信号，收到信号之后，广播各app, 切换上下线状态
  // SIGUSR2 can be code: 31|12|17, using `kill -l` to check which code in your system
  process.on('SIGUSR2', () => {
    let status;
    try {
      status = fs.readFileSync(this.config.serverStatusFile).toString();
    } catch (e) {
      status = '';
    }
    switch (status) {
      case 'online':
        this.$online();
        break;
      case 'offline':
        this.$offline();
        break;
      default:
        // log.warn(FLAG_MASTER, 'unknow SIGUSR2', status);
    }
    return false;
  });
  // 终端指令关闭进程 kill -15
  process.on('SIGTERM', function () {
    shutdown('SIGTERM');
  });
  // 终端退出时
  process.on('SIGHUB', function () {
    shutdown('SIGHUB');
  });
  process.on('SIGQUIT', function () {
    shutdown('SIGQUIT');
  });
  // Ctrl-C 退出
  process.on('SIGINT', function () {
    shutdown('SIGINT');
  });
  process.on('SIGABRT', function () {
    let err = 'recived system abort request,maybe system resouce was bleeding.please check you machine resouce: ram, hard driver, io socket...';
    shutdown('SIGABRT', err);
  });

  /**
   * 监听app_ready事件
   * @param  {Object} message
   *         type: stream, http, daemon, job
   * @param  {Function} done
   */
  this.on('app_ready', function (cfg, done) {
    log.info(FLAG_MASTER, `app:${cfg.appId} ready, type: ${cfg.type}`);
    // 内置app
    if ([APPID_PROXY, APPID_ADMIN].indexOf(cfg.appId) !== -1) {
      return done();
    }
    if (!cfg.target && !cfg.type) {
      cfg.type = 'daemon';
    }
    /*
    if (cfg.type === 'daemon' || !cfg.type || !cfg.target) {
      log.warn(FLAG_MASTER, `app_without_target : "${cfg.appId}", is a daemon or a job`);
      // if no target, so this is an daemond app, not a web app
      return done();
    }
    */
    self.proxy.register(cfg, done);
  });
  done();
};

Master.prototype.getChild = function (appId) {
  return this.children[appId];
};
Master.prototype.addChild = function (child) {
  let appId = child.appId;
  child.once('stop', () => {
    child.removeAllListeners();
    delete this.children[appId];
  });
  this.children[appId] = child;
};
Master.prototype.getWorker  = function (appId) {
  return this.workers[appId];
};
Master.prototype.addWorker  = function (worker) {
  let appId = worker.appId;
  worker.once('stop', () => {
    delete this.workers[appId];
  });
  this.workers[appId] = worker;
};

/**
 * only remove child from master.children
 * if you need stop child, you should do it manually
 * @param  {String} appId
 *
Master.prototype.removeChild = function (appId) {
  delete this.children[appId];
};
*/

/**
 * 启动子进程
 * @param  {String}   appKey    appName like `appabc_1.0.0`
 * @param  {Object}   options
 *         - file {Path} the app enter file
 *         - appId
 *
 * @param  {Function} cb(err)
 */
Master.prototype._fork = function (appId, options, cb) {
  let callbackOnce = false;
  options.appId = appId;
  options.appRoot = options.dir;
  options.timeout = this.config.appReadyTimeout;
  let child = this.children[appId];
  if (child && child.status !== 'offline') {
    return cb(new Error(appId + ' already exists, Options: ' + JSON.stringify(options)));
  } else {
    child = new Child(appId);
  }
  // cb1, app成功启动
  child.on('ready', (message) => {
    this.emit('app_ready', message, () => {
      /* istanbul ignore else */
      if (callbackOnce === false) {
        callbackOnce = true;
        cb && cb(null, message);
      }
    });
  });
  // cb2, app启动失败，进程退出
  child.on('worker_exit', (info) => {
    if (callbackOnce === false) {
      cb && cb(info);
      callbackOnce = true;
    }
  });

  child.on('message', (childProc, msg) => {
    message.receive(msg, childProc, this);
  });

  child.on('error', (err) => {
    log.error(`child ${appId} error`, err);
  });
  /**
   * @param {Object} options
   *   - file
   *   - appId
   *   - config
   */
  child.start(options);
  this.addChild(child);
  return child;
};

Master.prototype._forkWorker = function (appId, options, cb) {
  let callbackOnce = false;
  options.appId = appId;
  options.appRoot = options.dir;
  options.timeout = this.config.appReadyTimeout;
  let worker = this.workers[appId];
  if (worker && worker.status !== 'offline') {
    return cb(new Error(appId + ' already exists, Options: ' + JSON.stringify(options)));
  } else {
    worker = new Worker(appId);
  }

  try {
    options.file = require.resolve(options.dir);
  } catch (e) {
    return cb(new Error('enter_file_not_found : when master._forkWorker() App Dir: ' + options.dir + ', please check app\'s package.json `main` property'));
  }
  // cb1, app成功启动
  worker.on('ready', (message) => {
    this.emit('app_ready', message, () => {
      /* istanbul ignore else */
      if (callbackOnce === false) {
        callbackOnce = true;
        cb && cb(null, message);
      }
    });
  });
  // cb2, app启动失败，进程退出
  worker.on('worker_exit', (info) => {
    if (callbackOnce === false) {
      cb && cb(info);
      callbackOnce = true;
    }
  });

  worker.on('message', (worker, msg) => {
    messageWorker.receive(msg, worker, this);
  });

  worker.on('error', (err) => {
    log.error(`worker ${appId} error`, err);
  });

  /**
   * @param {Object} options
   *   - file
   *   - appId
   *   - config
   */
  worker.start(options);
  this.addWorker(worker);
  return worker;
};

Master.prototype.run = function (cb) {
  const fns = [
    this.init.bind(this),
    this.initAdmin.bind(this),
    this.initProxy.bind(this)
  ];
  fns.push(this.initApps.bind(this));
  async.series(fns, (err) => {
    if (err) {
      cb(err);
    } else {
      let healthCheck = this.config.proxy.healthCheck;
      // old health check
      if (healthCheck.file) {
        fs.sync().save(healthCheck.file, 'success');
      }
      // new health check
      this.healthCheckOn('honeycomb-server-ready-action');
      cb(null);
    }
  });
};


/**
 * 启动admin进程
 * @param  {Function} cb(err)
 */
Master.prototype.initAdmin = function (cb) {
  log.info(FLAG_MASTER, `starting_worker : ${APPID_ADMIN}`);
  this.admin = this._forkWorker(APPID_ADMIN, {
    name: APPID_ADMIN,
    dir: this.adminApiFile,
    config: _.assign(this.config.admin, {
      appId: APPID_ADMIN,
      noPersistent: true
    })
  }, cb);
};
/**
 * 启动proxy进程
 * @param  {Function} cb [description]
 * @return {[type]}      [description]
 */
Master.prototype.initProxy = function (cb) {
  this.proxy = new Proxy(this.config.proxy);
  cb();
};

/**
 * 从session中恢复app
 * @param  {Function} cb(err)
 */
Master.prototype.initApps = function (cb) {
  let apps = this.appSession.apps();

  if (Object.keys(apps).length === 0) {
    return cb();
  }
  let arr = [];

  for (let k in apps) {
    arr.push([k, apps[k], apps[k].order || 1000]);
  }

  /**
   * app在发布之后，会记录下来其order
   * 按顺序启动
   */
  arr.sort(function (a, b) {
    if (a[2] > b[2]) {
      return 1;
    } else {
      return -1;
    }
  });

  async.eachSeries(arr, (item, done) => {
    // check if app dir is ready
    let appId = item[0];
    let options = item[1];

    let pkg = appId + '.tgz';

    fs.stat(path.join(this.config.appsRoot, pkg), (err) => {
      if (err) {
        return done(new Error(`app ${appId} not exists`));
      }
      fs.stat(path.join(this.config.appsRoot, appId), (err) => {
        if (err) {
          utils.untar(pkg, this.config.appsRoot, (err) => {
            if (err) {
              log.error(`untar ${pkg} faild`, err.message);
              return done(err);
            }
            this.$mount(appId, options, function (err) {
              err && log.error(FLAG_MASTER, `start_app_failed : ${appId}`, err);
              done(null);
            });
          });
        } else {
          this.$mount(appId, options, function (err) {
            err && log.error(FLAG_MASTER, `start_app_failed : ${appId}`, err);
            done(null);
          });
        }
      });
    });
  }, cb);
};

/**
 * 退出服务
 */
Master.prototype.exit = function (cb) {
  if (this.flagExit) {
    return cb && cb(new Error('master is shutting down'));
  }
  this.flagExit = true;
  log.info(FLAG_MASTER, 'server is shutting down....');
  if (this.config.proxy.healthCheck &&
    this.config.proxy.healthCheck.file) {
    fs.sync().rm(this.config.proxy.healthCheck.file);
  }

  let children = this.children;
  async.eachOfSeries(children, (child, appId, done) => {
    if (!this.proxy) {
      return child.stop(done);
    }
    this.proxy.unregister(child.workerConfig, () => {
      child.stop(done);
    });
  }, () => {
    this.children = {};
    let workers = this.workers;
    async.eachOfSeries(workers, (worker, appId, done) => {
      worker.stop(done);
    }, () => {
      this.admin = null;
      this.proxy = null;
      fs.sync().rm(this.config.pidFile);
      fs.sync().rm(this.config.serverStatusFile);
      log.warn(FLAG_MASTER, 'server_stoped');
      cb && cb();
    });
  });
};

Master.prototype.$config = function (cb) {
  cb(null, this.config);
};

Master.prototype.$healthCheck = function (cb) {
  let totalApps = 0;
  let count = 0;
  const children = this.children;

  if (!this.flagHealthCheck) {
    return cb(null, ['hoenycomb-server offline']);
  }
  let errs = [];
  function done(err, appId) {
    count++;
    if (err) {
      errs.push(appId + ':' + err);
    }
    if (totalApps == count) {
      cb(null, errs);
    }
  }
  let appIds = Object.keys(children);
  totalApps = appIds.length;
  for (let i = 0; i < totalApps; i++) {
    let appId = appIds[i];
    if (appId === APPID_PROXY || appId === APPID_ADMIN) {
      totalApps--;
      continue;
    }
    children[appId].healthCheck(done);
  }
  if (totalApps == 0) {
    cb(null, ['honeycomb-server-empty']);
  }
};

// 健康检查软开关，开启，健康检查按正常app检查流程走
Master.prototype.healthCheckOn = function (appId) {
  this.flagHealthCheck = true;
  log.warn(FLAG_MASTER, 'healthcheck on for app:', appId);
  if (this.config.proxy.healthCheck.file) {
    try {
      fs.writeFileSync(this.config.proxy.healthCheck.file, '');
    } catch (e) {
      log.error('switch online server error:' + e.message);
    }
  }
};
// 健康检查软开关, 关闭，健康检查失败
Master.prototype.healthCheckOff = function (appId) {
  this.flagHealthCheck = false;
  log.warn(FLAG_MASTER, 'healthcheck off for app:', appId);
  if (this.config.proxy.healthCheck.file) {
    try {
      fs.unlinkSync(this.config.proxy.healthCheck.file);
    } catch (e) {
      log.error('switch online server error:' + e.message);
    }
  }
};

Master.prototype.$list = function (cb) {
  const apps = {};
  const children = this.children;
  let onlineApps = {};
  for (let appId in children) {
    let cc = children[appId];
    let appInfo = {
      pid: cc.options.pid,
      name: cc.options.name,
      version: cc.options.version,
      expectWorkerNum: cc.options.processorNum,
      workerNum: cc.getPid().length,
      buildNum: cc.options.buildNum,
      appId: cc.options.appId,
      status: cc.status,
      exitCount: cc.exitCount,
      errorExitCount: cc.errorExitCount,
      errorExitRecord: cc.errorExitRecord,
      framework: cc.options.framework
    };

    if (cc.options.target) {
      let extra = {};
      let keys = this.config.appExtraInfo;
      keys.forEach((key) => {
        extra[key] = cc.options[key];
      });
      extra.bind = extra.bind || this.config.proxy.port;
      appInfo.extra = extra;
    }
    let name = appInfo.name;

    if (!onlineApps[name]) {
      onlineApps[name] = appId;
    }
    let lastAppId = onlineApps[name];
    if (cc.options.weight > children[lastAppId].options.weight) {
      onlineApps[name] = appId;
    }
    apps[appId] = appInfo;
  }
  for (let name in onlineApps) {
    let appId = onlineApps[name];
    apps[appId].isCurrWorking = true;
  }
  return cb && cb(null, apps);
};

/**
 * 获取app的配置信息
 * @return {Object}
 */
Master.prototype.getAppConfig = function (appName) {
  let appsConfig = this.config.apps[appName];
  let commonConfig = this.config.appsCommon;
  return _.merge({}, commonConfig, appsConfig);
};

Master.prototype.getAppPkg = function (appDir) {
  let pkg;
  try {
    // read file but not require file, so package.json will not cached
    pkg = JSON.parse(fs.readFileSync(path.join(appDir, './package.json')));
  } catch (e) {
    pkg = {};
  }
  return pkg;
};

Master.prototype.stopChildrenByAppName = function (appName, cb) {
  const children = this.children;
  let total = 0;
  let count = 0;
  function done() {
    count++;
    if (count == total) {
      cb();
    }
  }
  for (let appId in children) {
    if (appId === APPID_PROXY || appId === APPID_ADMIN) {
      continue;
    }
    let child = children[appId];
    if (child.options.name == appName) {
      total += 1;
      this.$unmount(appId, done);
    }
  }
  if (total == 0) {
    cb();
  }
};
/**
 * 挂载app
 * @param  {String}   appId app_2.0.1_1
 * @param  {Object}   config {dir: xxxx}
 * @param  {Function} cb(err)
 */
Master.prototype.$mount = function (appId, options, cb) {
  log.info(FLAG_MASTER, `mount_app : ${appId}`);
  if (!options.dir || !appId) {
    let err = new Error('$mount missing param. appId: ' + appId + ', options: ' + JSON.stringify(options));
    err.code = 'PARAM_MISSING';
    return cb(err);
  }

  let privateConfig = this.reloadAppConfig(appId, options);
  let appOptions = privateConfig.honeycomb;
  let appInfo = utils.parseAppId(appId);


  /**
   * check if app need to stop old app first
   */
  if (appOptions.killCurrentBeforeMount) {
    // kill current version
    let name = appInfo.name;
    // stop child by AppName
    this.healthCheckOff(appId);
    setTimeout(() => {
      this.stopChildrenByAppName(name, doFork.bind(this));
    }, this.config.proxy.healthCheck.duration);
  } else {
    doFork.bind(this)();
  }

  function doFork() {
    /**
     * resolve app entry file
     */
    let file;
    if (appOptions.service) {
      file = path.join(options.dir, appOptions.main || '');
    } else {
      try {
        file = require.resolve(options.dir);
      } catch (e) {
        return cb(new Error('enter_file_not_found : when master._fork() App Dir: ' + options.dir + ', please check app\'s package.json `main` property'));
      }
    }
    this._fork(appId, {
      config: privateConfig,
      dir: options.dir,
      file: file,
      processorNum: appOptions.processorNum,
      healthCheck: appOptions.healthCheck,
      /**
       * service:
       *  exec {Path}
       *  argv {Array}
       *  bind {Array|String|Number} 80, [80, 8080], '192.168.1.1:8080', ['192.168.1.1:8080']
       *  serverName {Array|String} 域名
       *  router {String}
       *  type {emun} 'http' [default] | 'stream'
       *  upstream: 'unixDomainSock' [default] | 'port'
       */
      service: appOptions.service,
      job: appOptions.job
    }, (err) => {
      if (!err && !options.noPersistent) {
        this.appSession.set(appId, {
          dir: options.dir,
          order: appOptions.order || options.order || 1000
        });
      }
      this.healthCheckOn(appId);
      cb && cb(err, err ? 'mount app failed' : 'mount app success');
    });
  }
};

/**
 * 卸载app
 * @param  {String}   appId
 * @param  {Function} cb(err)
 */
Master.prototype.$unmount = function (appId, cb) {
  let child = this.children[appId];
  if (appId === APPID_PROXY || appId == APPID_ADMIN) {
    let err = new Error('Internal app, can not remove');
    err.code = 'APP_FORBIDDEN_MOUNT';
    return cb(err);
  }
  if (!child) {
    let err = new Error('App is not mounted: ' + appId);
    err.code = 'APP_NOT_MOUNTED';
    return cb(err);
  }
  log.info(FLAG_MASTER, `unmout_app : ${appId}`);

  let cfg = child.workerConfig;
  let self = this;

  function done() {
    self.appSession.remove(appId);
    child.stop((err) => {
      cb && cb(err, 'unmount app success');
    });
    delete self.children[appId];
  }

  // app not ready
  if (!cfg.appId) {
    return done();
  }

  this.proxy.unregister(cfg, (err) => {
    if (err) {
      return cb && cb(err);
    }
    done();
  });
};

/**
 * 重载app
 */
Master.prototype.$reload = function (appId, cb) {
  let child = this.children[appId];
  if (!child) {
    let err = new Error('App is not mounted: ' + appId);
    err.code = 'APP_NOT_MOUNTED';
    return cb(err);
  }
  if (child.options.config.honeycomb.killCurrentBeforeMount) {
    // do restart app instead
    this.$unmount(appId, ()=> {
      this.$mount(appId, options, cb);
    });
    return;
  }
  /**
   * reload config
   */
  let options = this.appSession.get(appId);
  if (!options) {
    options = {
      dir: this.children[appId].options.dir
    };
  }
  let privateConfig = this.reloadAppConfig(appId, options);
  let appOptions = privateConfig.honeycomb;

  child.options.config = privateConfig;
  child.options.order = privateConfig.honeycomb.order;
  child.options.processorNum = privateConfig.honeycomb.processorNum;
  child.options.healthCheck = appOptions.healthCheck;

  child.reload((err, done) => {
    if (err) {
      return cb(err);
    }
    /**
     * 独立触发updateRouter，目的是为了捕获proxy更新的异常
     * 并通知到用户
     */
    this.proxy.updateRouter(child.options, (err) => {
      log.info(FLAG_MASTER, 'router reloaded');
      done(err);
      cb(err);
    });
    // wait realod finish, just for test,no effect in production.
    // setTimeout(cb, 500);
  });
};

// reload app config, will reload app config in server/common/app/package.json
Master.prototype.reloadAppConfig = function (appId, appMountCfg) {
  // reload config
  try {
    this.config.reload();
  } catch (e) {
    log.warn('$mount() reload config error', e);
  }

  let pkg = this.getAppPkg(appMountCfg.dir);
  let appInfo = utils.parseAppId(appId);
  let privateConfig = this.getAppConfig(appInfo.name);
  let processorNum; // default processNum
  let order;

  if (!privateConfig.honeycomb) {
    privateConfig.honeycomb = {};
  }

  /**
   * config from package.json
   */
  let appOptions = pkg.honeycomb || pkg.dtboost || {};
  processorNum = Number(appOptions.processorNum) || 1;
  order = Number(appOptions.order) || 1000;


  /**
   * prepare appOptions.serverParam
   */
  if (appOptions.serverParam) {
    privateConfig.honeycomb.serverParam = _.merge({}, appOptions.serverParam, privateConfig.honeycomb.serverParam);
  }
  /**
   * merge env from package.json
   */
  if (appOptions.env) {
    privateConfig.honeycomb.env = _.merge({}, privateConfig.honeycomb.env, appOptions.env);
  }
  /**
   * merge healthCheck from package.json
   */
  if (appOptions.healthCheck) {
    privateConfig.honeycomb.healthCheck = _.merge({}, privateConfig.honeycomb.healthCheck, appOptions.healthCheck);
  }

  /**
   * config from app's private config
   */
  if (privateConfig.honeycomb.processorNum == undefined) {
    privateConfig.honeycomb.processorNum = processorNum;
  }
  if (privateConfig.honeycomb.order == undefined) {
    privateConfig.honeycomb.order = order;
  }

  /** JOB type app */
  if (appOptions.job) {
    appOptions.job.name = appInfo.name;
    appOptions.job.version = appInfo.version || '0.0.1';
    appOptions.job.buildNum = appInfo.build || 1;
  }
  if (appOptions.service) {
    appOptions.service.name = appInfo.name;
    appOptions.service.version = appInfo.version || '0.0.1';
    appOptions.service.buildNum = appInfo.build || 1;
    if (privateConfig.bind) {
      appOptions.service.bind = privateConfig.bind;
    }
    if (privateConfig.serverName) {
      appOptions.service.serverName = privateConfig.serverName;
    }
    if (privateConfig.router) {
      appOptions.service.router = privateConfig.router;
    }
  }
  privateConfig.honeycomb = _.merge(appOptions, privateConfig.honeycomb);
  privateConfig.honeycomb.main = pkg.main;

  return privateConfig;
};
/**
 * 服务上下线，控制健康检查用
 */
Master.prototype.$online = function (cb) {
  cb = cb || (() => {});
  this.healthCheckOn('honeycomb-server-online-action');
  this.online = true;
  cb();
};
/**
 * 服务上下线，控制健康检查用
 */
Master.prototype.$offline = function (cb) {
  cb = cb || (() => {});
  this.healthCheckOff('honeycomb-server-offline-action');
  this.online = false;
  cb();
};

Master.prototype.$restartAdmin = function (cb) {
  this.admin.stop();
  setTimeout(() => {
    this.initAdmin(cb);
  }, 500);
};

Master.prototype.$status = function (cb) {
  let apps = {};
  let ref = this.children;
  for (let child in ref) {
    apps[child] = {
      exitCount: ref[child].exitCount,
      errorExitCount: ref[child].errorExitCount,
      errorExitRecord: ref[child].errorExitRecord
    };
  }

  cb(null, {
    startTime: this.startTime,
    runningTime: new Date().getTime() - this.startTime,
    online: this.online,
    apps: apps
  });
};

Master.prototype.$cleanExitRecord = function (appId, cb) {
  let child = this.children[appId];
  if (child) {
    child.errorExitRecord = [];
    child.errorExitCount = 0;
    cb(null);
  } else {
    cb(new Error('appid:' + appId + ' not found'));
  }
};

/**
 * 获取所有进程的pid, 统计性能用
 * @param  {Function} cb [description]
 */
Master.prototype.$getAppPids = function (cb) {
  let children = this.children;
  /**
   * @type {Object}
   * {
   *  'admin_3.0.1_1': [4047],
   *  'system_2.3.11_1': [4045],
   *  'example_2.0.0_2': [4049, 4050],
   *  __PROXY__: [4043, 4044],
   *  __ADMIN__: [4042]
   * }
   */
  let results = {};
  for (let appId in children) {
    let child = children[appId];
    let aid = child.appId;
    let pid = child.getPid();
    if (!pid) {
      continue;
    }
    results[aid] = pid;
  }
  // append master pid
  results['__MASTER__']  = [process.pid];
  cb(null, results);
};
/**
 * 重载server的配置信息
 * 此动作将重新加载包括 conf/config_default, conf/config, common.json, server.json, apps/*.json
 * @param  {Function} cb [description]
 * @return {[type]}      [description]
 */
Master.prototype.$reloadConfig = function (cb) {
  try {
    this.config.reload();
  } catch (e) {
    return cb(e);
  }
  this.proxy && this.proxy.init(this.config.proxy);
  cb(null);
};

Master.prototype.$deleteAppPids = function (appId, cb) {
  Child.deleteAppPids(appId);
  cb(null);
};

Master.prototype.$getAppIdByPids = function (pids, cb) {
  let res = {};
  pids.forEach((pid) => {
    res[pid] = Child.getAppIdByPid(pid);
  });
  cb(null, res);
};

module.exports = Master;
