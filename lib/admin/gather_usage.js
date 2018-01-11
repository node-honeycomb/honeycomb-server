'use strict';

const _ = require('lodash');
const os = require('os');
const free = require('free-memory');
const async = require('async');
const Log = require('litelog');
const log = require('../../common/log');
const pidusage = require('pidusage');
const config = require('../../config');
const message = require('../message');
const platform = os.platform();
const M = 1024 * 1024;
const appUsageLog = log.get('appUsage');
appUsageLog.setFormatter(function (obj) {
  return obj.color(obj.level, obj.time() + ' ') + obj.msg;
});
appUsageLog.colorful(config.debug);

let interval = null;

function initGatherUsage() {
  // 定时向 master 发送采集信息的 action，获取 appId 和 对应的 pid
  // 打印到 app-usage 日志文件的的日志格式样例如下：
  // 20170208 15:25:55.900 __SYSTEM__: 1,1.70,99.24; __ADMIN__: 4935,0,47.75; __PROXY__: 4936,0,36.56; admin_3.0.1_1: 4940,0,60.07; example_2.0.0_2: 4942,0,65.79
  let oldPids = [];

  if (interval) {
    clearInterval(interval);
  }

  if (config.admin && config.admin.gatherUsage) {
    interval = setInterval(() => {
      message.send({
        action: '$getAppPids'
      }, function (err, data) {
        /**
         * diff出与上一次pids对比已经不存在的pids
         * 调用 pidusage.unmonitor释放监听
         */
        let newPids = [];
        for (let appId in data) {
          data[appId].forEach((pid) => {
            newPids.push(pid);
          });
        }
        let diffPids = _.difference(oldPids, newPids);
        diffPids.forEach((pid) => {
          log.info(`process: ${pid} unmonitored.`);
          pidusage.unmonitor(pid);
        });
        oldPids = newPids;

        let start = Date.now();
        let appsTask = [];
        for (let appId in data) {
          appsTask.push((callback) => {
            let worksTask = [];
            data[appId].forEach((pid) => {
              worksTask.push((cb) => {
                pidusage.stat(pid, (err, stat) => {
                  if (err) {
                    if (err.code !== 'ENOENT') {
                      log.error(`get stat of process: ${pid} failed:`, err);
                    } else {
                      log.warn(`get stat of process: ${pid} failed: empty pid`);
                    }
                    return cb();
                  }
                  cb(null, `${pid},${Math.floor(stat.cpu)},${Math.floor(stat.memory / M)}`);
                });
              });
            });
            async.parallel(worksTask, (err, results) => {
              _.remove(results, (item) => {
                return !item;
              });
              let usage;
              if (results.length) {
                usage = `${appId}: ${results.join('^')}`;
              }
              callback(err, usage);
            });
          });
        }

        appsTask.push((callback) => {
          free.m((err, info) => {
            if (err) {
              if (err.code === 'ENOENT' && platform !== 'darwin' && platform !== 'win32') {
                log.error('get free memory failed:', err.message);
              }
              return callback();
            }
            // os.loadavg() 返回一个数组，分别是1，5，15分钟的系统负载平均值，这里取1分钟的值
            let sysLoadavg = os.loadavg()[0].toFixed(1);
            let sysMem = Math.floor((info.mem.total - info.mem.usable) / info.mem.total * 100);
            let sysUsage = `__SYSTEM__: 1,${sysLoadavg},${sysMem}`;
            callback(null, sysUsage);
          });
        });

        async.series(appsTask, (err, usages) => {
          if (err) {
            log.error('admin_gather_usage_error：', err);
          } else {
            usages.sort();
            let time = Log.getTime();
            appUsageLog.write(time.substr(0, 17) + ' ' + usages.join('; '));
            let end = Date.now();
            let delt = end - start;
            if (delt > (config.admin.gatherUsageInterval / 2)) {
              log.warn('pidusage collect process stat info consume time: ', delt);
            }
          }
        });
      });
    }, config.admin.gatherUsageInterval);
  }
}

module.exports = initGatherUsage;
