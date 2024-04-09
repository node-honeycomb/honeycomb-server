'use strict';

const config = require('../../config');
const log = require('../../common/log');
const utils = require('../../common/utils');

function checkAuth(req) {
  let method = req.method;
  let url = req.originalUrl;
  let date = req.headers.date;
  let accept = req.headers.accept;
  let contentType = req.headers['content-type'];
  let authorization = req.headers['authorization'];


  /* check expire */
  let serverTime = new Date().getTime();
  let clientTime = (new Date(date)).getTime();
  if (Math.abs(serverTime - clientTime) > config.admin.signExpire) {
    return `signature expire, server time: ${serverTime}, client time: ${clientTime}, diff: ${Math.abs(serverTime - clientTime)}, expect less then: ${config.admin.signExpire}`;
  }
  /** check sign */
  let stringToSign;
  let contentMd5;
  if (['POST', 'PUT', 'PATCH'].indexOf(method) >= 0) {
    contentMd5 = utils.md5base64(req.orignalBody || '');
  } else {
    contentMd5 = '';
  }
  stringToSign = `${method}\n${accept}\n${contentMd5}\n${contentType}\n${date}\n${url}`;
  let serverSign = utils.sha1(stringToSign, config.admin.token);
  let userSign = authorization.split(':')[1];
  if (serverSign !== userSign) {
    log.debug(`signature not match, serverSign: ${serverSign}, clientSign: ${userSign}, stringToSign: ${stringToSign}`);
    return 'signature not match, please check server-side log';
  }
  return true;
}

module.exports = function (req, res, next) {
  if (req.path === '/' || req.path === '/api/defaultPublish'
    || req.path == '/api/health' || req.path == '/api/liveness') {
    return next();
  }
  if (req.headers.authorization) {
    let checkRes = checkAuth(req);
    if (checkRes === true) {
      return next();
    } else {
      res.statusCode = 403;
      res.json({code: 'AUTH_ERROR', message: checkRes});
    }
  } else {
    res.statusCode = 403;
    res.json({code: 'AUTH_ERROR', message: 'Authorization failed.'});
  }
};
