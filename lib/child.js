'use strict';
const fs = require('fs');
const net = require('net');
const _ = require('lodash');
const async = require('async');
const path = require('path');
const childProcess = require('child_process');
const EventEmitter = require('events');
const config = require('../config');
const log = require('../common/log');
const message = require('./message');
const FLAG_CHILD = 'CHILD';
const utils = require('../common/utils');
const LiteLog = require('litelog');

let minPort = 2000;
let maxPort = 20000;
let tagetPortCursor = minPort;

function getPort(cb) {
  let tmp = tagetPortCursor;
  let maxTry = 5000;
  let count = 0;
  function done(bool) {
    count++;
    if (count > maxTry) {
      log.error(FLAG_CHILD, 'get Port failed, reach maxTry');
      return cb(null);
    }
    if (bool) {
      tagetPortCursor = tmp + 1;
      cb(tmp);
    } else {
      tmp += 1;
      if (tmp > maxPort) {
        tmp = minPort;
      }
      checkPort(tmp, done);
    }
  }
  checkPort(tmp, done);
}

/**
 * 检查端口，占用返回 false, 空闲返回 true
 */
function checkPort(port, done) {
  let c = net.connect(port, () => {
    c.destroy();
    done(false);
  });
  c.on('error', (e) => {
    if (e.code === 'ECONNREFUSED') {
      return done(true);
    } else {
      return done(false);
    }
  });
}

let appPids = {};

function saveAppPid(appId, pid) {
  let pids = appPids[appId];
  if (!pids) {
    pids = appPids[appId] = [];
  }
  pids.push(pid);
  if (pids.length > 20) {
    pids.shift();
  }
}

function deleteAppPids(appId) {
  delete appPids[appId];
}

function getAppIdByPid(pid) {
  let aids = Object.keys(appPids);
  for (let i = 0, len = aids.length; i < len; i++) {
    let appId = aids[i];
    let pids = appPids[appId];
    if (pids.indexOf(pid) >= 0) {
      return appId;
    }
  }
}

/**
 * @class Child
 */
