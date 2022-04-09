'use strict';

/* eslint no-console: 0 */
const fs = require('xfs');
const _ = require('lodash');
const path = require('path');
const utils = require('../common/utils');


const installServerRoot = process.env.HONEYCOMB_SERVER_ROOT || path.join(__dirname, '../../../');


function loadConfig(exitWhenError) {
  /**
   * load default config from server codebase
   */
  let defaultCfg = require('./config_default');
  /**
   * load default production config from server codebase
   */
  let defaultReleaseCfg = require('./config');


  let config = {};
  _.merge(config, defaultCfg, defaultReleaseCfg);

  // load config from server deploy base
  // config_default.js: the server default config, do not modify
  // config.js: the custom config file, edit config here
  //
  // then server will merge({}, config_default, config)
  let servConfigFile = path.join(installServerRoot, '/conf/config_default.js');
  let servConfigCustomFile = path.join(installServerRoot, '/conf/config.js');
  let servConfig = {};
  let servConfigCustom = {};
  if (fs.existsSync(servConfigFile)) {
    try {
      servConfig = require(servConfigFile);
    } catch (e) {
      console.error("[honeycomb-server] loading conf/config_default.js failed", e)
      throw e
    }
  }
  if (fs.existsSync(servConfigCustomFile)) {
    try {
      servConfigCustom = require(servConfigCustomFile);
    } catch (e) {
      console.error("[honeycomb-server] loading conf/config.js failed", e)
      throw e
    }
  }
  let serverList = [].concat(
    config.list || [],
    servConfig.serverList || [],
    servConfigCustom.serverList || []
  );
  _.merge(config, servConfig, servConfigCustom);
  config.serverList = serverList;

  fs.sync().mkdir(path.join(config.serverRoot, './conf/custom'));

  /* istanbul ignore if
  if (!config.serverRoot) {
    let e = new Error('should configed in  config_default.js');
    printMsg(e, '', 'config.serverRoot missing');
  }*/
  function loadJsConfig(file) {
    let code = fs.readFileSync(file);
    let m = {
      exports: {}
    };
    let fn = new Function('module', 'exports', 'require', 'global', 'process', '__filename', '__dirname', code);
    fn(m, m.exports, require, global, process, file, path.dirname(file));
    return m.exports;
  }

  function loadJsonConfig(file) {
    let cfg = JSON.parse(fs.readFileSync(file));
    return utils.decryptObject(cfg, config.configSecret);
  }

  /**
   * load custom config.js
   */
  try {
    let cfgPath = path.join(config.serverRoot, './conf/custom/config.js');
    let customCfg = {};
    if (fs.existsSync(cfgPath)) {
      customCfg = loadJsConfig(cfgPath);
    }
    _.merge(config, customCfg);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'MODULE_NOT_FOUND', 'Loading conf/custom/config.js failed.');
  }

  /**
   * load custom/server.json
   */
  try {
    let oldCfg = {};
    let newCfg = {};
    let oldPath = path.join(config.serverRoot, './conf/custom/config_server.json');
    let newPath = path.join(config.serverRoot, './conf/custom/server.json');
    if (fs.existsSync(oldPath)) {
      oldCfg = loadJsonConfig(oldPath);
    }
    newCfg = loadJsonConfig(newPath);
    _.merge(config, oldCfg, newCfg);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'ENOENT', 'Loading conf/custom/server.json failed.');
  }

  /**
   * load conf/custom/common.json
   */
  try {
    let oldCfg = {};
    let newCfg = {};
    let oldPath = path.join(config.serverRoot, './conf/custom/apps_common.json');
    let newPath = path.join(config.serverRoot, './conf/custom/common.json');
    if (fs.existsSync(oldPath)) {
      oldCfg = loadJsonConfig(oldPath);
    }
    newCfg = loadJsonConfig(newPath);
    _.merge(config.appsCommon, oldCfg, newCfg);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'ENOENT', 'Loading apps common config failed.');
  }

  /**
   * load each app's config
   * master will merge app's common config into app's config
   * when call master.getAppConfig, so do not merge here
   * because app's common config will be modified too
   */
  /* istanbul ignore if */
  if (!config.apps) {
    config.apps = {};
  }

  let appsCfgFiles = [];
  let appsCfgPath;
  appsCfgPath = path.join(config.serverRoot, './conf/custom/apps');
  try {
    appsCfgFiles = fs.readdirSync(appsCfgPath);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'ENOENT', 'Read directory `conf/custom/apps` failed.');
  }
  appsCfgFiles.forEach((file) => {
    let m = file.match(/(.+)(\.json$)/);
    if (!m) {
      return;
    }
    let appName = m[1];
    try {
      let appCfg = loadJsonConfig(path.join(appsCfgPath, file));
      config.apps[appName] = _.merge({}, config.apps[appName], appCfg);
    } catch (e) {
      printMsg(e, 'ENOENT', `[ERROR] Loading conf/custom/apps/${appName}.json failed`);
    }
  });

  function printMsg(e, code, errMsg, infoMsg) {
    if (e.code !== code) {
      console.error(new Date(), '[ERROR] ' + errMsg, e.code, e.message);
      if (exitWhenError) {
        throw e;
      }
    } else {
      if (infoMsg) {
        console.log('[INFO] ' + infoMsg);
      }
    }
  }
  /**
   * prepare config
   */
  /* istanbul ignore if */
  if (!config.proxy.index || config.proxy.index === '/') {
    config.proxy.index = null;
  }
  // 兼容老应用
  config.ipList = config.serverList;
  /**
   * init private config
   */
  config.runDir = path.join(config.serverRoot, './run');
  config.pidFile = path.join(config.runDir, './honeycomb.pid');
  config.serverStatusFile = path.join(config.runDir, './_server_status');
  config.proxy.nginxIncludePath = path.join(config.runDir, './nginx');
  config.proxy.proxyAdmin = utils.fixPath(config.proxy.proxyAdmin);
  /* istanbul ignore if */
  if (!config.appsRoot) {
    config.appsRoot = path.join(config.runDir, './appsRoot');
  }
  if (!config.logsRoot) {
    config.logsRoot = path.join(config.serverRoot, './logs');
  }

  // 日志文件下载限速 单位 bytes per second
  if (!config.logFileDownloadRate) {
    config.logFileDownloadRate = 500 * 1024;
  }
  /* istanbul ignore if */
  if (!config.appsSessionPath) {
    config.appsSessionPath = path.join(config.runDir, './app.mount.info.yaml');
  }
  /*
  function cleanCache(mod) {
    let mPath;
    let cached;
    try {
      mPath = require.resolve(mod);
      cached = require.cache[mPath];
      delete require.cache[mPath];
      cached.parent.children.filter((node) => node !== cached);
    } catch (e) {
      // do nothing
    }
  }
  */
  config.reload = function () {
    // cleanCache('./config_default');
    // cleanCache('./config');
    // cleanCache(path.join(installServerRoot, './conf/config_default.js'));
    // cleanCache(path.join(installServerRoot, './conf/config.js'));
    // cleanCache(path.join(installServerRoot, './conf/custom/config.js'));
    gConfig = loadConfig();
  };
  return config;
}
let gConfig = loadConfig(true);

let configProxy = new Proxy(gConfig, {
  get: (target, key) => {
    return gConfig[key];
  },
  set: (target, key/* , value*/) => {
    // if (key === 'reload') {
    throw new Error(`can not set global config properties "${key}" dynamic, please using config file`);
    // }
    // gConfig[key] = value;
    // return true;
  }
});

module.exports = configProxy;
