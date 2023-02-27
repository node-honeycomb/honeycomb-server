'use strict';
const fs = require('fs');
const config = require('../../../config');
const path = require('path');
const async = require('async');
const sysInfo = require('../sysinfo');
const message = require('../../message_worker');

// ping用来检查当前集群的管控状态，返回集群code，以便于hc-console检查并修订集群配置
exports.ping = function (req, res) {
  let cluster = config.cluster || process.env['HONEYCOMB_CLUSTER'];
  return res.json({
    code: 'SUCCESS',
    data: cluster === req.query.clusterCode
  });
};

// return statusCode, ok 200, not ok 404
exports.healthCheck = function (req, res) {
  message.send({
    action: '$healthCheck',
    arguments: [],
    timeout: 10000 // 10秒
  }, function (err, data) {
    // data为 failed apps list: ['', '']
    let msg = '';
    if (err) {
      res.statusCode = 500;
      msg = err.toString();
    } else if (data && data.length > 0) {
      res.statusCode = 404;
      msg = data.join('\n');
    }
    res.end(msg);
  });
};

exports.getSystemStatus = function (req, res) {
  async.series([sysInfo.getDiskInfo, sysInfo.getSystemUsage, sysInfo.getUptime], (err, results) => {
    if (err) {
      return res.json({code: err.code || 'ERROR', message: `${err.message}`});
    }
    let diskInfo = results[0];
    let sysUsage = results[1];
    let uptime = results[2];
    let data = sysInfo.getBasic();
    data.uptime = uptime;
    data.diskInfo = diskInfo;
    data.sysLoad = sysUsage.load;
    data.memoryUsage = sysUsage.memory;
    res.json({
      code: 'SUCCESS',
      data
    });
    /*
    res.json({
      code: 'SUCCESS',
      data: {
        uname: sysBasic.uname,                         // uname -a 完整信息
        kernel: sysBasic.kernel,                       // 系统内核版本， 可用于check是否要升级系统
        hostname: sysBasic.hostname,                   // uname -a 的信息也包含 hostname，可以做个对比
        serverVersion: sysBasic.serverVersion,         // honeycomb-server 的版本号，可用于check是否需要升级server代码
        sysTime: systemTime,                           // 系统当前时间，可用于check各机器时钟是否同步, 注意：当前返回的时间是 0 时区的标准时间
        nodeVersion: sysBasic.nodeVersion,             // 如果是 alinode ，会包含 alinode 的版本信息，如: 6.9.4/2.1.0
        cpu: sysBasic.cpu,                             // cpu规格
        cpuNum: sysBasic.cpuNum,                       // 总cpu数
        memory: sysBasic.memory,                       // 内存大小， 单位G
        timezone: sysBasic.timezone,
        sysLoad: sysUsage.load,
        memoryUsage: sysUsage.memory,
        diskInfo: diskInfo
      }
    });
    */
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

