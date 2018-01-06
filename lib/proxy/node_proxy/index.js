'use strict';

const Events = require('events');
const HttpProxy = require('./http');
const NetProxy = require('./net');

function getProxy(type) {
  return type === 'stream' ? NetProxy : HttpProxy;
}

class NodeProxyManager extends Events {
  constructor() {
    super();
    this.proxys = {};
  }
  /**
   * update router
   * @param  {Object} map
   *  {
   *    ip:port: {
   *      ip: '',
   *      port: '',
   *      type: 'stream | http',
   *      servers: {
   *        test1.com: []
   *        test2.com: []
   *        *: []
   *       }
   *    }
   *  }
   */
  $update(map, cb) {
    let binds = Object.keys(map);
    let serverUsed = {};
    binds.forEach((key) => {
      let bind = map[key];
      if (!this.proxys[key]) {
        let Proxy = getProxy(bind.type);
        this.proxys[key] = new Proxy({
          ip: bind.ip,
          port: bind.port,
          param: bind.param
        });
      }
      let proxy = this.proxys[key];
      proxy.bind(bind.servers);
      serverUsed[key] = true;
    });
    Object.keys(this.proxys).forEach((key) => {
      if (serverUsed[key]) {
        return;
      }
      this.proxys[key].close();
      delete this.proxys[key];
    });
    cb && cb(null, 'success');
  }
  run(cb) {
    cb && cb(null, {});
  }
}

module.exports = new NodeProxyManager();