class Child extends EventEmitter {
  constructor(appId) {
    super();
    this.appId = appId;

    this.reloadOffset = 0;
    let appInfo = utils.parseAppId(appId);

    this.options = {
      maxRetry: 3,
      pauseAfterFatal: 120000, // 2 minutes
      readyTimeout: 10 * 60 * 1000, // 10 minutes
      processorNum: 1,
      exitWhenTimeout: true,
      timeout: 60000,
      appId: appId,
      name: appInfo.name,
      version: appInfo.version,
      buildNum: appInfo.buildNum,
      weight: utils.genWeight(appInfo.version, appInfo.buildNum),
      service: null, // Object, exec 类型才出现
      appRoot: path.join(config.appsRoot, appId),
      serverRoot: config.serverRoot,
      logRoot: path.join(config.logsRoot, appInfo.name)
    };
    /**
     * worker list {Object}
     */
    this.workers = {};

    this.sockList = [];
    /**
     * record old workers, reloading action will use it
     * @type {Object}
     */
    this.oldWorkers = {};
    /**
     * the worker's config after worker ready
     * @type {Object}
     */
    this.workerConfig = {};
    /**
     * child states
     * @type {String}
     *       init  初始化，启动的时候的状态
     *       online 在线
     *       offline 下线
     *       exception 异常
     *       retry 异常重试中
     *       starting 启动中
     *       stoping 关停中
     *       reload 重新加载中，重新加载不会解压压缩包
     */
    this.status = 'init';
    /**
     * retry timeout  interval id list,
     * sometime more then one worker die,
     * so it should be record into an array
     * @type {Array}
     */
    this.retryTimeoutId = [];

    /**
     * count process exit with error times
     * @type {Number}
     */
    this.errorExitCount = 0;

    /**
     * count process exit with error times
     * this property is working for max retry
     * when reach the max-retry, property will be reseted
     * @type {Number}
     */
    this.fatalCount = 0;
    /**
     * count process exit times
     * @type {Number}
     */
    this.exitCount = 0;

    this.errorExitRecord = [];

    if (!appId.match(/^__.*__$/)) {
      let stdoutFile = path.join(
        config.serverRoot,
        './logs',
        utils.parseAppId(appId).name,
        './stdout.%year%-%month%-%day%.log'
      );
      this.stdout = new LiteLog.Logger('stdout', {
        level: 'DEBUG',
        file: stdoutFile,
        rotation: 60,
        fmt: (obj) => {
          return obj.color(obj.level, obj.time() + ' ' + obj.level) + ' #' + obj.pid + ' ' + obj.msg;
        }
      });
    }

    this.on('worker_ready', (appCfg) => {
      /**
       * format propertites
       */
      if (appCfg.target) {
        appCfg.target = true;
      } else {
        appCfg.type = 'daemon';
      }
      this.workerConfig = this.options;
      /**
       * check if first time ready
       */
      if (this.status === 'stopping') {
        return;
      }
      if (this.checkWorkerReady() && this.status !== 'online') {
        // clearTimeout(this.readyTimeoutId);
        // this.readyTimeoutId = null;
        this.options = _.assign(this.options, appCfg);
        appCfg = this.options;
        appCfg.sockList = this.sockList;
        appCfg.portList = this.getPortList();
        if (this.status === 'reload') {
          this.emit('reloaded', appCfg);
        } else {
          this.status = 'online';
          this.emit('ready', appCfg);
        }
      }
    });

    message.bindGroupMessage(this.appId, (msg, callback) => {
      log.debug(FLAG_CHILD, 'received_broadcast_msg :', msg);
      let workers = this.workers;
      let pids = Object.keys(workers);
      let errs = {};
      let res = {};
      let map = {};
      let flagError = false;

      function checkDone() {
        let flag = true;
        Object.keys(map).forEach(function (k) {
          flag &= map[k];
        });
        log.debug(FLAG_CHILD, 'group_message_check_if_done', map);
        return flag;
      }
      log.debug(FLAG_CHILD, 'broadcast_to_children', pids);
      pids.forEach(function (pid) {
        map[pid] = false;
        message.send({
          action: msg.action,
          data: msg.data,
          target: workers[pid],
          timeout: msg.timeout
        }, function (err, data) {
          if (err) {
            flagError = true;
            errs[pid] = err;
          }
          map[pid] = true;
          res[pid] = data;
          if (checkDone()) {
            callback(flagError ? errs : null, res);
          }
        });
      });
    });
  }

