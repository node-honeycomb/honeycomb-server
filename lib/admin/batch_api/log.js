'use strict';

const qs = require('querystring');
const yazl = require('yazl');
const utils = require('../utils');
const config = require('../../../config');
const log = require('../../../common/log');
const resultsWrap = utils.resultsWrap;

/**
 * @api {get} /api/log
 * @desc 查询集群的日志
 *
 * @query
 *   ips {String} ips
 *   file {String}
 *   lines {Number} logLines
 *   startTime {String} 12:00:50
 *   filter {String} filter keyword
 */
exports.queryLogs = function (req, res, next) {
  let ips = req.query.ips;
  // 兼容老参数
  let query = {
    file: req.query.fileName || req.query.file,
    lines: req.query.logLines || req.query.lines,
    filter: req.query.filterString || req.query.filter,
    startTime: req.query.startTime
  };
  let url = '/api/single/log?' + qs.stringify(query);
  utils.callremote(url, {method: 'GET', ips: ips && ips.split(',')}, function (err, results) {
    if (err) {
      log.error('call remote failed: ', err);
      return next(err);
    }
    let logs = [];
    let errMsg = [];
    Object.keys(results).forEach(function (ip) {
      let res = results[ip];
      if (res.code !== 'SUCCESS') {
        errMsg.push({
          ip: ip,
          message: res.message || res.stack || res
        });
      } else {
        let data = res.data;
        for (let i = 0, len = data.length; i < len; i++) {
          logs.push(data[i] + ' ' + ip);
        }
      }
    });

    let plogs = [];
    logs.forEach((v) => {
      let tmp = v.match(config.admin.queryLogSortRegExp);
      if (tmp) {
        plogs.push([tmp[0], v]);
      }
    });

    plogs.sort(function (a, b) {
      let ma = a[0];
      let mb = b[0];
      if (ma > mb) {
        return 1;
      } else if (ma == mb) {
        return 0;
      } else {
        return -1;
      }
    });

    plogs.forEach((v, i, a)=>{
      a[i] = v[1];
    });

    res.json({
      code: 'SUCCESS',
      data: {
        success: plogs.length ? plogs : logs,
        error: errMsg
      }
    });
  });
};

/**
 * @api {get} /api/appUsages
 * @desc 查询所有机器的app-usage日志
 *
 * @query
 *   fileName {String} fileName
 */
exports.queryAppUsages = function (req, res, next) {
  let ips = req.query.ips;
  ips = ips && ips.split(',');
  let query = {
    file: req.query.file || req.query.fileName
  };
  let uri = '/api/single/appUsage?' + qs.stringify(query);
  utils.callremote(uri, {
    method: 'GET',
    ips: ips
  }, function (err, results) {
    if (err) {
      log.error('call remote failed: ', err);
      return next(err);
    }
    let result = [];
    let errMsg = [];
    Object.keys(results).forEach(function (ip) {
      let res  = results[ip];
      if (res.code !== 'SUCCESS') {
        errMsg.push({
          ip: ip,
          message: res.message || res.stack || res
        });
      } else {
        result.push({
          ip: ip,
          usage: res.data
        });
      }
    });
    res.json({
      code: 'SUCCESS',
      data: {
        success: result,
        error: errMsg
      }
    });
  });
};


/**
 * @api {get} /api/logs
 * @desc 查询日志文件列表
 *
 * @query
 *   ips {String} ips
 */
exports.queryLogFiles = function (req, res) {
  let ips = req.query.ips;
  ips = ips && ips.split(',');
  let uri = '/api/single/logs';
  utils.callremote(uri, {
    method: 'GET',
    ips: ips
  }, function (err, results) {
    res.json(resultsWrap(err, results));
  });
};

/**
 * @api {get} /api/log/:file
 * @desc 代理下载文件
 *
 * @query
 *   ips {String} ips
 * @params
 *   file {String} fileName
 */
exports.downloadLogFileBatch = function (req, res) {
  const file = req.params.file;

  let ips = req.query.ips;
  ips = ips && ips.split(',');

  const zipTransform = ips.length === 1 ? null : new yazl.ZipFile();

  if (zipTransform) {
    res.setHeader('Content-type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${file}.gz.zip`);
    zipTransform.outputStream.pipe(res);
  }

  let uri = `/api/single/log/${file}`;

  utils.callremote(uri, {
    method: 'GET',
    ips: ips,
    streaming: true,
    originCallback: function (err, data, r, ip) {
      if (zipTransform) {
        if (err) {
          zipTransform.addBuffer(Buffer.from(JSON.stringify(err)), `${ip}_${file}.err.json`);
        } else if (r.headers['content-type'] !== 'application/octet-stream') {
          zipTransform.addReadStream(r, `${ip}_${file}.err.json`);
        } else {
          zipTransform.addReadStream(r, `${ip}_${file}.gz`);
        }
      } else {
        if (err) {
          return res.json({
            code: 'ERROR',
            message: err
          });
        }
        if (r.headers['content-type'] !== 'application/octet-stream') {
          res.setHeader('Content-type', r.headers['content-type']);
        } else {
          res.setHeader('Content-type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename=${file}.gz`);
        }
        r.pipe(res);
      }
    }
  }, function (err) {
    if (err) {
      return res.json({
        code: 'ERROR',
        message: err
      });
    }
    zipTransform && zipTransform.end();
  });
};
