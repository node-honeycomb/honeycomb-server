/**
 * app's runtime
 */
const {parentPort} = require('worker_threads');
const message = require('./message_worker');
// const utils = require('../common/utils');
// const log = require('../common/log');

const appConfig = JSON.parse(process.env.HC_APP_CONFIG);
const file = appConfig.file;
const appId = appConfig.appId;
const serverRoot = appConfig.serverRoot;
const FLAG_RUNTIME = 'WORKER-APP:' + appId;

let App;
let app;
let appReadyTimeoutCheck;

Object.defineProperty(process, 'message', {
  enumerable: true,
  configurable: false,
  writable: false,
  value: message
});

process.on('error', function (err) {
  let message;

  if (err instanceof Error) {
    message = err.stack;
  } else {
    message = err.message;
  }
  // eslint-disable-next-line
  console.error(FLAG_RUNTIME, `worker_error, code:${err.code || ''} msg:${message || ''}, exit`);

  let code = 1;
  if (err && err.exitCode) {
    code = err.exitCode;
  }
  clearTimeout(appReadyTimeoutCheck);
  process.exit(code);
});

process.on('exit', () => {
  parentPort.removeAllListeners();
});

process.once('ready', function (config) {
  config.pid = process.pid;
  config.appId = appId;
  // sometime process.send may not exists
  process.send && process.send({
    action: 'ready',
    data: config
  });
  clearTimeout(appReadyTimeoutCheck);
});

process.send = process.postMessage = function (msg) {
  parentPort.postMessage(msg);
};

parentPort.on('message', function (msg) {
  // let action = msg.action;
  if (!app) {
    // eslint-disable-next-line
    return console.error(FLAG_RUNTIME, `worker_not_ready : ${appId}`);
  }

  if (!message.receive(msg, null, app.emit ? app : process)) {
    // eslint-disable-next-line
    console.error(FLAG_RUNTIME, `receive_unknow_message`, msg);
  }
});

appReadyTimeoutCheck = setTimeout(function () {
  let err = new Error(`worker:${appId} timeout, try to start app faild, app.run() timeout`);
  err.code = 'WORKER_START_TIMEOUT';
  err.exitCode = 2;
  process.emit('error',  err);
}, appConfig.timeout);

try {
  App = require(file);
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    e.message = `Loading app-file failed: ${file} ${e.message}, please check property "main" in  app's package.json `;
  } else {
    e.code = 'LOADING_APP_FILE_ERROR';
    e.message = `Loading app-file failed: ${file} ${e.message}`;
  }
  e.exitCode = 3;
  process.emit('error', e);
}


if (typeof App === 'function' && typeof App.run !== 'function') {
  app = new App(appConfig.config);
} else {
  app = App;
}

if (app && app.run) {
  // eslint-disable-next-line
  console.info(FLAG_RUNTIME, 'worker_starting');
  app.run(function (err, config) {
    if (err) {
      return process.emit('error', err);
    }
    config.appId = appId;
    config.router = config.router || '/';
    if (config.type === 'socket') {
      config.type = 'stream';
    } else if (!config.type) {
      config.type = 'http';
    }
    let bind = config.port ? config.port : config.bind;
    let target = config.target ? config.target.substr(serverRoot.length) : 'null';
    // eslint-disable-next-line
    console.log(FLAG_RUNTIME, `worker_ready , bind: ${bind || 'default'}, router: ${config.router}, target: ${target}`);
    /**
     * config
     *   appId
     *   type    http | stream | daemon
     *
     *   target
     *   serverName
     *   router
     *   bind
     *
     */
    process.emit('ready', config);
  });
} else if (App !== undefined) {
  let e = new Error(`worker_missing_run_method : ${appId} , should export app.run(callback) method ${file}`);
  e.exitCode = 4;
  process.emit('error', e);
}