  start(options) {
    this.reloadClusterInfo();
    this.options = _.assign(this.options, options);
    let processorNum = this.options.processorNum;
    /**
     * stop fork workers when child is stopping
     */
    if (this.status === 'stopping') {
      return;
    }

    if (this.status === 'init' || this.status === 'offline') {
      this.status = 'starting';
      if (this.options.service && !this.options.service.exec) {
        let serverParam = {};
        if (this.options.config.honeycomb && this.options.config.honeycomb.serverParam) {
          serverParam = this.options.config.honeycomb.serverParam;
        }
        let staticCfg = this.options.service.static;
        if (staticCfg) {
          Object.keys(staticCfg).forEach((key) => {
            let dir = staticCfg[key].dir ? this._prepareVars(path.join(this.options.appRoot, staticCfg[key].dir)) : '';
            if (dir.indexOf(this.options.appRoot) !== 0) {
              dir = null;
              return;
            }
            if (!dir.endsWith('/')) {
              dir += '/';
            }
            if (key.endsWith('/')) {
              key = key.substr(0, key.length - 1)
            }
            staticCfg[key].dir = dir;
          });
        }
        this.emit('worker_ready', {
          bind: this.options.service.bind,
          noUpstream: true,
          serverName: this.options.service.serverName,
          router: this.options.service.router,
          type: this.options.service.type || 'http',
          static: this.options.service.static,
          target: true,
          param: serverParam
        });
        return;
      }
      this.initTargetSocks(processorNum);
    }

    if (this.options.service || this.options.job) {
      this.flagExec = true;
    }
    /*
    if (!this.readyTimeoutId) {
      this.readyTimeoutId = setTimeout(function () {
        let msg = `app_ready_timeout : ${self.options.appId}`;
        if (self.options.exitWhenTimeout) {
          self.stop();
          msg += ', exit';
        }
        log.error(FLAG_CHILD, msg);
      }, this.options.readyTimeout);
    }
    */
    for (let i = this.getWorkerNum(); i < processorNum; i++) {
      this._create();
    }
  }
  /**
   * reload workers, only online status can enter this action
   */
  reload(cb) {
    this.reloadClusterInfo();
    // 只允许 online 和 exception状态时 执行 reload
    if (this.status !== 'online' && this.status !== 'exception') {
      return cb({
        code: 'SERVER_BUSY',
        messsage: 'server is busy now, status:' + this.status
      });
    }
    if (this.options.service && !this.options.service.exec) {
      return cb(null, function () {});
    }
    this.status = 'reload';
    // clean exception retry
    this.retryTimeoutId.forEach((timeout) => {
      clearTimeout(timeout);
    });

    let newWorkersNum = this.options.processorNum;
    // reset workers
    this.oldWorkers = this.workers;
    this.workers = {};
    // re-assign new sock files
    this.initTargetSocks(newWorkersNum);

    this.once('reload_failed', (err) => {
      cb(err);
    });

    this.once('reloaded', (config) => {
      config.reload = true;
      /**
       * tell master that new workers is ready,
       * master will start reload proxy to let
       * new request send to these new workers
       */
      this.emit('ready', config);
      this.status = 'reloaded';
      /**
       * update router in next-tick, and then wait until nginx reloaded
       */
      process.nextTick(() => {
        cb(null, (err) => {
          /**
           * here nginx reloaded, and callback to kill old workers
           */
          if (err) {
            log.error(FLAG_CHILD, `app_reload_failed : ${this.appId}`, err);
            let workers = this.workers;
            this.cleanWorkers(workers, () => {
              this.status = 'online';
            });
            this.workers = this.oldWorkers;
            this.oldWorkers = {};
          } else {
            log.info(FLAG_CHILD, `app_reload_success : ${this.appId} , now stop old workers`);
            this.cleanWorkers(this.oldWorkers, () => {
              this.status = 'online';
            });
            this.oldWorkers = {};
          }
        });
      });
    });
    log.info(FLAG_CHILD, `app_start_reload : ${this.appId} , old workers:`, Object.keys(this.oldWorkers));
    for (let i = 0; i < newWorkersNum; i++) {
      this._create();
    }
  }

  cleanWorkers(workers, cb) {
    let workersIds = Object.keys(workers);
    if (!workersIds.length) {
      return cb();
    }
    async.each(workersIds, (pid, done) => {
      let worker = workers[pid];
      log.info(FLAG_CHILD, `app_reload_stop_worker : ${this.appId}", worker id: ${pid}`);
      if (this.flagExec) {
        this._kill(worker, done);
      } else {
        message.send({
          action: 'offline',
          target: worker
        }, () => {
          this._kill(worker, done);
        });
      }
    }, cb);
    this.oldWorkers = {};
  }

  getWorkerNum() {
    return Object.keys(this.workers).length;
  }
  /**
   * get one worker, only for test case
   */
  getFirstWorker() {
    let keys = Object.keys(this.workers);
    return this.workers[keys[0]];
  }

  getPortList() {
    let tmp = [];
    Object.keys(this.workers).forEach((key) => {
      let worker = this.workers[key];
      if (worker.targetPort) {
        tmp.push(worker.targetPort);
      }
    });
    return tmp;
  }

