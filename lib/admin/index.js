'use strict';
const ejs = require('ejs');
const path = require('path');
const Events = require('events');
const express = require('express');
const bodyParser = require('body-parser');
const auth = require('./auth');
const routers = require('./router');
const message = require('../message_worker');
const log = require('../../common/log');
const gatherUsage = require('./gather_usage');
const fs = require('fs');
const sysInfo = require('./sysinfo');

class Admin extends Events {
  constructor(options) {
    super();
    this.options = options;
    this._init();
    message.setTimeout(60 * 1000 * 5); // 5'm
    this.on('offline', (done) => {
      this.close(()=> {
        done();
        process.exit(0);
      });
    });
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
    server.use(this.options.healthCheck, (req, res) => {
      res.end('ok');
    });
    if (this.options.prometheus) {
      const prom = require('prom-client');
      const register = prom.register;
      let exceptionGauger = new prom.Gauge({
        name: 'app_exit_count',
        help: 'check if any app exit',
      });
      let healthCheckGauger = new prom.Gauge({
        name: 'server_in_publish',
        help: 'check if server is publishing app',
      });
      let time = new Date();
      server.use('/metrics', async (req, res) => {
        try {
          let timeCousor = time;
          time = new Date();
          let appExitCount = await message.asyncSend({
            action: '$appExitCount',
            arguments: [timeCousor]
          });
          exceptionGauger.set(appExitCount);
          let serverPublishFlag = await message.asyncSend({
            action: '$healthCheckEnable',
            arguments: []
          });
          healthCheckGauger.set(serverPublishFlag ? 1 : 0);
          let data = await register.metrics();
          res.setHeader('Content-Type', register.contentType);
          res.send(data);
        } catch (err) {
          log.error('[Prometheus Client] get metrics failed', err);
          res.status(500).send('get metrics failed');
        }
      });
    }
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
    let httpsOpt;
    if (this.options.https) {
      let key;
      let cert;
      try {
        key = fs.readFileSync(this.options.https.key);
        cert = fs.readFileSync(this.options.https.cert);
      } catch (err) {
        log.warn('[ADMIN]', 'https key or cert file error, reflog to http');
        this.options.https = null;
      }
      httpsOpt = {
        key: key,
        cert: cert
      };
    }
    this.server = this.options.https ? require('https').createServer(httpsOpt, server) : require('http').createServer(server);
    this.server.setTimeout(this.options.serverTimeout);
  }
  close(done) {
    this.removeAllListeners();
    this.server.close(done);
  }
  run(cb) {
    let opt = this.options;
    sysInfo.init(() => {
      this.server.listen(opt.port, function (err) {
        log.info(`[ADMIN] listen ${opt.https ? 'https' : 'http'} on ${opt.port}`);
        cb(err, {
          port: opt.port
        });
      });
    });
  }
}

gatherUsage();

module.exports = Admin;
