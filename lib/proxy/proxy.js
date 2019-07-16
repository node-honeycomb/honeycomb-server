'use strict';

const Events = require('events');
const log = require('../../common/log');
const commonUtils = require('../../common/utils');
const diff = require('deep-object-diff').diff;
const _ = require('lodash');
const FLAG_PROXY = 'PROXY';

function genDefaultIp(ipv6) {
  if (ipv6) {
    return '::';
  } else {
    return '0.0.0.0';
  }
}
/**
 * basic proxy class
 * @class Proxy
 */
class Proxy extends Events {
  constructor(options) {
    super();

    if (!options.bind) {
      options.bind = [{
        ip: options.ip || '*',
        port: options.port || '80',
        default: true,
        ssl: false,
        ipv6: false
      }];
    }
    options.bind.forEach((cfg) => {
      if (cfg.ip === '*') {
        cfg.ip = genDefaultIp(cfg.ipv6);
      }
      if (/:/.test(cfg.ip)) {
        cfg.ipv6 = true;
      } else {
        cfg.ipv6 = false;
      }
      cfg.default = true;
    });
    this.options = options;
    this.apps = [];
    this.map = {};
    this.appsBackup = [];
  }
  register(app, cb) {
    this.backup();
    app = _.clone(app);
    /**
     * if already register, offline app's old version
     * it only happend on reload action
     */
    let apps = this.apps;
    for (let j = 0, len1 = apps.length; j < len1; j++) {
      let appOrigin = apps[j];
      if (
        appOrigin.status === 'on' &&
        appOrigin.appId === app.appId
      ) {
        appOrigin.status = 'off';
      }
    }
    app.status = 'on';
    // log.warn('app registerd', app);
    // new version in front of all
    this.apps.unshift(app);

    if (!app.reload) {
      log.debug(FLAG_PROXY, `register app: ${app.appId},type: ${app.type}, bind: ${app.bind}, router: ${app.router}`);
      this.updateRouter(cb);
    } else {
      // 如果是reload, 不触发路由更新下
      log.debug(FLAG_PROXY, 'register app by reload action, server will call router update manually');
      app.reload = false;
    }
  }

