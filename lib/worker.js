/**
 * 内部的admin、proxy以worker形式运行
 */
const {Worker} = require('worker_threads');
const fs = require('fs');
const _ = require('lodash');
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
const config = require('../config');
const log = require('../common/log');
const message = require('./message_worker');
const FLAG_MODULE = 'WORKER';
const utils = require('../common/utils');

/**
 * @class Child
 */
class HCWorker extends EventEmitter {
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
     * worker states
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
        this.options = _.assign(this.options, appCfg);
        appCfg = this.options;
        appCfg.sockList = this.sockList;
        if (this.status === 'reload') {
          this.emit('reloaded', appCfg);
        } else {
          this.status = 'online';
          this.emit('ready', appCfg);
        }
      }
    });
  }
  reloadClusterInfo() {
    try {
      let fpath = path.join(config.serverRoot, './run/cluster.json');
      this.clusterInfo = JSON.parse(fs.readFileSync(fpath));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log.error(FLAG_MODULE, 'reload cluster info error', e.message);
      }
      if (!this.clusterInfo) {
        this.clusterInfo = {};
      }
    }
  }

  start(options) {
    this.reloadClusterInfo();
    this.options = _.assign(this.options, options);

    let processorNum = this.options.processorNum;

    /**
     * stop fork workers when worker is stopping
     */
    if (this.status === 'stopping') {
      return;
    }

    if (this.status === 'init' || this.status === 'offline') {
      this.status = 'starting';
      this.initTargetSocks(processorNum);
    }

    /*
    if (this.options.service) {
      this.flagExec = true;
    }
    */

    for (let i = this.getWorkerNum(); i < processorNum; i++) {
      this._create();
    }
  }
  /**
   * reload workers, only online status can enter this action
   *
  reload(cb) {
    this.reloadClusterInfo();
    // 只允许 online 和 exception状态时 执行 reload
    if (this.status !== 'online' && this.status !== 'exception') {
      return cb({
        code: 'SERVER_BUSY',
        messsage: 'server is busy now, status:' + this.status
      });
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
       *
      this.emit('ready', config);
      this.status = 'reloaded';
      /**
       * update router in next-tick, and then wait until nginx reloaded
       *
      process.nextTick(() => {
        cb(null, (err) => {
          /**
           * here nginx reloaded, and callback to kill old workers
           *
          if (err) {
            log.error(FLAG_MODULE, `app_reload_failed : ${this.appId}`, err);
            let workers = this.workers;
            this.cleanWorkers(workers, () => {
              this.status = 'online';
            });
            this.workers = this.oldWorkers;
            this.oldWorkers = {};
          } else {
            log.info(FLAG_MODULE, `app_reload_success : ${this.appId} , now stop old workers`);
            this.cleanWorkers(this.oldWorkers, () => {
              this.status = 'online';
            });
            this.oldWorkers = {};
          }
        });
      });
    });
    log.info(FLAG_MODULE, `app_start_reload : ${this.appId} , old workers:`, Object.keys(this.oldWorkers));
    for (let i = 0; i < newWorkersNum; i++) {
      this._create();
    }
  }
  */

  cleanWorkers(workers, cb) {
    let workersIds = Object.keys(workers);
    if (!workersIds.length) {
      return cb();
    }
    async.each(workersIds, (tid, done) => {
      let worker = workers[tid];
      log.info(FLAG_MODULE, `app_reload_stop_worker : ${this.appId}", worker id: ${tid}`);
      /*
      if (this.flagExec) {
        this._kill(worker, done);
      } else {
      */
      message.send({
        action: 'offline',
        target: worker
      }, () => {
        this._kill(worker, done);
      });
      // }
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

  checkWorkerNum() {
    return Object.keys(this.workers).length === this.options.processorNum;
  }

  checkWorkerReady() {
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
  _fork(file, argv, env) {
    let worker;
    process.tttt = 1001;
    try {
      worker = new Worker(file, {
        argv,
        execArgv: ['--unhandled-rejections=strict'],
        env,
        stdout: true,
        stderr: true,
      });
    } catch (e) {
      return e;
    }

    let appId = this.appId;
    let tid = worker.threadId;
    // To prevent subsequent logging with pid: undefined
    this.pid = process.pid;
    worker.stdout.on('data', (chunk) => {
      // eslint-disable-next-line
      console.log(`${log.getTime()} ${appId} #${this.pid} [Thread ${tid}] [stdout] `, chunk.toString().trimRight());
    });
    worker.stderr.on('data', (chunk) => {
      // eslint-disable-next-line
      console.error(`${log.getTime()} ${appId} #${this.pid} [Thread ${tid}] [stderr]`, chunk.toString().trimRight());
    });
    return worker;
  }

  _create() {
    let options = this.options;
    /**
     * assign targetSock
     * if targetSock is null, means workers are all started, return
     */
    let targetSock = this.getTargetSock();
    if (!targetSock) {
      return log.error(FLAG_MODULE, `app_alloc_sock_failed: ${options.appId}, all workers are running`);
    }
    this._createWorker(targetSock);
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
  /**
   * 只支持 sock 监听
   * @param  {String} sockOrPort
   */
  _createWorker(sockOrPort) {
    let self = this;
    let workers = self.workers;
    let options = self.options;
    let maxRetry = options.maxRetry * options.processorNum;
    let privateEnv = options.config.honeycomb ? options.config.honeycomb.env : {};
    let serverParam = options.config.honeycomb ? options.config.honeycomb.serverParam : {};

    let targetSock = sockOrPort;
    try {
      fs.unlinkSync(targetSock);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return log.error(FLAG_MODULE, `remove_former_sock_file_failed : ${targetSock} error: ${e.message}`);
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
      cluster: this.clusterInfo,
      targetSock: targetSock
    };

    let env = _.assign(
      {},
      privateEnv,
      process.env,
      {
        HC_APP_CONFIG: JSON.stringify(appCfg)
      }
    );

    let argv;
    let wk;
    let tid;

    Object.keys(env).forEach((key) => {
      env[key] = this._prepareVars(env[key] + '');
    });

    log.info(FLAG_MODULE, `${options.appId} fork worker at: ${targetSock}, type: ${options.service ? 'service' : 'node'}`);

    argv = [options.appId];
    /* *********** nodejs fork ************ */
    wk = this._fork('./lib/run_worker.js', argv, env);
    /**
     * worker thread send message to parent with this format
     *    message
     *      action {String}  ready|error|message
     *      data {Object}
     */
    wk.on('message', function (msg) {
      if (!msg) {
        return;
      }
      let action = msg.action;
      let data = msg.data;
      if ('ready' === action) {
        log.info(FLAG_MODULE, `${options.appId} worker_ready, pid: ${this.pid}`);
        wk.ready = true;
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
        log.error(FLAG_MODULE, `worker_error : ${options.appId} #${this.pid}`, msg);
        // self.emit('error', msg);
      } else {
        self.emit('message', wk, msg);
      }
    });

    tid = wk.threadId;
    wk.targetSock = targetSock;
    workers[tid] = wk;

    wk.on('error', function (err) {
      err.appId = options.appId;
      log.error(FLAG_MODULE, `worker_error : ${options.appId} #${this.pid}`, err);
      // when worker error occur, no guarantee the exit event will filed
      // so worker should emit the worker_exit event
      self.emit('worker_exit', err);
      /**
       * when tid === undefined, worker will only emit 'error' Event,
       * no more 'exit' event, because the proc is not successfully spawned
       * so wo stop app when this happend;
       */
      if (!tid) {
        log.error(FLAG_MODULE, `since exec new Worker() faild to create process, app ${options.appId} should stoped immediately!`);
        self.stop();
      }
    });

    let lockStatus = ['offline', 'stopping', 'reloaded'];
    wk.on('exit', function (code, signal) {
      if (this.stdout && this.stderr) {
        this.stdout.removeAllListeners();
        this.stderr.removeAllListeners();
      }
      // remove wk events
      this.removeAllListeners();

      // remove sockfile when process exit
      if (targetSock) {
        try {
          fs.unlinkSync(targetSock);
        } catch (e) {
          if (e.code !== 'ENOENT') {
            log.error(FLAG_MODULE, `remove_worker_sock_failed : ${options.appId} sock: ${targetSock}, error: ${e.message}`);
          }
        }
      }

      delete workers[tid];

      /**
       * if lockStatus, worker is normally exit
       * just record exitCount, do not restart and do not notify master
       */
      if (lockStatus.indexOf(self.status) > -1) {
        self.exitCount++;
        return;
      }

      log.warn(FLAG_MODULE, 'app_exit:', options.appId, 'with signal:', signal, 'code:', code, 'status:', self.status);

      if (self.status === 'reload') {
        self.status = 'exception';
        self.emit('reload_failed', new Error('app reload failed, exit code:' + code));
      }
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
      if (code === 2) {
        self.status = 'timeout';
        msg = `app_ready_timeout : ${options.appId} #${this.pid} exit with code: ${code}, signal: ${signal}`;
      } else {
        self.status = 'exception';
        msg = `unexpect_worker_exit : ${options.appId} #${this.pid} exit with code: ${code}, signal: ${signal}`;
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
          FLAG_MODULE,
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
          log.warn(FLAG_MODULE, `worker_retry : ${options.appId}`);
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
          log.warn(FLAG_MODULE, `worker_retry : ${options.appId}`);
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
  getTid() {
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
    this.status = 'stopping';
    log.warn(FLAG_MODULE, `app_shutting_down : ${this.appId}`);
    // clear retry timeout
    this.retryTimeoutId.forEach((timeout) => {
      clearTimeout(timeout);
    });
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
          log.error(FLAG_MODULE, `app_stop_error : ${this.appId} `, err);
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
    worker.terminate().then(cb).catch(cb);
  }
  removeSockFile() {
    /** sockList */
    this.sockList.forEach((v) => {
      try {
        fs.unlinkSync(v);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          log.error(FLAG_MODULE, 'remove_sock_file_failed :', e.message, v);
        }
      }
    });
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

module.exports = HCWorker;
