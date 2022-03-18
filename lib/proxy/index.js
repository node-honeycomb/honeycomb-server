'use strict';

const Events = require('events');
const NginxProxy = require('./nginx');
const NodeProxy = require('./node');

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

    if (options.nginxBin) {
      total = 2;
      this.nginx = new NginxProxy(options);
      this.nginx.once('ready', done);
    }

    this.node = new NodeProxy(options);
    this.node.once('ready', done);
  }

  init(options) {
    this.options = options;
    if (this.nginx) {
      this.nginx.init(options);
    }
    if (this.node) {
      this.node.init(options);
    }
  }

  getNodeChild() {
    if (!this.node) {
      return null;
    }
    return this.node.proxy;
  }
  getProxy(cfg) {
    let type = this.options.switch[cfg.type];
    if (type !== 'nginx' && type !== 'node') {
      throw new Error('config error: config.proxy.switch, the value only support `nginx` and `node`');
    }
    let proxy;

    if (!this.nginx) {     // if no nginx, force node
      proxy = this.node;
    } else if (!this.node) { // if no node, force nginx
      proxy = this[type];
    } else {
      proxy = this[type];
    }

    if (!proxy) {
      throw new Error('no proxy found');
    }
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
    this.nginx && this.nginx.exit();
    this.node && this.node.exit();
  }
}

module.exports = Proxy;