  checkWorkerNum() {
    return Object.keys(this.workers).length === this.options.processorNum;
  }

  checkWorkerReady() {
    if (this.options.service && !this.options.service.exec) {
      return true;
    }
    if (!this.checkWorkerNum()) {
      return false;
    }
    let flag = true;
    Object.keys(this.workers).forEach((key) => {
      let worker = this.workers[key];
      if (!worker.ready) {
        flag = false;
      }
    });
    return flag;
  }
  /**
   * 分配sock文件
   */
  initTargetSocks(len) {
    let list = [];
    let start = this.reloadOffset * len + 1;
    let end = start + len;
    for (let i = start; i < end; i++) {
      list.push(path.join(config.runDir, this.appId + '.' + i + '.sock'));
    }
    this.sockList = list;
    this.reloadOffset++;
  }

  getTargetSock() {
    let list = this.sockList;
    let len = list.length;
    let workers = this.workers;
    let inUseSock = {};
    Object.keys(workers).forEach((pid) => {
      let sock = workers[pid].targetSock;
      inUseSock[sock] = true;
    });
    for (let i = 0; i < len; i++) {
      let tmp = list[i];
      if (!inUseSock[tmp]) {
        return tmp;
      }
    }
    return null;
  }
  getTargetPort(cb) {
    let list = [];
    let num = this.options.processorNum;
    let workers = this.workers;
    Object.keys(workers).forEach((pid) => {
      list.push(workers[pid].targetPort);
    });
    if (list.length < num) {
      getPort(cb);
    } else {
      cb(null);
    }
  }
  _spawn(exec, args, env, cwd) {
    let worker;
    let stdio;

    stdio = ['pipe', 'pipe', 'pipe'];

    // fix run nexe application bug, do not try make ipc channel when spawn nexe app
    if (exec === process.execPath) {
      stdio.push('ipc');
    }

    try {
      // fix #147 Error: spawn ENOMEM
      worker = childProcess.spawn(exec, args, {
        cwd: cwd || process.cwd(),
        env: env,
        stdio: stdio
      });
    } catch (e) {
      return e;
    }

    if (worker.stdout && worker.stderr) {
      let appId = this.appId;
      let pid = worker.pid;
      // eslint-disable-next-line
      let logStd = this.stdout;
      // 非最简写法，保证写入函数尽可能少逻辑判断
      if (!logStd) {
        worker.stdout.on('data', (chunk) => {
          // eslint-disable-next-line
          console.log(`${log.getTime()} ${appId} #${pid} STDOUT`, chunk.toString().trimRight());
        });
        worker.stderr.on('data', (chunk) => {
          // eslint-disable-next-line
          console.error(`${log.getTime()} ${appId} #${pid} STDERR`, chunk.toString().trimRight());
        });
      } else {
        worker.stdout.on('data', (chunk) => {
          logStd.info(chunk.toString().trimRight());
        });
        worker.stderr.on('data', (chunk) => {
          logStd.error(chunk.toString().trimRight());
        });
      }
    }

    return worker;
  }

