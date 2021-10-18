'use strict';
const fs = require('fs');
const config = require('../../../config');
const path = require('path');
const async = require('async');
const sysInfo = require('../sysinfo');


exports.ping = function (req, res) {
  return res.json({
    code: 'SUCCESS',
    data: {
      serverTime: new Date(),
      cluster: config.admin.cluster
    }
  });
};

exports.getSystemStatus = function (req, res) {
  let systemTime = (new Date()).toISOString();
  let sysBasic = sysInfo.getBasic();
  async.series([sysInfo.getDiskInfo, sysInfo.getSystemUsage], (err, results) => {
    if (err) {
      return res.json({code: err.code || 'ERROR', message: `${err.message}`});
    }
    let diskInfo = results[0];
    let sysUsage = results[1];

    res.json({
      code: 'SUCCESS',
      data: {
        uname: sysBasic.uname,                         // uname -a 完整信息
        kernel: sysBasic.kernel,                       // 系统内核版本， 可用于check是否要升级系统
        hostname: sysBasic.hostname,                   // uname -a 的信息也包含 hostname，可以做个对比
        serverVersion: sysBasic.serverVersion,         // honeycomb-server 的版本号，可用于check是否需要升级server代码
        sysTime: systemTime,                  // 系统当前时间，可用于check各机器时钟是否同步, 注意：当前返回的时间是 0 时区的标准时间
        nodeVersion: sysBasic.nodeVersion,             // 如果是 alinode ，会包含 alinode 的版本信息，如: 6.9.4/2.1.0
        cpu: sysBasic.cpu,                // cpu规格
        cpuNum: sysBasic.cpuNum,               // 总cpu数
        memory: sysBasic.memory,   // 内存大小， 单位G
        timezone: sysBasic.timezone,
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

