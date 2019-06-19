'use strict';

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const FLAG_PROXY = 'NODE_STREAM_PROXY';
const log = require('../../../common/log');

function getTargetSock(app) {
  let offset = app.offset || 0;
  let list = (app.portList && app.portList.length > 0) ? app.portList : app.sockList;
  let target = list[offset];
  offset++;
  if (offset >= list.length) {
    offset = 0;
  }
  list.offset = offset;
  return target;
}


class NetProxy {
  constructor(options) {
    this.map = {};
    let proxy = net;

    if (options.param && options.param.ssl_certificate) {
      this.server = tls.createServer({
        key: fs.readFileSync(options.param.ssl_certificate),
        cert: fs.readFileSync(options.param.ssl_certificate_key)
      });
    } else {
      this.server = net.createServer();
    }
    this.server.on('error', function (err) {
      log.error(FLAG_PROXY, 'socket proxy server error', err);
    });
    this.server.on('connection', (socket) => {
      log.debug(FLAG_PROXY, 'client connected');
      let app = this.map['*'][0];
      /**
       * app always exists, ignore following check
       */
      /*
      if (!app) {
        log.error(FLAG_PROXY, 'no app register on this port', socket.remoteAddress, socket.remotePort);
        return socket.end();
      }
      */
      let target = getTargetSock(app);
      let param = {};
      if (typeof target === 'number') {
        param.port = target;
      } else {
        param.path = target;
      }
      let client = proxy.connect(param, function () {
        socket.pipe(client);
        client.pipe(socket);
      });

      client.on('error', (err) => {
        log.error(FLAG_PROXY, 'proxy_client_error', err);
        socket.end();
      });
      client.on('end', () => {
        client.end();
      });

      socket.on('error', (err) => {
        log.error(FLAG_PROXY, 'remote_client_error', err);
        client.end();
      });
      socket.on('end', () => {
        socket.end();
      });
    });
    this.server.listen(options.port, options.host);
  }
  bind(serverMap) {
    this.map = serverMap;
  }
  close(cb) {
    let flagCB = false;
    function done() {
      if (flagCB) {
        return;
      }
      flagCB = true;
      cb && cb();
    }
    this.server.close(done);
    setTimeout(function () {
      done();
    }, 5000);
  }
}

module.exports = NetProxy;
