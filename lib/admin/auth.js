'use strict';

const config = require('../../config');
const log = require('../../common/log');
const utils = require('../../common/utils');

function checkExpired(date) {
  let now = new Date().getTime();
  let timestamp = (new Date(date)).getTime();
  if (Math.abs(now - timestamp) > config.admin.signExpire) {
    let msg = `server timestamp: ${now}, user timestamp: ${timestamp}, diff: ${Math.abs(now - timestamp)}, expire time: ${config.admin.signExpire}`;
    log.error('Signature expired, ' + msg);
    return true;
  } else {
    return false;
  }
}

function checkAuth(req) {
  let method = req.method;
  let url = req.originalUrl;
  let date = req.headers.date;
  let accept = req.headers.accept;
  let contentType = req.headers['content-type'];
  let authorization = req.headers['authorization'];

  if (checkExpired(date)) {
    return false;
  }
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
    log.error('Authorization error: ', stringToSign);
    return false;
  }
  return true;
}

module.exports = function (req, res, next) {
  if (req.path === '/' || req.path === '/api/defaultPublish') {
    return next();
  }
  if (req.headers.authorization && checkAuth(req)) {
    next();
  } else {
    res.statusCode = 403;
    res.json({code: 'AUTH_ERROR', message: 'Authorization failed.'});
  }
};
