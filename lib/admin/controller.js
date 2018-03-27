'use strict';

const async = require('async');
const urllib = require('urllib');
const formstream = require('formstream');
const formidable = require('formidable');
const config = require('../../config');
const log = require('../../common/log');
const port = config.admin.port;
const commonUtils = require('../../common/utils');
const utils = require('./utils');

exports.publishApi = function (req, res) {
  if (!config.admin.enablePublishPage) {
    res.statusCode = 404;
    return res.end('Not Found');
  }
  let ipList = req.query.ipList;
  async.waterfall([
    function (callback) {
      let form = new formidable.IncomingForm();
      form.parse(req, function (err, fields, files) {
        if (err) {
          err.message = 'uploading app package failed' + err.message;
          err.code = 'ERROR_UPLOAD_APP_PACKAGE';
          err.status = 500;
          return callback(err);
        }
        if (!files || !Object.keys(files).length) {
          let err = new Error('app package empty');
          err.code = 'ERROR_APP_PACKAGE_EMPTY';
          err.status = 403;
          return callback(err);
        }
        if (!fields.password || !fields.ipList) {
          let err = new Error('unAuthed');
          err.status = 403;
          return callback(err);
        }
        ipList = fields.ipList.trim().split(/\r?\n/);
        ipList.forEach(function (v, i, a) {
          a[i] = v.trim();
        });
        ipList = ipList.join(',');

        if (
          commonUtils.sha256(fields.password) !== config.admin.password
        ) {
          let err = new Error('password not correct');
          err.status = 403;
          return callback(err);
        }
        callback(null, files.pkg);
      });
    },
    function (file, callback) {
      log.info(`publish "${file.name}" to servers:`, ipList, file.name, file.path);
      let form = formstream();
      form.file('pkg', file.path, file.name);
      let url = `/api/publish?ips=${ipList}`;
      let options = {
        method: 'POST',
        headers: form.headers(),
        stream: form,
        timeout: 120000,
        dataType: 'json'
      };
      let singed = utils.sign(url, options);
      // 调用本机的广播端口来群发，所以这个发布接口只能发布当前集群
      urllib.request(`http://127.0.0.1:${port}` + singed.queryPath, options, function (err, data) {
        if (err) {
          callback(err);
        } else {
          if (data && data.code !== 'SUCCESS') {
            callback(data);
          } else {
            callback(null, data);
          }
        }
      });
    }
  ], function (err, results) {
    if (err) {
      res.statusCode = err.status || 500;
      return res.render('publish', {
        message: 'publish failed',
        ipList: config.ipList,
        log: err.message || err.stack,
        publishPage: 'false'
      });
    }
    // err 始终为空
    let errMsg = [];
    let data = results;

    Object.keys(data).forEach(function (ip) {
      if (data[ip].code !== 'SUCCESS') {
        if (data[ip] instanceof Error) {
          errMsg.push(data[ip].message || data[ip].stack);
        } else {
          errMsg.push(JSON.stringify(data[ip]));
        }
      }
    });
    if (data.code !== 'SUCCESS') {
      res.render('publish', {
        message: 'publish success',
        ipList: config.ipList,
        publishPage: 'false',
        log: errMsg.join('\n')
      });
    } else {
      res.render('publish', {
        message: 'publish success',
        ipList: config.ipList,
        publishPage: 'false',
        log: 'SUCCESS'
      });
    }
  });
};

exports.publishPage = function (req, res) {
  if (!config.admin.enablePublishPage) {
    res.statusCode = 404;
    return res.end('Not Found');
  }
  res.render('publish', {
    status: '发布',
    ipList: config.ipList,
    publishPage: 'true'
  });
};