  _create() {
    let options = this.options;
    if (options.service && options.service.upstream === 'port') {
      /**
       * assign targetPort
       * if targetPort is null, means workers are all started, return
       */
      this.getTargetPort((port) => {
        if (!port) {
          return log.error(FLAG_CHILD, `app_alloc_port_failed: ${options.appId}, all workers are running`);
        }
        this._createChild(port);
      });
    } else {
      /**
       * assign targetSock
       * if targetSock is null, means workers are all started, return
       */
      let targetSock = this.getTargetSock();
      if (!targetSock) {
        return log.error(FLAG_CHILD, `app_alloc_sock_failed: ${options.appId}, all workers are running`);
      }
      this._createChild(targetSock);
    }
  }
  _prepareVars(str) {
    return str.replace(/\$\{(\w+)\}/g, (m0, m1) => {
      switch (m1) {
        case 'main':
          return this.options.file;
        case 'appRoot':
        case 'logRoot':
        case 'serverRoot':
        case 'appId':
        case 'name':
        case 'version':
        case 'buildNum':
          return this.options[m1];
        default:
          return process.env[m1] || m0;
      }
    });
  }
  _createChild(sockOrPort) {
    let self = this;
    let workers = self.workers;
    let options = self.options;
    let maxRetry = options.maxRetry * options.processorNum;
    let privateEnv = {};
    let privateEnv2 = {};
    let serverParam = {};

    if (options.config.honeycomb) {
      privateEnv = options.config.honeycomb.env || {};
      serverParam = options.config.honeycomb.serverParam || {};
    }

    if (options.service) {
      privateEnv2 = options.service.env || {};
    } else if (options.job) {
      privateEnv2 = options.job.env || {};
    }

    let targetSock;
    let targetPort;
    if (typeof sockOrPort === 'number') {
      targetPort = sockOrPort;
    } else {
      targetSock = sockOrPort;
      try {
        fs.unlinkSync(targetSock);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          return log.error(FLAG_CHILD, `remove_former_sock_file_failed : ${targetSock} error: ${e.message}`);
        }
      }
    }

    let appCfg = {
      file: options.file,
      timeout: options.timeout,
      appId: options.appId,
      config: options.config,
      env: config.env, // std cfg: env
      serverRoot: config.serverRoot, // std cfg: serverRoot
      logRoot: path.join(config.logsRoot, this.options.name),
      serverEnv: config.serverEnv, // std cfg: serverFlag
      appRoot: options.appRoot, // std cfg: appRoot
      targetSock: targetSock,
      targetPort: targetPort,
      cluster: this.clusterInfo
    };
    let env = _.merge(
      {},
      process.env,
      privateEnv,
      privateEnv2,
      {
        HC_APP_CONFIG: JSON.stringify(appCfg)
      }
    );

    let argv;
    let childProc;
    let pid;

    // 探测服务是否OK
    let count = 0;
    let appReadymaxRetry = config.appReadyMaxRetry;
    let client;
    function checkExecService() {
      count++;
      client = net.connect(targetPort || targetSock, () => {
        childProc.ready = true;
        client.removeAllListeners();
        client.destroy();
        log.info(FLAG_CHILD, `${options.appId} worker_ready, pid: ${pid}`);
        self.emit('worker_ready', {
          bind: options.service.bind,
          serverName: options.service.serverName,
          router: options.service.router,
          type: options.service.type || 'http',
          target: targetSock || targetPort,
          static: options.service.static,
          param: serverParam
        });
      });
      client.on('error', () => {
        client.removeAllListeners();
        client.destroy();
        if (count > appReadymaxRetry) {
          let err = new Error(`app ${self.appId} worker init timeout`);
          self.emit('error', err);
        } else {
          setTimeout(checkExecService, 500);
        }
      });
    }

    function clearCheckExecService() {
      if (!client) {
        return;
      }
      client.removeAllListeners();
      client.destroy();
      client = null;
    }
    Object.keys(env).forEach((key) => {
      env[key] = this._prepareVars(env[key] + '');
    });

