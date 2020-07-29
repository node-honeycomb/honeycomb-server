/**
 * 1.0版本需要实现文件行读取，且持续读取
 */
const fs = require('xfs');
const Events = require('events');

class FileStream extends Events {
  /**
   * [constructor description]
   * @param  {Object} conf
   *         - spliter '\n'
   *         - chunkSize 64K
   *         - lineMaxLength  5M
   *         - file {Path}  abs file path
   *         - encoding {String} default utf-8
   *         - raw {Boolean}
   */
  constructor(conf) {
    super();
    this.file = conf.file;
    this.spliter = conf.spliter || '\n';
    this.bufferTail = null;
    this.cursor = 0;
    this.chunkSize = conf.chunkSize || 1024 * 64;
    this.customFilter = conf.filter;
    this.raw = conf.raw;
    this.buffer = Buffer.alloc(this.chunkSize);
    this.lineMaxLength = conf.lineMaxLength || 1024 * 1024 * 5;
    this.encoding = conf.encoding || 'utf-8';

    this.fd = fs.openSync(this.file, 'r');
    this.on('end', () => {
      this.close();
    });
  }
  close() {
    fs.closeSync(this.fd);
    this.fd = null;
    this.bufferTail = null;
    this.buffer = null;
  }
  parseChunk(chunk, done) {
    let offset = 0;
    let tmp;
    let buffer = this.bufferTail;
    let spliter = this.spliter;

    let flag = true;

    while (flag) {
      let index = chunk.indexOf(spliter, offset);
      let buf;
      if (index === -1) {
        // 没找到line切割点
        // 切出rest部分string
        let rest = offset ? chunk.slice(offset) : chunk;
        // 和上一个循环的尾巴拼接起来
        if (!buffer) {
          buffer = rest;
        } else {
          if (buffer.length === this.lineMaxLength) {
            break;
          }
          buffer = Buffer.concat([buffer, rest]);
        }
        // cut for lineMaxLength
        if (buffer.length > this.lineMaxLength) {
          buffer = buffer.slice(0, this.lineMaxLength);
        }
        // 跳出，等待下一段数据进来
        break;
      } else if (index === 0) {
        // 分隔符号在第一位，并且有剩余的 buffer,
        // 则发送buffer, 并清空buffer
        if (buffer) {
          buf = buffer;
        } else {
          // console.log('[DORADO_WARN] unexpect message that start with spliter but no prev buffer exists.', chunk.toString()); // eslint-disable-line
          buf = Buffer.alloc(0);
        }
        // this._buffers[clientId] = null;
        buffer = null;
      } else {
        // 分隔符不在第一位，则切割刀第一段
        tmp = chunk.slice(offset, index);
        // 如果buffer存在，则拼接buffer, 发送
        // 并清空buffer
        if (buffer) {
          if (buffer.length === this.lineMaxLength) {
            tmp = buffer;
          } else {
            tmp = Buffer.concat([buffer, tmp]);
            if (tmp.length > this.lineMaxLength) {
              tmp = tmp.slice(0, this.lineMaxLength);
            }
          }
          buffer = null;
        }
        buf = tmp;
      }
      let finalLine = this.customFilter ? this.customFilter(buf) : (this.raw ? buf : buf.toString(this.encoding));
      if (finalLine === false) {
        return this.emit('end');
      }
      this.emit('line', finalLine);
      // move offset
      offset = index + 1;
    }
    this.bufferTail = buffer;
    done();
  }
  read() {
    let buf = this.buffer;
    let size = this.chunkSize;
    fs.read(this.fd, buf, 0, size, this.cursor, (err, bytesRead, buffer) => {
      if (err) {
        return this.handleError(err);
      }
      if (!bytesRead) {
        // file end
        return this.emit('end');
      }
      if (bytesRead < size) {
        buffer = buffer.slice(0, bytesRead);
      }
      this.parseChunk(buffer, this.read.bind(this));
      this.cursor += bytesRead;
    });
  }
}

module.exports = FileStream;
