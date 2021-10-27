'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const {Throttle} = require('stream-throttle');
const zlib = require('zlib');
const LT = require('../log_tail');

const config = require('../../../config');
const log = require('../../../common/log');
const LogStream = require('../log_stream');
const pump = require('pump');

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
  const logRoot = config.logsRoot;
  const file = req.query.file;
  if (!file) {
    return res.json({
      code: 'ERROR',
      message: 'param missing, query.file is empty'
    });
  }
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
    let regExp = config.admin.queryLogNewLineRegExp;
    /**
     * query with time and filter
     */
    if (startTime || filter) {
      let lastM;
      let bufLine = [];
      let results = [];
      let process = (time, line) => {
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
      };
      let logStream = new LogStream({
        file: logFile,
        filter: (line) => {
          line = line.toString();
          let m = line.match(regExp);
          if (!m) {
            if (bufLine.length < 1000) {
              bufLine.push(line);
            }
          } else {
            if (bufLine.length) {
              process(lastM ? lastM[1] : null, bufLine.join('\n'));
            }
            bufLine = [line];
            lastM = m;
          }
          if (results.length >= lines) {
            return false;
          }
        }
      });
      logStream.on('end', () => {
        process(lastM ? lastM[1] : null, bufLine.join('\n'));
        res.json({code: 'SUCCESS', data: results});
      });
      logStream.read();
    } else {
      let logTail = new LT(logFile, {bufferLength: 2 * 1024 * 1024});
      logTail.tail(lines, function (err, data) {
        if (err) {
          log.error('tail log failed: ', err);
          return res.json({code: 'ERROR', message: `query log failed: ${err.message}`});
        }
        let results = [];
        data.forEach((v) => {
          let line = v;
          // cut end \n
          // line = line.substr(0, line.length - 1);
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
      if (e.code === 'EACCES') {
        return log.warn('read log dir warn:', e);
      }
      return log.error('read log dir failed:', e);
    }
    files.forEach(function (file) {
      if (/^__.*__$/.test(file)) {
        return;
      }
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
        file = path.relative(config.logsRoot, newDir);
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
  scanLogFiles(config.logsRoot);
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
  const logRoot = path.join(config.logsRoot, './__usage__');
  const file = req.query.file;
  if (!file) {
    return res.json({
      code: 'ERROR',
      message: 'param missing, query.file is empty'
    });
  }
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

/**
 * @api {get} /api/single/log/:file
 * @desc 下载单台机器的日志
 *
 * @query
 *   file {String} fileName
 */
exports.downloadLogFile = function (req, res) {
  const logRoot = config.logsRoot;
  const logFileDownloadRate = config.logFileDownloadRate;
  const file = req.params.file;

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

    res.setHeader('Content-type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${file}.gz`);

    const logFileReadStream = fs.createReadStream(logFile);
    const throttle = new Throttle({
      rate: logFileDownloadRate // 限速 单位 b/s (bytes per second)
    });

    const gzipTransform = new zlib.Gzip();

    pump(logFileReadStream, gzipTransform, throttle, res, function (err) {
      if (err) {
        return res.json({
          code: 'ERROR',
          message: err
        });
      } else {
        return res.end();
      }
    });
  });
};


