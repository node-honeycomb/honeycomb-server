'use strict';

const os = require('os');
const fs = require('fs');
const config = require('../../../config');
const path = require('path');
const async = require('async');
const log = require('../../../common/log');
const commonUtils = require('../../../common/utils');
const serverPkg = require('../../../package.json');
const df = require('@sindresorhus/df');
const util = require('../utils');

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

  async.series([getUname, getHostname, getNodeVersion, getDiskInfo, getSystemUsage], (err, results) => {
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
    let diskInfo = results[3];
    let sysUsage = results[4];

    res.json({
      code: 'SUCCESS',
      data: {
        uname: uname,                     // uname -a 完整信息
        kernel: kernel,                   // 系统内核版本， 可用于check是否要升级系统
        hostname: hostname,               // uname -a 的信息也包含 hostname，可以做个对比
        serverVersion: serverVersion,     // honeycomb-server 的版本号，可用于check是否需要升级server代码
        sysTime: systemTime,           // 系统当前时间，可用于check各机器时钟是否同步, 注意：当前返回的时间是 0 时区的标准时间
        nodeVersion: nodeVersion,         // 如果是 alinode ，会包含 alinode 的版本信息，如: 6.9.4/2.1.0
        cpu: cpuInfo[0].model,            // cpu规格
        cpuNum: cpuInfo.length,           // 总cpu数
        memory: os.totalmem() / 1073741824,   // 内存大小， 单位G
        timezone: timezoneStr,
        sysLoad: sysUsage.load,
        memoryUsage: sysUsage.memory,
        diskInfo: diskInfo
      }
    });
  });
};

exports.setClusterInfo = function (req, res, next) {
  let body = req.body;
  if (!body.cluster || !Array.isArray(body.serverList)) {
    return next({
      code: 'PARAM_MISSING',
      message: 'missing param, body: {cluster: "xxx", serverList: []}'
    });
  }
  let fpath = path.join(config.serverRoot, './run/cluster.json');
  fs.writeFile(fpath, JSON.stringify(body, null, 2), (err) => {
    if (err) {
      return next({
        code: 'SAVE_CLUSTER_INFO_ERROR',
        message: err.message
      });
    }
    res.json({code: 'SUCCESS'});
  });
};

function getUname(cb) {
  commonUtils.exec('uname -a', {encoding: 'utf8'}, (err, data) => {
    if (err) {
      return cb(new Error('getUname failed, exec `uname -a` error: ' + err.message));
    }
    let uname = (data && data[0]) || 'unknow';
    uname = uname.trim();
    log.debug('uname: ', uname);
    cb(null, uname);
  });
}

function getHostname(cb) {
  commonUtils.exec('hostname', {encoding: 'utf8'}, (err, data) => {
    if (err) {
      return cb(new Error('getHosename failed, exec `hostname` failed: ' + err.message));
    }
    let hostname = (data && data[0]) || 'unknow';
    hostname = hostname.trim();
    log.debug('hostname: ', hostname);
    cb(null, hostname);
  });
}

function getNodeVersion(cb) {
  let versions = process.versions;
  cb(null, versions.node);
}

function getDiskInfo(cb) {
  let dfs = {};
  df.file(config.serverRoot).then((data) => {
    delete data.mountpoint;
    dfs.serverRoot = data;
    return df.file(config.logsRoot);
  }).then((data) => {
    delete data.mountpoint;
    dfs.logsRoot = data;
    cb(null, dfs);
  }).catch(cb);
}

function getSystemUsage(cb) {
  util.sysMemUsage((err, info) => {
    if (err) {
      log.warn(new Error('get system memory usage failed:', err.message));
      info = 0;
    }
    // os.loadavg() 返回一个数组，分别是1，5，15分钟的系统负载平均值，这里取1分钟的值
    let load = os.loadavg();
    let sysMem = Math.floor(info * 100);
    cb(null, {
      load: load,
      memory: sysMem
    });
  });
}
