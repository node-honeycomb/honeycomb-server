'use strict';
const fs = require('fs');
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
      version: appInfo.version,
      buildNum: appInfo.buildNum
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
      }
      _.assign(this.options, appCfg);
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
        appCfg.sockList = this.sockList;
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
      this.initTargetSocks(processorNum);
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
       */
      this.emit('ready', config);
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
            Object.keys(workers).forEach((key) => {
              workers[key].disconnect();
            });
            this.workers = this.oldWorkers;
            this.oldWorkers = {};
          } else {
            log.info(FLAG_CHILD, `app_reload_success : ${this.appId} , now stop old workers`);
            this.cleanOldWorkers(() => {
              this.status = 'online';
            });
          }
        });
      });
    });
    log.info(FLAG_CHILD, `app_start_reload : ${this.appId} , old workers:`, Object.keys(this.oldWorkers));
    for (let i = 0; i < newWorkersNum; i++) {
      this._create();
    }
  }

  cleanOldWorkers(cb) {
    let workers = this.oldWorkers;
    let workersIds = Object.keys(workers);
    if (!workersIds.length) {
      return cb();
    }
    async.each(workersIds, (pid, done) => {
      let worker = workers[pid];
      log.info(FLAG_CHILD, `app_reload_stop_old_worker : ${this.appId}", worker id: ${pid}`);
      message.send({
        action: 'offline',
        target: worker
      }, () => {
        this._kill(worker, done);
      });
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

  _spawn(exec, args, env) {
    let worker;
    let stdio;

    stdio = ['pipe', 'pipe', 'pipe', 'ipc'];
    worker = childProcess.spawn(exec, args, {
      cwd: process.cwd(),
      env: env,
      stdio: stdio
    });

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
    let self = this;
    let workers = self.workers;
    let options = self.options;
    let maxRetry = options.maxRetry * options.processorNum;
    /**
     * assign targetSock
     * if targetSock is null, means workers are all started, return
     */
    let targetSock = this.getTargetSock();
    if (!targetSock) {
      return log.error(FLAG_CHILD, `app_alloc_sock_failed: ${options.appId}, all workers are running`);
    }
    let privateEnv = options.config.honeycomb ? options.config.honeycomb.env : {};

    let env = _.assign({},
      privateEnv,
      process.env, {
        HC_APP_CONFIG: JSON.stringify({
          file: options.file,
          timeout: options.timeout,
          appId: options.appId,
          config: options.config,
          env: config.env, // std cfg: env
          serverRoot: config.serverRoot, // std cfg: serverRoot
          serverEnv: config.serverEnv, // std cfg: serverFlag
          appRoot: options.appRoot, // std cfg: appRoot
          targetSock: targetSock
        })
      }
    );

    try {
      fs.unlinkSync(targetSock);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return log.error(FLAG_CHILD, `remove_former_sock_file_failed : ${targetSock} error: ${e.message}`);
      }
    }
    let argv;
    let childProc;
    let pid;
    /* *********** exec fork ************ */
    if (options.service) {
      argv = options.service.argv || [];
      argv.forEach((v, i, a) => {
        v = v.replace(/\$\{(\w+)\}/g, (m0, m1) => {
          switch (m1) {
            case 'main':
              return options.file;
          }
        });
        a[i] = v;
      });
      /* *********** exec fork ************ */
      childProc = this._spawn(options.service.exec, argv, env);
      // TODO 探测sock文件来实现检查 childProc ready
      let count = 0;
      let interval = setInterval(() => {
        count++;
        let check = fs.existsSync(targetSock);
        if (check) {
          clearInterval(interval);
          self.fatalCount = 0;
          childProc.ready = true;
          self.emit('worker_ready', {
            bind: options.service.bind,
            serverName: options.service.serverName,
            router: options.service.router,
            type: options.service.type || 'http',
            target: targetSock,
            appId: self.appId,
            name: options.service.name,
            version: options.service.version
          });
          return;
        }
        if (count > 1200) {
          clearInterval(interval);
          self.emit('error', new Error('app init timeout'));
        }
      }, 200);
    } else {
      argv = ['./lib/run.js', options.appId];
      if (
        options.config.honeycomb && options.config.honeycomb.maxOldSpaceSize) {
        argv.push('--max_old_space_size=' + options.config.honeycomb.maxOldSpaceSize);
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
          log.info(FLAG_CHILD, `worker_ready : ${options.appId} #${this.pid}`);
          self.fatalCount = 0;
          childProc.ready = true;
          if (data.target && fs.existsSync(data.target)) {
            try {
              fs.chmodSync(data.target, '0666');
            } catch (e) {
              // do nothing
            }
          }
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
    pid = childProc.pid;
    childProc.targetSock = targetSock;
    workers[pid] = childProc;

    childProc.on('error', function (err) {
      err.appId = options.appId;
      log.error(FLAG_CHILD, `worker_error : ${options.appId} #${this.pid}`, err);
      // self.emit('error', self, err);
    });

    childProc.on('exit', function (code, signal) {
      if (this.stdout && this.stderr) {
        this.stdout.removeAllListeners();
        this.stderr.removeAllListeners();
      }
      // remove events
      this.removeAllListeners();

      // remove sockfile when process exit
      try {
        fs.unlinkSync(targetSock);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          log.error(FLAG_CHILD, `remove_worker_sock_failed : ${options.appId} sock: ${targetSock}, error: ${e.message}`);
        }
      }

      delete workers[pid];

      log.warn(FLAG_CHILD, 'app_exit:', options.appId, 'with signal:', signal, 'code:', code, 'status:', self.status);
      /**
       * if  code === 0, worker is normally exit
       * just record exitCount, do not restart and do not notify master
       */
      if (code === 0) {
        self.exitCount++;
        return;
      }
      /**
       * record errorExit
       */
      self.errorExitCount++;
      self.errorExitRecord.unshift(new Date());
      if (self.errorExitRecord.length > 10) {
        self.errorExitRecord.pop();
      }
      if (self.status === 'reload') {
        self.emit('reload_failed', new Error('app reload failed, exit code:' + code));
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
       * if code > 1, do not retry
       */
      if (code > 1) {
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
        cb && cb(err);
      });
    });
  }
  _kill(worker, cb) {
    if (!worker || !worker.connected) {
      return cb && cb();
    }
    let timeout;

    function end() {
      worker.kill('SIGKILL');
      worker.removeAllListeners();
      cb && cb();
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

module.exports = Child;
