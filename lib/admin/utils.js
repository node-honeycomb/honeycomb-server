'use strict';

const _ = require('lodash');
const async = require('async');
const urllib = require('urllib');
const config = require('../../config');
const log = require('../../common/log');
const utils = require('../../common/utils');
const url = require('url');
const cprocess = require('child_process');
const os = require('os');
const fs = require('fs');
const qs = require('querystring');

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

  const originCallback = options.originCallback;
  delete options.originCallback;

  let arr = [];
  let result = {};
  ips.forEach(function (ip) {
    let port = config.admin.port;
    arr.push(function (done) {
      let opt = _.merge({}, defaultOptions, options);
      if (typeof opt.prepare === 'function') {
        opt.prepare();
      }
      let signed = exports.sign(queryPath, opt);
      queryPath = signed.queryPath;
      let protocol = config.admin.https ? 'https' : 'http';
      let url;
      if (/\//.test(ip)) {
        url = `${ip}${queryPath}`;
      } else {
        url = `${protocol}://${ip}:${port}${queryPath}`;
      }
      urllib.request(url, opt, function (err, data, res) {
        if (err) {
          log.error(`request ${url} in callremote failed: `, err);
        }
        originCallback && originCallback(err, data, res, ip);
        result[ip] = err || data; // err封装在result对象中，前端处理
        if (options.series) {
          done(err);
        } else {
          done(null);
        }
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
          code: results[ip].code,
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

/**
 * os memory usage, return percentage
 */
exports.sysMemUsage = (callback) => {
  let platform = os.platform();
  if (platform === 'darwin' || platform === 'freebsd') {
    cprocess.exec('memory_pressure', (err, stdout) => {
      let lines = stdout.toString().split('\n');
      let res = 0;
      lines.forEach((line) => {
        if (/free percentage/.test(line)) {
          res = Number(line.split(':')[1].replace(/%/g, '')) / 100;
        }
      });
      callback(null, res);
    });
  } else if (platform === 'linux') {
    fs.readFile('/proc/meminfo', 'utf8', function (err, str) {
      if (err) {
        return callback(err);
      }
      let result = {};
      str.split('\n').forEach(function (line) {
        var parts = line.split(':');
        if (parts.length === 2) {
          result[parts[0]] = Number(parts[1].trim().split(' ', 1)[0]);
        }
      });
      callback(null, (result.Buffers + result.Cached + result.MemFree) / result.MemTotal);
    });
  } else {
    callback(null, os.freemem() / os.totalmem());
  }
};
