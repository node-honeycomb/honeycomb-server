/**
 * app's runtime
 */
const url = require('url');
const message = require('./message');
const utils = require('../common/utils');
const log = require('../common/log');
const FLAG_RUNTIME = 'RUNTIME';

let appConfig = JSON.parse(process.env.HC_APP_CONFIG);
let file = appConfig.file;
let appId = appConfig.appId;
let serverRoot = appConfig.serverRoot;

let App;
let app;

// because cluster model will listen error event, so remove it first
process.removeAllListeners('error');


// let env = appConfig.env;

if (!appConfig.config || !appConfig.config.noProcessUidSwitch) {
  if (
    typeof process.setuid === 'function' &&
    typeof process.setgid === 'function' &&
    typeof process.getuid === 'function' &&
    typeof process.getgid === 'function'
  ) {
    process.setuid(process.getuid());
    process.setgid(process.getgid());
  }
}

message.setGroup(appId);

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

  log.error(FLAG_RUNTIME, `worker_error : ${appId} code:${err.code || ''} msg:${message || ''}, exit`);
  log.end(function () {
    let code = 1;
    if (err && err.exitCode) {
      code = err.exitCode;
    }
    clearTimeout(timer);
    process.exit(code);
  });
});

process.on('disconnect', function () {
  // exit when parent-process is gone
  log.warn(FLAG_RUNTIME, `worker_disconnected : ${appId}`);
  process.exit(0);
});

process.once('ready', function (config) {
  config.pid = process.pid;
  config.appId = appId;
  // sometime process.send may not exists
  process.send && process.send({
    action: 'ready',
    data: config
  });
  clearTimeout(timer);
});

process.on('message', function (msg) {
  // let action = msg.action;
  if (!app) {
    return log.warn(FLAG_RUNTIME, `worker_not_ready : ${appId}`);
  }

  if (!message.receive(msg, null, app.emit ? app : process)) {
    log.warn(FLAG_RUNTIME, `unknow_message_from_child : ${appId}`, msg);
  }
});

// when children call .kill(), this process receivered SIGTERM
process.on('SIGTERM', function () {
  process.exit(0);
});

/*
process.on('SIGINT', function () {
  // process.exit(2);
});
*/

let timer = setTimeout(function () {
  let err = new Error(`worker:${appId} timeout, try to start app faild, app.run() timeout`);
  err.code = 'WORKER_START_TIMEOUT';
  process.emit('error',  err);
}, 60000);


try {
  App = require(file);
} catch (e) {
  e.code = 'LOADING_APP_FILE_ERROR';
  e.message = `Loading app-file failed: ${file} e.message, please check property "main" in  app's package.json `;
  process.emit('error', e);
}


if (typeof App === 'function' && typeof App.run !== 'function') {
  app = new App(appConfig.config);
} else {
  app = App;
}

if (app && app.run) {
  let appInfo = utils.parseAppId(appId);
  if (app.emit) {
    app.on('shutdown', function (data, cb) {
      if (this.shutdown) {
        this.shutdown(cb);
      } else {
        cb();
      }
    });
  } else {
    process.on('shutdown', function (data, cb) {
      if (!app.shutdown) {
        cb();
      } else {
        app.shutdown(cb);
      }
    });
  }
  log.debug(FLAG_RUNTIME, `worker_starting : ${appId}`);
  app.run(function (err, config) {
    if (err) {
      return process.emit('error', err);
    }
    if (config.sock) {
      config = transferOldCfg(config);
    }
    config.appId = appId;
    config.name = appInfo.name;
    config.version = appInfo.version;
    config.buildNum = appInfo.buildNum;
    config.router = config.router || '/';
    if (config.type === 'socket') {
      config.type = 'stream';
    } else if (!config.type) {
      config.type = 'http';
    }
    let bind = config.port ? config.port : config.bind;
    let target = config.target ? config.target.substr(serverRoot.length) : 'null';
    log.info(FLAG_RUNTIME, `worker_ready : ${appId} , bind: ${bind || 'default'}, router: ${config.router}, target: ${target}`);
    process.emit('ready', config);
  });
} else if (App !== undefined) {
  log.error(FLAG_RUNTIME, `worker_missing_run_method : ${appId} , should export app.run(callback) method`, file);
}

function transferOldCfg(cfg) {
  /**
    old type
    ==============
    name: appName,
    version: version || '1.0.0',
    url: urls,
    bind: ['0.0.0.0:' + config.port],
    sock: sock,

    new type
    ==============
    bind {Array|String|Number} 80, [80, 8080], '192.168.1.1:8080', ['192.168.1.1:8080']
    serverName {Array|String} 域名
    router {String}
    target: {String} target url
  **/
  let router;
  let serverName = {};
  if (cfg.url && cfg.url.length) {
    cfg.url.forEach(function (t) {
      let tmp = url.parse(t);
      serverName[tmp.hostname] = true;
      router = tmp.pathname;
    });
  }

  let result = {
    bind: cfg.bind,
    serverName: Object.keys(serverName),
    router: router,
    target: cfg.sock
  };
  return result;
}
