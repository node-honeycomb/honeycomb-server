/**
 * 1.0版本需要实现文件行读取，且持续读取
 */
const fs = require('fs');

class FileTail {
  /**
   * [constructor description]
   * @param  {Object} option
   *         bufferLength:  default 1024 * 16
   *         delimiter: default \n
   */
  constructor(file, option) {
    option = option || {};
    this.bufferLength = option.bufferLength || 1024 * 64;
    this.delimiter = option.delimiter || '\n';
    this.maxBuffer = 1024 * 1024 * 64;
    this.tailChunk = null;
    this.encoding = 'utf8';
    this.lineCount = 0;
    this.file = file;
  }
  /**
   * tail log file
   * @param  {Number}   line
   * @param  {Function} cb
   */
  tail(line, cb) {
    fs.open(this.file, 'r', (err, fd) => {
      if (err) {
        return cb(err);
      }
      let stat = fs.fstatSync(fd);
      let size = stat.size;
      let pos = size;
      let chunk = Buffer.alloc(this.bufferLength);
      let res = [];
      let len = chunk.length;
      let readCount = 0;
      let flag = true;
      while (flag) {
        pos = pos - len;
        if (pos < 0) {
          len += pos;
          pos = 0;
        }
        let readLen = fs.readSync(fd, chunk, 0, len, pos);
        readCount += readLen;
        this.parseTailChunk(chunk, readLen, res, line);
        if (res.length >= line) {
          break;
        }
        if (readCount > this.maxBuffer) {
          break;
        }
        if (pos === 0) {
          if (this.tailChunk) {
            res.unshift(this.tailChunk.toString());
          }
          break;
        }
      }
      fs.close(fd);
      if (res.length > line) {
        res = res.slice(res.length - line);
      }
      if (readCount > this.maxBuffer) {
        res.unshift('>>>>> LOG_TAIL_ERROOR maxBuffer(' + this.maxBuffer + ') exceed, please check log or set log_tail.maxBuffer more large <<<<<');
      }
      cb(null, res);
    });
  }
  parseTailChunk(chunk, len, res, maxLine) {
    if (!len) {
      return;
    }
    let delimiter = this.delimiter;
    let offset = len - 1;
    let flag = true;
    // console.log('>>>', chunk, offset);
    while (flag) {
      let index = chunk.lastIndexOf(delimiter, offset);
      // console.log('=', index);
      if (index === -1) {
        // console.log('--', this.tailChunk);
        // 没换行了, 跳出，等待下一段数据进来
        if (!this.tailChunk) {
          this.tailChunk = Buffer.from(chunk.slice(0, offset + 1));
        } else {
          this.tailChunk = Buffer.concat([chunk.slice(0, offset + 1), this.tailChunk]);
        }
        break;
      } else {
        let tmpLine = chunk.slice(index + 1, offset + 1);
        if (this.tailChunk) {
          tmpLine = Buffer.concat([tmpLine, this.tailChunk]);
          this.tailChunk = null;
        }
        res.unshift(tmpLine.toString());
        offset = index - 1;
        if (res.length >= maxLine) {
          break;
        }
      }
      if (offset < 0) {
        break;
      }
    }
  }
}

module.exports = FileTail;
