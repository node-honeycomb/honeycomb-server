'use strict';

const _ = require('lodash');
const async = require('async');
const urllib = require('urllib');
const config = require('../../config');
const log = require('../../common/log');
const utils = require('../../common/utils');
const url = require('url');
const qs = require('querystring');
const port = config.admin.port;


exports.sign = function (queryPath, options) {
  let contentMd5;
  let date = new Date().toGMTString();
  let accept = 'application/json';
  let contentType = options.headers['Content-Type'];
  let stringToSign;
  if (['POST', 'PUT', 'PATCH'].indexOf(options.method) >= 0) {
    let tmp = options.data ? JSON.stringify(options.data) : '';
    contentMd5 = utils.md5base64(tmp);
  } else {
    contentMd5 = '';
    if (options.data) {
      let tmp = url.parse(queryPath, true);
      _.merge(tmp.query, options.data);
      queryPath = tmp.pathname + '?' + qs.stringify(tmp.query);
    }
    options.data = undefined;
  }
  stringToSign = `${options.method}\n${accept}\n${contentMd5}\n${contentType}\n${date}\n${queryPath}`;
  // log.debug('String to be signed: ', JSON.stringify(stringToSign));
  let signature = utils.sha1(stringToSign, config.admin.token);
  options.headers.Authorization = `system admin:${signature}`;
  options.headers.Date = date;

  return {
    signature: signature,
    queryPath: queryPath,
    stringToSign: stringToSign
  };
};

exports.callremote = function (queryPath, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }
  let ips = options.ips;
  let defaultOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 120000,
    dataType: 'json',
    rejectUnauthorized: false
  };
  if (!Array.isArray(ips) || !ips.length) {
    return callback(new Error('param missing: ips, url:' + queryPath));
  }

  let arr = [];
  let result = {};
  ips.forEach(function (ip) {
    let targetIp = ip;
    let targetPort = port;
    if (ip.indexOf(':') > 0) {
      let tmpArr = ip.split(':');
      targetIp = tmpArr[0];
      targetPort = tmpArr[1];
    }
    arr.push(function (done) {
      let opt = _.merge({}, defaultOptions, options);
      if (typeof opt.prepare === 'function') {
        opt.prepare();
      }
      let signed = exports.sign(queryPath, opt);
      queryPath = signed.queryPath;
      let protocol = config.admin.https ? 'https' : 'http';
      let url = `${protocol}://${targetIp}:${targetPort}${queryPath}`;
      urllib.request(url, opt, function (err, data) {
        if (err) {
          log.error(`request ${url} in callremote failed: `, err);
        }
        result[ip] = err || data; // err封装在result对象中，前端处理
        done(null);
      });
    });
  });
  if (options.series) {
    async.series(arr, function () {
      callback(null, result);
    });
  } else {
    async.parallel(arr, function () {
      callback(null, result);
    });
  }
};

exports.resultsWrap = function (err, results) {
  let info = [];
  let errMsg = [];
  if (err) {
    return {
      code: err.code || 'ERROR',
      message: err.message
    };
  }
  if (typeof results === 'object') {
    Object.keys(results).forEach(function (ip) {
      if (results[ip].code === 'SUCCESS') {
        info.push({
          ip: ip,
          data: results[ip].data
        });
      } else {
        errMsg.push({
          ip: ip,
          message: results[ip].message || results[ip].stack || results[ip]
        });
      }
    });
  }
  return {
    code: 'SUCCESS',
    data: {
      success: info,
      error: errMsg
    }
  };
};