    log.info(FLAG_CHILD, `${options.appId} fork child at: ${targetPort || targetSock}, type: ${options.service ? 'service' : 'node'}`);
    if (options.job) {
      argv = options.job.argv || [];
      argv.forEach((v, i, a) => {
        a[i] = this._prepareVars(v + '');
      });
      let cwd = options.job.cwd;
      if (cwd) {
        cwd = cwd.replace(/^\//, '');
        cwd = path.join(appCfg.appRoot, cwd);
        cwd = this._prepareVars(cwd);
      }
      /* *********** exec fork ************ */
      childProc = this._spawn(options.job.exec, argv, env, cwd);
    } else if (options.service) {
      argv = options.service.argv || [];
      argv.forEach((v, i, a) => {
        a[i] = this._prepareVars(v + '');
      });
      let cwd = options.service.cwd;
      if (cwd) {
        cwd = cwd.replace(/^\//, '');
        cwd = path.join(appCfg.appRoot, cwd);
        cwd = this._prepareVars(cwd);
      }
      /* *********** exec fork ************ */
      childProc = this._spawn(options.service.exec, argv, env, cwd);
      checkExecService();
    } else {
      argv = ['./lib/run.js', options.appId];
      if (
        options.config.honeycomb && options.config.honeycomb.maxOldSpaceSize) {
        argv.unshift('--max_old_space_size=' + options.config.honeycomb.maxOldSpaceSize);
      }
      /* *********** nodejs fork ************ */
      childProc = this._spawn(process.execPath, argv, env);
      /**
       * child process send message to parent with this format
       *    message
       *      action {String}  ready|error|message
       *      data {Object}
       */
      childProc.on('message', function (msg) {
        if (!msg) {
          return;
        }
        let action = msg.action;
        let data = msg.data;
        if ('ready' === action) {
          log.info(FLAG_CHILD, `${options.appId} worker_ready, pid: ${this.pid}`);
          childProc.ready = true;
          if (data.target && fs.existsSync(data.target)) {
            try {
              fs.chmodSync(data.target, '0666');
            } catch (e) {
              // do nothing
            }
          }
          data.param = _.merge({}, data.param, serverParam);
          self.emit('worker_ready', data);
        } else if (action === 'error') {
          msg.appId = options.appId;
          log.error(FLAG_CHILD, `worker_error : ${options.appId} #${this.pid}`, msg);
          // self.emit('error', msg);
        } else {
          self.emit('message', childProc, msg);
        }
      });
    }
    /**
     * if service.exec not found,childProc.pid will be undefined
     */
    pid = childProc.pid;
    childProc.targetSock = targetSock;
    childProc.targetPort = targetPort;
    workers[pid] = childProc;

    if (pid) {
      saveAppPid(options.appId, pid);
    }

    childProc.on('error', function (err) {
      err.appId = options.appId;
      log.error(FLAG_CHILD, `worker_error : ${options.appId} #${this.pid}`, err);
      // clean event
      this.removeAllListeners();
      // when child proc error occur, no guarantee the exit event will filed
      // so child should emit the worker_exit event
      self.emit('worker_exit', err);
      if (options.job) {
        return self.stop();
      }

      if (options.service) {
        clearCheckExecService();
      }
      /**
       * when pid === undefined, childProc will only emit 'error' Event,
       * no more 'exit' event, because the proc is not successfully spawned
       * so wo stop app when this happend;
       */
      if (!pid) {
        log.error(FLAG_CHILD, `since exec child_process.spawn() faild to create process, app ${options.appId} should stoped immediately!`);
        self.stop();
      }
    });

    let lockStatus = ['offline', 'stopping', 'reloaded'];
    childProc.on('exit', function (code, signal) {
      if (this.stdout && this.stderr) {
        this.stdout.removeAllListeners();
        this.stderr.removeAllListeners();
      }
      // remove child events
      this.removeAllListeners();

      // job 类型
      if (options.job) {
        if (code !== 0) {
          let errMsg = `app: ${options.appId} failed, exit with code: ${code}, signal: ${signal}`;
          log.error(FLAG_CHILD, errMsg);
          self.stop();
          self.emit('worker_exit', {code: 'APP_ERROR', message: errMsg});
        } else {
          childProc.ready = true;
          self.emit('worker_ready', {type: 'job'});
        }
        return;
      }

      if (options.service) {
        clearCheckExecService();
      }

      // remove sockfile when process exit
      if (targetSock) {
        try {
          fs.unlinkSync(targetSock);
        } catch (e) {
          if (e.code !== 'ENOENT') {
            log.error(FLAG_CHILD, `remove_worker_sock_failed : ${options.appId} sock: ${targetSock}, error: ${e.message}`);
          }
        }
      }

      delete workers[pid];

      log.warn(FLAG_CHILD, 'app_exit:', options.appId, '#' + pid, 'with signal:', signal, 'code:', code, 'status:', self.status);

      if (self.status === 'reload') {
        self.status = 'exception';
        self.emit('reload_failed', new Error('app reload failed, exit code:' + code));
      }
      /**
       * if  code === 0, worker is normally exit
       * just record exitCount, do not restart and do not notify master
       */
      if (code === 0 || lockStatus.indexOf(self.status) > -1) {
        self.exitCount++;
        return;
      }
      /**
       * 如果是exec型的应用，退出码非1, 则视为退出
       */
      /*
       * 前排已经根据app的状态筛选是否重启进程，所以本处无需再次判断是否重启进程，
       * 但凡错误，一律往下走，进入重启流程
      if (self.flagExec && code > 1) {
        self.exitCount++;
        return;
      }
      */
      /**
       * record errorExit
       */
      self.errorExitCount++;
      self.errorExitRecord.unshift(new Date());
      if (self.errorExitRecord.length > 10) {
        self.errorExitRecord.pop();
      }
      /**
       * Exit code:
       * 0. normal exit
       * 1. unknow error
       * 2. timeout
       * 3. app init error, syntax error
       * 4. app implement error, missing app.run
       */
      let msg;
      if (!self.flagExec) {
        if (code === 2) {
          self.status = 'timeout';
          msg = `app_ready_timeout : ${options.appId} #${this.pid} exit with code: ${code}, signal: ${signal}`;
        } else {
          self.status = 'exception';
          msg = `unexpect_worker_exit : ${options.appId} #${this.pid} exit with code: ${code}, signal: ${signal}`;
        }
      } else {
        self.status = 'exception';
        msg = 'app exception, exit';
      }
      self.emit('worker_exit', msg);
      /**
       * if code in [2,3,4], do not retry
       * 参考上面对 2，3，4 code的定义
       */
      if ([2, 3, 4].indexOf(code) >= 0) {
        return;
      }

      self.fatalCount++;

      if (self.fatalCount >= maxRetry) {
        /**
         * if reach the max retry, wait for options.pauseAfterFatal ms
         */
        log.error(
          FLAG_CHILD,
          `worker_retry_failed: ${options.appId} reach max retry ${self.fatalCount}, pause ${options.pauseAfterFatal} ms`
        );
        self.fatalCount = 0;
        // self.status = 'retry';
        let retryTimeoutId = setTimeout(function () {
          self.unmarkRetryTimeoutId(retryTimeoutId);
          /*
          if (self.status === 'stopping' && self.status === 'offline') {
            return
          }
          */
          log.warn(FLAG_CHILD, `worker_retry : ${options.appId}`);
          self._create();
        }, options.pauseAfterFatal);
        self.markRetryTimeoutId(retryTimeoutId);
      } else {
        /**
         * restart new work after 50ms
         */
        let retryTimeoutId = setTimeout(function () {
          self.unmarkRetryTimeoutId(retryTimeoutId);
          /*
          if (self.status === 'stopping' || self.status === 'offline') {
            return;
          }
          */
          log.warn(FLAG_CHILD, `worker_retry : ${options.appId}`);
          self._create();
        }, 50);
        self.markRetryTimeoutId(retryTimeoutId);
      }
    });
  }
  markRetryTimeoutId(timeout) {
    this.retryTimeoutId.push(timeout);
  }
  unmarkRetryTimeoutId(timeout) {
    this.retryTimeoutId = this.retryTimeoutId.filter(function (v) {
      return v !== timeout;
    });
  }
  /**
   * get all child process's pid
   * @return {Array} pid list, sort by pid num asc
   */
  getPid() {
    let keys = Object.keys(this.workers);
    keys = keys.concat(Object.keys(this.oldWorkers));
    keys.sort();
    return keys;
  }
  /**
   * stop all workers, this method should handler following situations:
   *   1. should stopping the apps which in starting states
   *   2. should work fine when app already stopped
   *   3. should waitting when if app is reloading
   */
  stop(cb) {
    if (this.status === 'reload') {
      this.removeAllListeners('reloaded');
      this.removeAllListeners('reload_failed');
    }
    if (this.options.service && !this.options.service.exec) {
      this.status = 'offline';
      return cb();
    }
    this.status = 'stopping';
    log.warn(FLAG_CHILD, `app_shutting_down : ${this.appId}`);
    // clearTimeout(this.readyTimeoutId);
    // this.readyTimeoutId = null;
    // clear retry timeout
    this.retryTimeoutId.forEach((timeout) => {
      clearTimeout(timeout);
    });
    // clean group message bind
    message.unbindGroupMessage(this.appId);

    this.send({
      action: 'offline'
    }, () => {
      let workers = _.assign({}, this.workers, this.oldWorkers);
      // clean workers ref
      this.oldWorkers = {};
      this.workers = {};
      // clean record
      this.errorExitCount = 0;
      this.errorExitRecord = [];
      async.each(workers, this._kill.bind(this), (err) => {
        if (err) {
          log.error(FLAG_CHILD, `app_stop_error : ${this.appId} `, err);
        }
        if (this.stdout) {
          this.stdout.end();
          this.stdout = null;
        }
        this.status = 'offline';
        this.removeSockFile();
        this.emit('stop');
        cb && cb(err);
      });
    });
  }
  _kill(worker, cb) {
    cb = cb || function () {};
    if (!worker) {
      return cb();
    }
    // if prcess exit, the exitCode will not be null
    if (worker.exitCode !== null) {
      return cb();
    }

    let timeout;

    function end() {
      worker.kill('SIGKILL');
      worker.removeAllListeners();
      cb();
    }
    worker.on('disconnect', () => {
      clearTimeout(timeout);
      setTimeout(end, 10);
    });
    timeout = setTimeout(() => {
      log.warn(FLAG_CHILD, `app_exit_timeout: ${this.appId}, now force killing`);
      end();
    }, config.forceKillTimeout);
    worker.kill();
  }
  removeSockFile() {
    /** sockList */
    this.sockList.forEach((v) => {
      try {
        fs.unlinkSync(v);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          log.error(FLAG_CHILD, 'remove_sock_file_failed :', e.message, v);
        }
      }
    });
  }
  // 集群节点信息
  reloadClusterInfo() {
    try {
      let fpath = path.join(config.serverRoot, './run/cluster.json');
      this.clusterInfo = JSON.parse(fs.readFileSync(fpath));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log.error(FLAG_CHILD, 'reload cluster info error', e.message);
      }
      if (!this.clusterInfo) {
        this.clusterInfo = {};
      }
    }
  }
  /**
   * send message to workers
   * @param {Object} msg
   * @param {Function} cb
   */
  send(msg, cb) {
    let workers = this.workers;
    let workerIds = Object.keys(workers);
    let count = 0;
    let total = workerIds.length;
    let error = [];
    let res = [];

    if (this.flagExec) {
      return cb && cb(new Error('only node.js can send message, app:' + this.appId));
    }

    function done(err, data) {
      count++;
      if (err) {
        error.push(err);
      }
      res.push(data);
      if (count === total) {
        cb && cb(error.length ? error : null, res);
      }
    }
    if (workerIds.length) {
      workerIds.forEach(function (i) {
        msg.target = workers[i];
        message.send(msg, done);
      });
    } else {
      cb && cb(null, []);
    }
  }
}

Child.deleteAppPids = deleteAppPids;
Child.getAppIdByPid = getAppIdByPid;

module.exports = Child;
