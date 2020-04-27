'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const URL = require('url');
const log = require('../../../common/log');
const FLAG_PROXY = 'NODE_HTTP_PROXY';
const config = require('../../../config');
const uuid = require('uuid');
let traceIdName = config.proxy.traceIdName;

function getTargetSock(app) {
  let offset = app.offset || 0;
  let list = app.sockList;
  let target = list[offset];
  offset++;
  if (offset >= list.length) {
    offset = 0;
  }
  list.offset = offset;
  return target;
}
class HttpProxy {
  constructor(options) {
    this.map = {};
    if (options.param && options.param.server && options.param.server.ssl_certificate) {
      this.server = https.createServer({
        cert: fs.readFileSync(options.param.server.ssl_certificate, 'utf8'),
        key: fs.readFileSync(options.param.server.ssl_certificate_key, 'utf8')
      });
    } else {
      this.server = http.createServer();
    }
    this.agent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000
    });
    this.proxy = http;

    this.initHttpProxy();
    this.initWebSocketProxy();
    this.server.on('error', (err) => {
      log.error(FLAG_PROXY, 'proxy server listen failed', err.message, `port:${options.port}`);
    });
    this.server.on('clientError', function (err, sock) {
      sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    this.server.listen(options.port, options.host);
  }
  initWebSocketProxy() {
    // referer to: http-proxy : websocket proxy
    this.server.on('upgrade', (req, socket) => {
      req.__time_start = new Date();
      socket.setTimeout(0);
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 0);

      socket.on('end', () => {
        socket.end();
      });

      this._requestRouter(req, (err, app, headers) => {
        let param = {
          path: req.url,
          agent: this.agent,
          method: req.method,
          headers: headers
        };
        param.socketPath = getTargetSock(app); // forward.socketPath;

        req.__time_router = new Date();
        // print access for socket connection
        // accessLog(req);
        let proxyReq = this.proxy.request(param);
        proxyReq.on('response', function (res) {
          // if upgrade event isn't going to happen, close the socket
          if (!res.upgrade) socket.end();
        });
        proxyReq.on('error', function (err) {
          log.error(FLAG_PROXY, 'socket_upgrade_reqest_error', err);
          socket.end('create socket connection error');
        });

        proxyReq.on('upgrade', function (proxyRes, proxySocket, proxyHead) {
          proxySocket.on('error', function (err) {
            log.error(FLAG_PROXY, 'proxy_socket_error', err);
            socket.end('');
          });
          proxySocket.on('end', () => {
            proxySocket.end();
          });
          // The pipe below will end proxySocket if socket closes cleanly, but not
          // if it errors (eg, vanishes from the net and starts returning
          // EHOSTUNREACH). We need to do that explicitly.
          socket.on('error', function () {
            log.error(FLAG_PROXY, 'client socket error');
            proxySocket.end();
          });

          proxySocket.setTimeout(0);
          proxySocket.setNoDelay(true);
          proxySocket.setKeepAlive(true, 0);

          if (proxyHead && proxyHead.length) {
            proxySocket.unshift(proxyHead);
          }
          //
          // Remark: Handle writing the headers to the socket when switching protocols
          // Also handles when a header is an array
          //
          let info = Object.keys(proxyRes.headers).reduce(function (head, key) {
            var value = proxyRes.headers[key];

            if (!Array.isArray(value)) {
              head.push(key + ': ' + value);
              return head;
            }

            for (var i = 0; i < value.length; i++) {
              head.push(key + ': ' + value[i]);
            }
            return head;
          }, ['HTTP/1.1 101 Switching Protocols']);

          socket.write(info.join('\r\n') + '\r\n\r\n');

          proxySocket.pipe(socket).pipe(proxySocket);
        });
        proxyReq.end();
      });
    });
  }

  initHttpProxy() {
    let healthCheck = config.proxy.healthCheck;
    this.server.on('request', (req, res) => {
      /*
      res.on('finish', function () {
        accessLog(req, res);
      });
      */
      req.__time_start = new Date();

      this._requestRouter(req, (err, app, headers) => {
        req.__time_router = new Date();
        if (err) {
          log.debug(FLAG_PROXY, err.message);
          // TODO process healthCheck
          if (req.url === healthCheck.router) {
            fs.readFile(healthCheck.file, (err, data) => {
              if (err) {
                res.statusCode = 404;
                res.end('');
              } else {
                res.statusCode = 200;
                res.end(data);
              }
            });
          } else {
            res.statusCode = 404;
            res.end('Not Found');
          }
          return;
        }

        let param = {
          agent: this.agent,
          method: req.method,
          headers: headers,
          path: req.url
        };
        // if (forward.host) {
        //  param.host = forward.host;
        //  param.port = forward.port;
        // } else if (forward.socketPath) {
        param.socketPath = getTargetSock(app); // .socketPath;
        // }
        let proxyReq = this.proxy.request(param, function (proxyRes) {
          res.statusCode = proxyRes.statusCode;
          const ref = proxyRes.headers;
          for (let k in ref) {
            res.setHeader(k, ref[k]);
          }
          proxyRes.pipe(res);
        });
        req.on('error', function (err) {
          log.error(FLAG_PROXY, 'proxy_origin_request_error', req.url, err);
          res.statusCode = 500;
          res.end(err.code);
        });
        proxyReq.on('error', function (err) {
          if (proxyReq.aborted) {
            return res.emit('finish');
          }
          log.error(FLAG_PROXY, `proxy_request_error, req url: ${req.url}, sock: ${param.socketPath}  ip: err:`, err);
          res.statusCode = 500;
          res.end('server error: ' + err.code);
        });

        req.on('aborted', function () {
          res.statusCode = 499; // client has abort query
          proxyReq.abort();
        });
        req.pipe(proxyReq);
      });
    });
  }
  /**
   * [bind description]
   * @param  {Object} serverList
   *      serverList: {
   *        test1.com: []
   *        test2.com: []
   *        *: []
   *      }
   */
  bind(serverMap) {
    this.map = serverMap;
  }
  /**
   * 请求时路由匹配，规则如下：
   *   1. 具体的域名优先，具体的域名中，最新注册的优先
   *   2. 泛域名(*) 其次，最新注册的优先
   *
   *  目前还不支持 *.xxx.com 这种泛域名解析， 以及 多版本 ab-test
   * @return {[type]} [description]
   */
  _requestRouter(req, cb) {
    let url = req.url;
    let urlObj = URL.parse(url);
    let pathname = urlObj.pathname;

    if (!pathname.endsWith('/')) {
      pathname = pathname + '/';
    }
    // TODO  req.headers is always a object
    let headers = req.headers;
    let host = headers.host || '';
    let ip = headers['x-forwarded-for'] || req.socket.remoteAddress;
    let serverName;
    let rid;
    if (traceIdName) {
      rid = headers[traceIdName] || '';
    } else {
      rid = uuid();
    }
    let index = host.indexOf(':');
    if (index > 0) {
      serverName = host.substr(0, index);
    } else {
      serverName = host;
    }
    // headers['X-Forwarded-For'] = ip;
    // headers['X-Forwarded-For-Port'] = port;
    headers['X-Request-Id'] = rid;
    req.__remote_ip = ip;
    req.__rid = rid;
    log.debug(FLAG_PROXY, `request host: ${host}, serverName: ${serverName}, query_path:${pathname}, url: ${url}`);
    // router match
    let apps = this.map[serverName];
    if (apps) {
      for (let app of apps) {
        // let app = apps[i];
        // serverName and router match
        if (pathname.indexOf(app.router) === 0) {
          log.debug(FLAG_PROXY, 'match', app.appId, app.match);
          try {
            // cb maybe throw
            return cb(null, app, headers);
          } catch(err) {
            cb(err);
          }
        }
      }
    }
    log.debug(FLAG_PROXY, 'testing serverName: *, query_path:', pathname);
    apps = this.map['*'];
    if (apps) {
      for (let app of apps) {
        // let app = apps[i];
        // serverName and router match
        if (pathname.indexOf(app.router) === 0) {
          log.debug(FLAG_PROXY, 'match', app.appId, req.url);
          try {
            // cb maybe throw
            return cb(null, app, headers);
          } catch(err) {
            cb(err);
          }
        }
      }
    }
    cb(new Error('router not found, path:' + req.url));
  }
  close(cb) {
    let flagCB = false;
    function done() {
      if (flagCB) {
        return;
      }
      flagCB = true;
      try {
        cb && cb();
      } catch(e) {
        console.log(e)
      }
    }
    this.server.close(done);
    setTimeout(function () {
      done();
    }, 5000);
  }
}

module.exports = HttpProxy;
