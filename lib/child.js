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

/**
 * @class Child
 */
class Child extends EventEmitter {
  constructor(appId) {
    super();
    this.appId = appId;

    this.reloadOffset = 0;
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
     *       retry 异常，放弃重启， 等待下一次重试中
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
        clearTimeout(this.readyTimeoutId);
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
    this.options = _.assign({
      maxRetry: 3,
      pauseAfterFatal: 180000, // 3 minutes
      readyTimeout: 10 * 60 * 1000, // 10 minutes
      processorNum: 1,
      exitWhenTimeout: true
    }, options || this.options);

    let self = this;
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

    for (let i = this.getWorkerNum(); i < processorNum; i++) {
      this._create();
    }
  }
  /**
   * reload workers, only online status can enter this action
   */
  reload(cb) {
    if (this.status !== 'online') {
      return cb({
        code: 'SERVER_BUSY',
        messsage: 'server is busy now, status:' + this.status
      });
    }
    this.status = 'reload';
    let newWorkersNum = this.options.processorNum;
    // reset workers
    this.oldWorkers = this.workers;
    this.workers = {};
    // re-assign new sock files
    this.initTargetSocks(newWorkersNum);

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
        cb(null, (err, done) => {
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
            done(err);
          } else {
            log.info(FLAG_CHILD, `app_reload_success : ${this.appId} , now stop old workers`);
            this.cleanOldWorkers((err) => {
              this.status = 'online';
              done(err);
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

  _fork(exec, args, env) {
    let worker;
    let stdio;

    stdio = ['pipe', 'pipe', 'pipe', 'ipc'];
    worker = childProcess.fork(exec, args, {
      cwd: process.cwd(),
      env: env,
      stdio: stdio
    });

    if (worker.stdout && worker.stderr) {
      let appId = this.appId;
      let pid = worker.pid;
      worker.stdout.on('data', (chunk) => {
        console.log(log.getTime(), appId, '#' + pid, chunk.toString()); // eslint-disable-line
      });
      worker.stderr.on('data', (chunk) => {
        console.error(log.getTime(), appId, '#' + pid, chunk.toString()); // eslint-disable-line
      });
    }
    return worker;
  }

  _create() {
    let self = this;
    let workers = self.workers;
    let options = self.options;
    let maxRetry = options.maxRetry * options.processorNum;

    /**
     * if workers is already full, return
     */
    if (this.checkWorkerNum()) {
      log.error(FLAG_CHILD, `app_already_start : ${options.appId}`);
      return;
    }
    /**
     * assign targetSock
     */
    let targetSock = this.getTargetSock();
    if (!targetSock) {
      log.error(FLAG_CHILD, `app_can_not_alloc_target_sock : ${options.appId}`);
    }
    let privateEnv = options.config.honeycomb ? options.config.honeycomb.env : {};

    let env = _.assign(
      {},
      privateEnv || {},
      process.env, {
        HC_APP_CONFIG: JSON.stringify({
          file: options.file,
          appId: options.appId,
          config: options.config,
          env: config.env,               // std cfg: env
          serverRoot: config.serverRoot, // std cfg: serverRoot
          serverEnv: config.serverEnv,   // std cfg: serverFlag
          appRoot: options.appRoot,      // std cfg: appRoot
          targetSock: targetSock
        })
      }
    );

    try {
      fs.unlinkSync(targetSock);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log.error(FLAG_CHILD, `remove_former_sock_file_failed : ${targetSock} error: ${e.message}`);
      }
    }
    let argv = [options.appId];
    if (
      options.config.honeycomb && options.config.honeycomb.maxOldSpaceSize) {
      argv.push('--max_old_space_size=' + options.config.honeycomb.maxOldSpaceSize);
    }
    let worker = this._fork('./lib/run.js', argv, env);
    let childProc = worker;
    let pid = childProc.pid;

    worker.targetSock = targetSock;
    workers[pid] = worker;
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
      } else if (action === 'error')  {
        msg.appId = options.appId;
        log.error(FLAG_CHILD, `worker_error : ${options.appId} #${this.pid}`, msg);
        // self.emit('error', msg);
      } else {
        self.emit('message', childProc, msg);
      }
    });

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

      log.warn('app exit:', options.appId, 'with signal:', signal, 'code:', code, 'status:', self.status);
      // if worker is normally exit, do not restart and do not notify master
      // 意外 kill，child退出码为15，这个时候非reload状态，则会自动拉起新进程
      // TODO test case should cover this case
      if (code === 0 || self.status === 'reload' || self.status === 'offline' || self.status === 'stopping') {
        self.exitCount++;
        return;
      }

      /*
      if (self.reloadFlag && code === 0) {
        return;
      }
      */
      self.status = 'exception';
      /*
      if (!self.getPid().length) {
        self.removeSockFile();
      }
      */
      self.errorExitCount++;
      self.errorExitRecord.unshift(new Date().getTime());
      if (self.errorExitRecord.length > 10) {
        self.errorExitRecord.pop();
      }
      log.error(FLAG_CHILD, `unexpect_worker_exit : ${options.appId} #${this.pid} exit with code: ${code}, signal: ${signal}`);
      self.emit('worker_exit', {
        appId: options.appId,
        pid: this.pid,
        code: code,
        signal: signal
      });
      self.fatalCount++;

      /**
       * if reach the max-retry, wait for options.pauseAfterFatal ms
       */
      if (self.fatalCount >= maxRetry) {
        log.error(FLAG_CHILD, `worker_restart_max_retry : ${options.appId} reach the max retry count, wait`);
        self.fatalCount = 0;
        // self.emit('giveup', self);
        self.status = 'retry';
        let retryTimeoutId = setTimeout(function () {
          self.unmarkRetryTimeoutId(retryTimeoutId);
          if (self.status !== 'stopping' && self.status !== 'offline') {
            self._create();
          }
        }, options.pauseAfterFatal);
        self.markRetryTimeoutId(retryTimeoutId);
        return;
      }
      /**
       * restart new work after 50ms
       */
      setTimeout(function () {
        if (self.status === 'stopping' || self.status === 'offline') {
          return;
        }
        log.warn(FLAG_CHILD, `worker_retry_start : ${options.appId}`);
        self._create();
      }, 50);
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
    }
    this.status = 'stopping';
    log.warn(FLAG_CHILD, `app_shutting_down : ${this.appId}`);
    clearTimeout(this.readyTimeoutId);
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
      async.each(workers, this._kill, (err) => {
        if (err) {
          log.error(FLAG_CHILD, `app_stop_error : ${this.appId} `, err);
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
    timeout = setTimeout(end, 10000);
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