  /**
   * unregister app router
   *
   * @param {Object} app
   *   bind: '8080',
   *   router: '/example',
   *   target: '*.1.sock',
   *   appId: 'simple-app',
   *   name: 'simple-app',
   *   version: '0.0.0',
   *   buildNum: 0,
   *   pid: 4588,
   *   type: 'socket',  // default 'http', http | stream
   *   sockList: ['1.sock, 2.sock']
   */
  unregister(app, cb) {
    this.backup();
    if (typeof app === 'string') {
      app = {
        appId: app
      };
    }
    let apps = this.apps;
    for (let l = 0, len2 = apps.length; l < len2; l++) {
      let value = apps[l];
      if (value.appId === app.appId) {
        value.status = 'off';
      }
    }
    this.updateRouter(cb);
  }
  backup() {
    this.appsBackup = JSON.parse(JSON.stringify(this.apps));
  }
  rollback(cb) {
    this.apps = this.appsBackup;
    this.appsBackup = [];
    this.updateRouter(cb || function () {});
  }
  /**
   * 更新路由
   */
  updateRouter() {
    let apps = [];
    let originApps = this.apps;
    let map = {};
    // 过滤得到在线app map
    originApps.forEach((app) => {
      if (app.status !== 'on') {
        return;
      }
      let appInfo = commonUtils.parseAppId(app.appId);
      app.weight = commonUtils.genWeight(appInfo.version, appInfo.buildNum);
      if (!map[appInfo.name]) {
        map[appInfo.name] = [app];
      } else {
        map[appInfo.name].push(app);
      }
      apps.push(app);
    });

    /**
     * 排序各app, 并合并app
     *   同一个app不同版本合并成一个，并为权重最大者分配流量
     *   ---并且将最近的一个版本作为upstream的backup---
     */
    Object.keys(map).forEach((key) => {
      let appList = map[key];
      appList.sort((a, b) => {
        return b.weight - a.weight;
      });
      map[key] = appList[0];
      /*
      if (appList[1]) {
        appList[0].backupSockList = appList[1].sockList;
        appList[0].backupPortList = appList[1].portList;
      }
      */
    });

    // diff map object
    let routeDiff = diff(map, this.map);
    if (_.isEmpty(routeDiff)) {
      log.info(FLAG_PROXY, 'router have no change');
      return false;
    }
    this.map = map;
    this.apps = apps;
    return true;
  }
  /**
   * 处理从app发过来的启动信息，主要两个内容：
   *   * bind信息解析，  ip 为空则 0.0.0.0， port
   *   * serverName规范化， 为空则忽略，加工成数组
   *   * router规范化， 以/结束
   *
   * @param{Object} config
   *   serverName  {String|Array}
   *   router {String}
   *   bind {string|Number|Object|Array}
   */
  prepareBind(config, options) {
    let serverName = config.serverName;
    // format serverName when socket proxy
    if (config.type === 'stream') {
      serverName = ['*'];
    }
    // serverName can be string or array
    switch (typeof serverName) {
      case 'string':
        serverName = [serverName.trim()];
        break;
      case 'object':
        if (!Array.isArray(serverName)) {
          serverName = ['*'];
        } else if (serverName.length === 0) {
          serverName = ['*'];
        }
        break;
      default:
        serverName = ['*'];
    }
    serverName.forEach((v, i, a) => {
      if (!/^[\w\.\-\*]+$/.test(v)) {
        log.error(FLAG_PROXY, 'prepareBind error, serverName illegal', v, 'should match /^[\w\.\-\*]+$/, server will use * replace it');
        a[i] = '*';
      } else {
        a[i] = v.trim();
      }
    });

    if (config.router) {
      // add tail `/`
      if (!/\/$/.test(config.router)) {
        config.router += '/';
      }
    } else {
      config.router = '/';
    }
    // bind can be null or string or Array or object
    switch (typeof config.bind) {
      case 'string':
      case 'number':
        config.bind = [config.bind];
        break;
      case 'object':
        if (!Array.isArray(config.bind)) {
          // bind is object
          if (!Object.keys(config.bind).length) {
            config.bind = options.bind;
          } else {
            config.bind.ip = config.bind.ip || '*';
            config.bind = [config.bind];
          }
        } else if (!config.bind.length) {
          // empty
          config.bind = options.bind;
        }
        break;
      default:
        config.bind = options.bind || [];
    }

    let res = [];
    config.bind.forEach(function (v, i, a) {
      let singleBind;
      if (/^\d+$/.test(v)) {
        // 纯数字
        singleBind = {
          ip: genDefaultIp(v.ipv6),
          port: v
        };
      } else if (typeof v === 'string') {
        // if not port or ip:port, return
        if (!/^\d+$/.test(v) && !/[:\da-zA-Z]+:\d+$/.test(v)) {
          log.error(FLAG_PROXY, 'error bind:', v, 'from app:', config.appId);
          a[i] = null;
          return;
        }
        let tmp = v.trim().split(':');
        let port = tmp.pop();
        let ip = tmp.join(':') || '*';
        singleBind = {
          ip: ip,
          port: port,
          ipv6: /:/.test(ip)
        };
      } else {
        singleBind = v;
      }

      if (singleBind.ip === '*' || !singleBind.ip) {
        singleBind.ip = genDefaultIp(v.ipv6);
      }

      a[i] = singleBind;

      let obj = {
        id: singleBind.ip + ':' + singleBind.port,
        ip: singleBind.ip,
        port: singleBind.port,
        ipv6: singleBind.ipv6,
        serverName: serverName,
        router: config.router,
        type: config.type,
        param: config.param
      };
      res.push(obj);
    });

    return res;
  }
  exit() {
    this.map = {};
    this.apps = [];
    this.appsBackup = [];
  }
}

module.exports = Proxy;
