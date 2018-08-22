'use strict';

const os = require('os');
const free = require('free-memory');
const async = require('async');
const Log = require('litelog');
const log = require('../../common/log');
const pidusage = require('pidusage');
const config = require('../../config');
const message = require('../message');
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
        let pids = [];
        let pidMaps = {};
        let res = [];
        for (let appId in data) {
          data[appId].forEach((pid) => {
            pids.push(pid);
            pidMaps[pid] = appId;
          });
        }

        let start = Date.now();
        let tasks = [];
        tasks.push((callback) => {
          pidusage(pids, (err, stats) => {
            if (err) {
              if (err.code !== 'ENOENT') {
                log.error(`get stat of process: ${pids} failed:`, err);
              } else {
                log.warn(`get stat of process: ${pids} failed: empty pid`);
              }
            } else {
              for (let appId in data) {
                let tmp = [];
                data[appId].forEach((pid) => {
                  let stat = stats[pid];
                  tmp.push(`${pid},${Math.floor(stat.cpu)},${Math.floor(stat.memory / M)}`);
                });
                res.push(appId + ':' + tmp.join('^'));
              }
            }
            callback(err, res.join(';'));
          });
        });

        tasks.push((callback) => {
          free.m((err, info) => {
            if (err) {
              log.warn('get free memory failed:', err.message);
              return callback();
            }
            // os.loadavg() 返回一个数组，分别是1，5，15分钟的系统负载平均值，这里取1分钟的值
            let sysLoadavg = os.loadavg()[0].toFixed(1);
            let sysMem = Math.floor((info.mem.total - info.mem.usable) / info.mem.total * 100);
            let sysUsage = `__SYSTEM__:1,${sysLoadavg},${sysMem}`;
            callback(null, sysUsage);
          });
        });

        async.series(tasks, (err, usages) => {
          if (err) {
            log.error('admin_gather_usage_error：', err);
          } else {
            usages.sort();
            let time = Log.getTime();
            appUsageLog.write(time.substr(0, 17) + ' ' + usages.join(';'));
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
