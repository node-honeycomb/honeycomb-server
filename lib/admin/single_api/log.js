'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const slf = require('slice-file');
const lineReader = require('line-reader');

const config = require('../../../config');
const log = require('../../../common/log');

/**
 * @api {get} /api/single/log
 * @desc 查询单台机器的日志
 *
 * @query
 *   file {String} fileName
 *   lines {Number} logLines
 *   filter {String} fiter keyword
 *   startTime {String} startTime  15:34:22
 */
exports.queryLog = function (req, res) {
  const logRoot = path.join(config.serverRoot, 'logs');
  const file = req.query.file;
  const startTime = req.query.startTime;
  const logFile = path.join(logRoot, file);
  const filter = req.query.filter;
  let lines = parseInt(req.query.lines || req.query.logLines, 10);
  /**
   * check if filepath is under logroot path
   */
  if (logFile.indexOf(logRoot) !== 0) {
    return res.json({
      code: 'ERROR',
      message: 'logpath illegal'
    });
  }

  if (isNaN(lines) || lines < 0) {
    lines = config.admin.readLogDefaultLines;
  }
  if (lines > config.admin.readLogMaxLines) {
    lines = config.admin.readLogMaxLines;
  }
  fs.stat(logFile, (err, stat) => {
    if (err) {
      if (err.code === 'ENOENT') {
        log.info(`log file not found: ${logFile}`);
        return res.json({code: 'ERROR', message: `log file not found: ${logFile}`});
      } else {
        log.error('read logFile error: ', err);
        return res.json({code: 'ERROR', message: `query log failed: ${err.message}`});
      }
    }
    /**
     * if logpath is not a file, return error
     */
    if (!stat.isFile()) {
      return res.json({code: 'ERROR', message: `log file not found: ${logFile}`});
    }
    let results = [];
    let regExp = config.admin.queryLogTimeRegExp;
    function process(time, line, last) {
      if (startTime) {
        if (time >= startTime) {
          if (filter && line.indexOf(filter) >= 0) {
            results.push(line);
          } else if (!filter) {
            results.push(line);
          }
        }
      } else if (filter && line.indexOf(filter) >= 0) { // filter with filter
        results.push(line);
      }
      if (results.length >= lines || last) {
        res.json({code: 'SUCCESS', data: results});
        return false; // stop reading
      }
    }
    /**
     * query with time and filter
     */
    if (startTime || filter) {
      let lastM;
      let bufLine = [];
      lineReader.eachLine(logFile, function (line, last) {
        let m = line.match(regExp);
        if (!m) {
          bufLine.push(line);
        } else {
          if (bufLine.length) {
            let res = process(lastM ? lastM[1] : null, bufLine.join('\n'));
            if (res === false) {
              return false;
            }
          }
          bufLine = [line];
          lastM = m;
        }
        if (last) {
          process(lastM ? lastM[1] : null, bufLine.join('\n'), true);
        }
      });
    } else {
      let xs = slf(logFile, {bufsize: 2 * 1024 * 1024});
      xs.slice(-lines, function (err, data) {
        if (err) {
          xs.close();
          log.error('slice file failed: ', err);
          return res.json({code: 'ERROR', message: `query log failed: ${err.message}`});
        }
        let results = [];
        data.forEach((v) => {
          let line = v.toString();
          // cut end \n
          line = line.substr(0, line.length - 1);
          let m = line.match(regExp);
          if (!m) {
            if (!results.length) {
              results.push(line);
            } else {
              results[results.length - 1] += '\n' + line;
            }
            return;
          }
          results.push(line);
        });
        xs.close();
        return res.json({code: 'SUCCESS', data: results});
      });
    }
  });
};

/**
 * @api /api/single/logs
 * @desc 扫描日志文件目录
 * @return
  [
    'access-{year}{month}{day}.log',
    'admin/sys.{year}-{month}-{day}.log',
    'admin/test/sys.{year}-{month}-{day}.log',
    'app-usage.{year}-{month}-{day}-{hour}.log',
    'node-{year}{month}{day}.log',
    'nodejs_stdout.log',
    'server.{year}-{month}-{day}.log'
  ]
 */
exports.queryLogFiles = function (req, res) {
  function scanLogFiles(dir) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      return log.error('read log dir failed: ', e);
    }
    files.forEach(function (file) {
      let newDir = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(newDir);
      } catch (e) {
        return log.error('read log dir failed: ', e);
      }
      if (stat.isDirectory()) {
        scanLogFiles(newDir);
      } else {
        // 获取log文件和logs根目录的相对路径
        file = path.relative(logDir, newDir);
        // 找到logFilePatterns中能命中的规则
        let idx = _.findIndex(config.logFilePatterns, function (lfp) {
          return file.match(lfp.match);
        });
        if (idx >= 0) {
          let lfp = config.logFilePatterns[idx];
          file.replace(lfp.match, function (...m) {
            let newFileName = lfp.pattern;
            for (let i = 1; i < m.length - 2; i++) {
              newFileName = newFileName.replace(`$${i}`, m[i]);
            }
            let index = _.findIndex(arr, function (p) {
              return p === newFileName;
            });
            if (index < 0) {
              arr.push(newFileName);
            }
          });
        } else {
          arr.push(file);
        }
      }
    });
  }

  let arr = [];
  let logDir = path.join(config.serverRoot, 'logs');
  scanLogFiles(logDir);
  res.json({code: 'SUCCESS', data: arr});
};

/**
 * @api {get} /api/single/appUsage
 * @desc 查询单台机器的app-usage日志
 *
 * @query
 *   fileName {String} fileName
 */
exports.queryAppUsage = function (req, res) {
  const logRoot = path.join(config.serverRoot, 'logs');
  const file = req.query.file;
  const logFile = path.join(logRoot, file);
  /**
   * check if filepath is under logroot path
   */
  if (logFile.indexOf(logRoot) !== 0) {
    return res.json({
      code: 'ERROR',
      message: 'logpath illegal'
    });
  }
  fs.readFile(logFile, function (err, data) {
    if (err) {
      return res.json({message: `read_log_failed ${err.message}`});
    }
    res.json({
      code: 'SUCCESS',
      data: data.toString()
    });
  });
};
