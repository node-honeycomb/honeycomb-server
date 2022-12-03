'use strict';

const Events = require('events');
const NginxProxy = require('./nginx');

class Proxy extends Events {
  constructor(options) {
    super();

    this.init(options);

    let total = 1;
    let count = 0;

    let self = this;
    function done() {
      count++;
      if (count === total) {
        self.emit('ready');
      }
    }
    this.nginx = new NginxProxy(options);
    this.nginx.once('ready', done);
  }

  init(options) {
    this.options = options;
    if (this.nginx) {
      this.nginx.init(options);
    }
  }
  getProxy(cfg) {
    let type = this.options.switch[cfg.type];
    if (type !== 'nginx') {
      throw new Error('config error: config.proxy.switch, the value only support `nginx`');
    }
    let proxy = this.nginx;
    return proxy;
  }
  register(cfg, cb) {
    let proxy;

    if (cfg.type !== 'http' && cfg.type !== 'stream') {
      return cb();
    }

    try {
      proxy = this.getProxy(cfg);
    } catch (e) {
      return cb(e);
    }
    proxy.register(cfg, cb);
  }
  unregister(cfg, cb) {
    let proxy;
    if (cfg.type !== 'http' && cfg.type !== 'stream') {
      return cb();
    }
    try {
      proxy = this.getProxy(cfg);
    } catch (e) {
      return cb(e);
    }
    proxy.unregister(cfg, cb);
  }
  updateRouter(cfg, cb) {
    let proxy;
    if (cfg.type !== 'http' && cfg.type !== 'stream') {
      return cb();
    }
    try {
      proxy = this.getProxy(cfg);
    } catch (e) {
      return cb(e);
    }
    proxy.updateRouter(cb);
  }
  exit() {
    this.nginx.exit();
  }
}

module.exports = Proxy;
