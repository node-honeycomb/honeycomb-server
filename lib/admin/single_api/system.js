'use strict';

const os = require('os');
const async = require('async');
const log = require('../../../common/log');
const commonUtils = require('../../../common/utils');
const serverPkg = require('../../../package.json');

exports.getSystemStatus = function (req, res) {
  let serverVersion = serverPkg.version + '_' + serverPkg.build;
  let tmpDate = new Date();
  let systemTime = tmpDate.toISOString();
  let timezone = tmpDate.getTimezoneOffset() / 60;
  let cpuInfo = os.cpus();

  let timezoneStr;

  if (timezone > 0) {
    timezoneStr = 'UTC-' + timezone;
  } else if (timezone < 0) {
    timezoneStr = 'UTC+' + (-timezone);
  } else {
    timezoneStr = 'UTC+0';
  }

  async.series([getUname, getHostname, getNodeVersion], (err, results) => {
    if (err) {
      return res.json({code: err.code || 'ERROR', message: `${err.message}`});
    }
    let uname = results[0];
    let kernel;
    if (uname) {
      let arr = uname.split(' ');
      kernel = arr[2];
    }
    let hostname = results[1];
    let nodeVersion = results[2];
    res.json({
      code: 'SUCCESS',
      data: {
        uname: uname,                     // uname -a 完整信息
        kernel: kernel,                   // 系统内核版本， 可用于check是否要升级系统
        hostname: hostname,               // uname -a 的信息也包含 hostname，可以做个对比
        serverVersion: serverVersion,     // honeycomb-server 的版本号，可用于check是否需要升级server代码
        systemTime: systemTime,           // 系统当前时间，可用于check各机器时钟是否同步, 注意：当前返回的时间是 0 时区的标准时间
        nodeVersion: nodeVersion,         // 如果是 alinode ，会包含 alinode 的版本信息，如: 6.9.4/2.1.0
        cpu: cpuInfo[0].model,            // cpu规格
        cpuNum: cpuInfo.length,           // 总cpu数
        memory: os.totalmem() / 1073741824,   // 内存大小， 单位G
        timezone: timezoneStr
      }
    });
  });
};

function getUname(cb) {
  commonUtils.exec('uname -a', {encoding: 'utf8'}, (err, data) => {
    if (err) {
      return cb(new Error('getUname failed, exec `uname -a` error: ' + err.message));
    }
    log.debug('uname: ', data && data[0]);
    cb(null, data && data[0]);
  });
}

function getHostname(cb) {
  commonUtils.exec('hostname', {encoding: 'utf8'}, (err, data) => {
    if (err) {
      return cb(new Error('getHosename failed, exec `hostname` failed: ' + err.message));
    }
    log.debug('hostname: ', data && data[0]);
    cb(null, data && data[0]);
  });
}

function getNodeVersion(cb) {
  let versions = process.versions;
  cb(null, versions.node);
}
