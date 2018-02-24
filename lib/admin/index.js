'use strict';
const ejs = require('ejs');
const path = require('path');
const Events = require('events');
const express = require('express');
const bodyParser = require('body-parser');
const auth = require('./auth');
const routers = require('./router');
const message = require('../message');
const log = require('../../common/log');
const gatherUsage = require('./gather_usage');
const fs = require('fs');

class Admin extends Events {
  constructor(options) {
    super();
    this.options = options;
    this._init();
    message.setTimeout(60 * 1000 * 5); // 5'm
  }
  _init() {
    const server = express();
    server.engine('html', ejs.renderFile);
    server.set('view engine', 'html');
    server.set('views', path.join(__dirname, './view'));
    server.use(bodyParser.urlencoded({extended: true}));
    server.use(bodyParser.json({
      strict: true,
      verify: function (req, res, buf, encoding) {
        req.orignalBody = buf.toString(encoding);
      }
    }));
    server.use(auth);
    server.use(routers(new express.Router()));
    server.use(function (err, req, res, next) {
      log.error('[ADMIN] controller error', err);
      if (res.headersSent) {
        return next(err);
      }
      res.status(500);
      return res.json(err);
    });
    if (this.options.https) {
      let key;
      let cert;
      try {
        key = fs.readFileSync(this.options.https.key);
        cert = fs.readFileSync(this.options.https.cert);
      } catch (err) {
        log.warn('[ADMIN]', 'https key or cert file error, reflog to http');
        this.options.https = undefined;
      }
      let httpsOpt = {
        key: key,
        cert: cert
      };
      this.server = require('https').createServer(httpsOpt, server);
    } else {
      this.server = require('http').createServer(server);
    }
  }
  close() {
    this.removeAllListener();
    return this.server.close();
  }
  run(cb) {
    let opt = this.options;

    this.server.listen(opt.port, function (err) {
      cb(err, {
        port: opt.port
      });
      log.info(`[ADMIN] listen ${opt.https ? 'https' : 'http'} on ${opt.port}`);
    });
  }
}

gatherUsage();

module.exports = Admin;
