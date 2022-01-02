const os = require('os');
const commonUtils = require('../../common/utils');
const serverPkg = require('../../package.json');
const df = require('@sindresorhus/df');
const log = require('../../common/log');
const promisify = require('util').promisify;
const exec = promisify(commonUtils.exec);
const util = require('./utils');
const config = require('../../config');
let sysInfo = {};

exports.init = function (cb) {
  (async function () {
    let cpuInfo = os.cpus();
    sysInfo = {
      serverVersion: serverPkg.version + '_' + serverPkg.build,
      timezone: getTimeZone(),
      uname: await getUname(),
      hostname: await getHostname(),
      nodeVersion: getNodeVersion(),
      cpu: cpuInfo[0].model,
      cpuNum: cpuInfo.length,
      memory: os.totalmem() / 1073741824 // G
    };
    if (sysInfo.uname) {
      let arr = sysInfo.uname.split(' ');
      sysInfo.kernel = arr[2];
    }
  })().then(cb).catch(cb);
};

exports.getBasic = function () {
  let cpuInfo = os.cpus();
  sysInfo.cpu = cpuInfo[0].model;
  sysInfo.cpuNum = cpuInfo.length;
  sysInfo.memory = os.totalmem() / 1073741824; // G
  sysInfo.sysTime = (new Date()).toISOString();
  return Object.assign({}, sysInfo);
};

function getTimeZone() {
  let timezone = (new Date()).getTimezoneOffset() / 60;
  let timezoneStr;
  if (timezone > 0) {
    timezoneStr = 'UTC-' + timezone;
  } else if (timezone < 0) {
    timezoneStr = 'UTC+' + (-timezone);
  } else {
    timezoneStr = 'UTC+0';
  }
  return timezoneStr;
}

async function getUname() {
  let uname = 'unknow';
  try {
    let data = await exec('uname -a', {encoding: 'utf8'});
    uname = data && data[0] || 'unknow';
    uname = uname.trim();
  } catch (e) {
    log.error('sysinfo getUname() failed', e.message);
  }
  return uname;
}

async function getHostname() {
  let hostname = 'unknow';
  try {
    let data = await exec('hostname', {encoding: 'utf8'});
    hostname = (data && data[0]) || 'unknow';
    hostname = hostname.trim();
  } catch (e) {
    log.error('sysinfo getHostname() failed', e.message);
  }
  return hostname;
}

async function getUptime() {
  let uptime = 'unknow';
  try {
    let data = await exec('uptime', {encoding: 'utf8'});
    uptime = (data && data[0]) || 'unknow';
    uptime = uptime.split(',')[0].trim();
  } catch (e) {
    log.error('sysinfo getUptime() failed', e.message);
  }
  return uptime;
}

function getNodeVersion() {
  let versions = process.versions;
  return versions.node;
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

exports.getUptime = getUptime;
exports.getDiskInfo = getDiskInfo;
exports.getSystemUsage = getSystemUsage;
