'use strict';

const ejs = require('ejs');
const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const auth = require('./auth');
const routers = require('./router');
const message = require('../message');
const log = require('../../common/log');
const gatherUsage = require('./gather_usage');
const utils = require('../../common/utils');

function Admin(options) {
  this.options = options;
  this._init();
  message.setTimeout(60 * 1000 * 5); // 5'm
}

Admin.prototype._init = function () {
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
  server.use(function (req, res, next) {
    if (req.params) {
      if (req.params.appid) {
        let error = utils.checkAppId(req.params.appid);
        if (error) {
          return next({
            code: 'PARAM_ERROR',
            message: error.message
          });
        }
      }
      if (req.params.appName) {
        let error = utils.checkAppName(req.params.appName);
        if (error) {
          return next({
            code: 'PARAM_ERROR',
            message: error.message
          });
        }
      }
      next();
    } else {
      next();
    }
  });
  server.use(routers(new express.Router()));
  server.use(function (err, req, res, next) {
    log.error('[ADMIN] controller error', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500);
    return res.json(err);
  });
  return this.server = http.createServer(server);
};

Admin.prototype.close = function () {
  return this.server.close();
};

Admin.prototype.run = function (cb) {
  let opt = this.options;
  this.server.listen(opt.port, function () {
    cb(null, {
      port: opt.port
    });
  });
};

gatherUsage();

module.exports = Admin;
