'use strict';

/* eslint no-console: 0 */
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const utils = require('../common/utils');


const installServerRoot = process.env.HONEYCOMB_SERVER_ROOT || path.join(__dirname, '../../../');

function loadConfig() {
  /**
   * load default config from server codebase
   */
  let defaultCfg = require('./config_default');
  let userCfg = {};
  /**
   * load release config from server codebase
   */
  try {
    userCfg = require('./config');
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'MODULE_NOT_FOUND', 'Loading inner config failed.');
  }

  let config = _.merge({}, defaultCfg, userCfg);

  // load config from server deploy base
  // config_default.js: the server default config, do not modify
  // config.js: the custom config file, edit config here
  //
  // then server will merge({}, config_default, config)
  try {
    let servConfig = {};
    let servConfigCustom = {};
    let servConfigFile = path.join(installServerRoot, '/conf/config_default.js');
    let servConfigCustomFile = path.join(installServerRoot, '/conf/config.js');
    if (fs.existsSync(servConfigFile)) {
      servConfig = require(servConfigFile);
    }
    if (fs.existsSync(servConfigCustomFile)) {
      servConfigCustom = require(servConfigCustomFile);
    }
    let serverList = [].concat(
      config.list || [],
      servConfig.serverList || [],
      servConfigCustom.serverList || []
    );
    config = _.merge(config, servConfig, servConfigCustom);
    config.serverList = serverList;
  } catch (e) {
    printMsg(e, 'MODULE_NOT_FOUND', 'Loading server config failed:');
  }

  /* istanbul ignore if */
  if (!config.serverRoot) {
    let e = new Error('should configed in  config_default.js');
    printMsg(e, '', 'config.serverRoot missing');
  }
  /**
   * fn load json config file
   */
  function loadJsonConfig(file) {
    let cfg = JSON.parse(fs.readFileSync(file));
    return utils.decryptObject(cfg, config.configSecret);
  }

  /**
   * load server.json
   */
  let serverCfg = {};
  try {
    let oldPath = path.join(config.serverRoot, './conf/config_server.json');
    let newPath = path.join(config.serverRoot, './conf/server.json');
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
    serverCfg = loadJsonConfig(newPath);
    config = _.merge(config, serverCfg);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'ENOENT', 'Loading server config failed.');
  }

  /**
   * load common.json
   */
  try {
    let oldPath = path.join(config.serverRoot, './conf/apps_common.json');
    let newPath = path.join(config.serverRoot, './conf/common.json');
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
    let appsCommon = loadJsonConfig(newPath);
    config.appsCommon = _.merge(config.appsCommon, appsCommon);
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
  try {
    appsCfgPath = path.join(config.serverRoot, './conf/apps');
    appsCfgFiles = fs.readdirSync(appsCfgPath);
  } catch (e) {
    /* istanbul ignore next */
    printMsg(e, 'ENOENT', 'Read directory `conf/apps` failed.');
  }
  appsCfgFiles.forEach((file) => {
    let m = file.match(/(.+)(\.json$)/);
    if (m) {
      let appName = m[1];
      try {
        let appCfg = loadJsonConfig(path.join(appsCfgPath, file));
        config.apps[appName] = _.merge({}, config.apps[appName], appCfg);
      } catch (e) {
        printMsg(e, 'ENOENT', `[ERROR] Loading app config failed: ${appName}.json`);
      }
    }
  });

  function printMsg(e, code, errMsg, infoMsg) {
    if (e.code !== code) {
      console.error(new Date(), '[ERROR] ' + errMsg, e.code, e.message);
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

  /* istanbul ignore if */
  if (!config.appsRoot) {
    config.appsRoot = path.join(config.runDir, './appsRoot');
  }
  /* istanbul ignore if */
  if (!config.appsSessionPath) {
    config.appsSessionPath = path.join(config.runDir, './app.mount.info.yaml');
  }

  config.reload = function () {
    try {
      delete require.cache[require.resolve('./config')];
    } catch (e) {
      // do nothing
    }
    try {
      delete require.cache[require.resolve('./config_default')];
    } catch (e) {
      // do nothing
    }
    try {
      delete require.cache[require.resolve(path.join(installServerRoot, './conf/config_default.js'))];
    } catch (e) {
      // do nothing
    }
    try {
      delete require.cache[require.resolve(path.join(installServerRoot, './conf/config.js'))];
    } catch (e) {
      // do nothing
    }
    gConfig = loadConfig();
  };
  return config;
}
let gConfig = loadConfig();

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
