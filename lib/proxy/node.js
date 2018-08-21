'use strict';

const path = require('path');
const Proxy = require('./proxy');
const message = require('../message');
const Child = require('../child');
const log = require('../../common/log');
const FLAG_NODE = 'NODE';
const appId = '__PROXY__';

class Node extends Proxy {
  constructor(options) {
    super(options);
    this.init(options);
    this.proxy = new Child(appId);
    this.proxy.on('ready', () => {
      this.updateRouter(() => {
        this.emit('ready');
      });
    });
    this.proxy.on('message', (childProc, msg) => {
      message.receive(msg, childProc, this);
    });
  }
  init(options) {
    this.options = options;
  }
  _start() {
    this.proxy.start({
      file: path.join(__dirname, './node_proxy/index.js'),
      appId: appId,
      config: {}
    });
    this.proxyStarted = true;
  }
  updateRouter(callback) {
    let flag = super.updateRouter();
    if (flag === false) {
      return callback(null);
    }
    let map = this.map;
    let apps = Object.keys(map);

    /**
     * @type {Object}
     *
     *  {
     *    ip:port: {
     *      ip: '',
     *      port: '',
     *      type: 'stream | http',
     *      servers: {
     *        test1.com: []
     *        test2.com: []
     *        *: []
     *      }
     *    }
     *  }
     */
    let ips = {};
    apps.forEach((appId) => {
      let app = this.map[appId];
      let binds = this.prepareBind(app, this.options);
      binds.forEach((bind) => {
        if (!ips[bind.id]) {
          ips[bind.id] = {
            ip: bind.ip,
            port: bind.port,
            type: bind.type,
            param: app.param,
            servers: {}
          };
        }
        let cfg = ips[bind.id];
        // http and https check, one port service a protocol;
        if (cfg.type !== bind.type) {
          return log.warn(`proxy_already_in_use [${cfg.type}], app ${appId}[${app.type}] can not listen this port`);
        }
        if (!bind.serverName.length) {
          bind.serverName = ['*'];
        }

        bind.serverName.forEach((serverName) => {
          if (!cfg.servers[serverName]) {
            cfg.servers[serverName] = [];
          }
          cfg.servers[serverName].push({
            appId: appId,
            router: bind.router,
            sockList: app.sockList,
            sockListBackup: app.backupSockList
          });
        });
      });
    });

    if (!this.proxyStarted) {
      this._start();
    }

    this.proxy.send({
      action: '$update',
      data: ips
    }, function (err) {
      if (err) {
        log.error(FLAG_NODE, 'proxy_update_failed', err);
      } else {
        log.info(FLAG_NODE, 'proxy_updated');
      }
      callback(err);
    });
  }
  exit() {
    super.exit();
    this.proxy.stop();
  }
}

module.exports = Node;
