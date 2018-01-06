'use strict';

const _ = require('lodash');
const uuid = require('uuid');
const events = require('events');
/**
 * 进程间可靠消息传递， fork出来的进程之间，可以互相通讯
 * Message提供可靠的消息传递机制，能返回成功失败
 *
 * 接口及使用方法：
 *
 * 1. 首先这是个单例模式， require('lib/message.js')即可得到实例
 *
 * 2. 发送消息
 *
 *  /** 常规事件机制 **
 *  let msg = {
 *    action: 'test',
 *    data: 'hello', // json序列化传递
 *    target: '' // 可选，发送方，默认是当前进程，也有可能是主进程中选择发送给某一个子进程
 *  };
 *  message.send(msg, function (err, data) {
 *
 *  });
 *  /** RPC机制 **
 *  let msg = {
 *    action: '$test',
 *    arguments: ['hello', 'aliyun'], // json序列化传递
 *    target: '' // 可选，发送方，默认是当前进程，也有可能是主进程中选择发送给某一个子进程
 *  };
 *  message.send(msg, function (err, data) {
 *
 *  });
 * 3. 接受消息
 *
 *  process.on('message', function (msg) {
 *    /**
 *     * msg 就是send端发送的消息
 *     * target 为回复消息时调用.send()的进程, 默认为当前process
 *     *        在主进程中，message事件来自子进程，所以回复消息的时候，这个target还应该是子进程
 *     * bindObj msg里定义的action的接收方
 *     *         bindObj 必须是 events 的实例 （有emit, 和 on 方法 来监听事件）
 *     *         例如上例中，发送了一个"test"的action:
 *     *             bindObj.on('test', function(data, callback) {
 *     *                // 接收到 data === 'hello'
 *     *             });
 *     *         所以一般在 bindObj中定义好接收事件的handler即可
 *     *
 *     *         远程RPC模式, 当action以$开头 ， '$test'
 *     *         message中实现了一种机制，可以直接调用到  bindObj.$test方法, 如上例调用：
 *     *            bindObj.$test = function (arg0, arg1, callback)  {
 *     *                // arg0 == 'hello', arg1 == 'aliyun'
 *     *            }
 *     *
 *    message.receive(msg, target, bindObj);
 *  });
 *
 * 3. 在子进程中，还支持同组广播
 *
 *  message.broadcast(msg, function(err, data){ });  // 参数同send
 *  同组cluster的进程，都会收到此msg
 *
 */
const FLAG_ACTION = '#_';
const FLAG_CALLBACK = '$callback$';
const TIMEOUT = 10 * 1000;

/** empty function for default param usage */
function dummy() {}

class Message extends events.EventEmitter {
  constructor(options) {
    super();
    this.options = _.assign({
      name: '_'
    }, options);
    this.queues = {};
    this.msgTimeout = TIMEOUT; // default 10's
  }
  bindGroupMessage(group, cb) {
    this.on('__group__' + group, cb);
  }
  unbindGroupMessage(group) {
    this.removeAllListeners('__group__' + group);
  }
  setGroup(groupName) {
    this.group = groupName;
  }
  /**
   * set timeout
   * @param {Number} time unit: ms
   */
  setTimeout(time) {
    if (isNaN(time)) {
      return;
    }
    this.msgTimeout = time;
  }
  getCallbackActionName() {
    return FLAG_ACTION + FLAG_CALLBACK;
  }
  receive(msg, proc, bindObj) {
    let id = msg._id;
    let action = msg.action;
    let self = this;
    if (!id || !action || action.indexOf(FLAG_ACTION) !== 0) {
      // unknow message received, just ignore
      return false;
    }
    let actionName = action.substr(FLAG_ACTION.length);

    function callback(err, data) {
      if (err && err instanceof Error) {
        err = {
          code: err.code,
          name: err.name,
          message: err.message
        };
      }
      self.send({
        action: FLAG_CALLBACK,
        _id: id,
        error: err,
        data: data,
        target: proc
      });
    }

    if (this.queues[id]) {
      // this is a callback message
      clearTimeout(this.queues[id]);
      delete this.queues[id];
      this.emit(id, msg.error || null, msg.data);
      return true;
    } else if (actionName === FLAG_CALLBACK) {
      // this is also a callback message, but already timeout
      // do nothing here
      console.log('process message already timeout'); // eslint-disable-line
      return true;
    } else if (msg.group) {
      this.emit(
        '__group__' + msg.group,
        {
          action: actionName,
          data: msg.data,
          timeout: msg.timeout
        },
        function (err, data) {
          self.send({
            action: FLAG_CALLBACK,
            _id: id,
            error: err,
            data: data,
            target: proc
          });
        }
      );
      return true;
    } else {
      // someone call you
      let evtTarget = bindObj || this;
      if (actionName.startsWith('$')) {
        if (typeof evtTarget[actionName] !== 'function') {
          callback('unknow rpc call: ' + actionName);
        } else {
          let args = msg.arguments;
          if (!args) {
            if (msg.data) {
              args = [msg.data];
            } else {
              args = [];
            }
          }
          args.push(callback);
          evtTarget[actionName].apply(evtTarget, args);
        }
      } else {
        evtTarget.emit(actionName, msg.data, callback);
      }
      return true;
    }
  }
  /**
   * 从用户接口的msg 生成一个系统间emit传递的msg
   */
  genMessage(msg) {
    msg.action = FLAG_ACTION + msg.action;
    if (!msg._id) {
      msg._id = uuid();
    }
    msg.target = msg.target || process;
    msg._from = process.pid;
    msg._to = msg.target.pid;
    return msg;
  }
  /**
   * send message
   * @param  {Object} msg message
   *                      - action {String} msgName
   *                      - data {Object} data
   *                      - group {String|Boolean}
   *                      - target {Processor} [optional]
   *                      - _id {String} [optional]
   *
   * @param  {Function} callback(err, data)
   */
  send(msg, callback) {
    let self = this;
    if (!callback) {
      callback = dummy;
    }
    msg = this.genMessage(_.clone(msg));
    let id = msg._id;
    let target = msg.target;
    msg.target = undefined;

    let timeout = msg.timeout || this.msgTimeout;
    let timeoutHandler;

    if (callback) {
      timeoutHandler = setTimeout(function () {
        // define err as an object, because `JSON.stringify(new Error('xxx')) === {}`
        let err = {
          code: 'TIMEOUT',
          message: 'message timeout in ' + timeout + ', msg:' + JSON.stringify(msg, null, 2)
        };
        delete self.queues[id];
        self.emit(id, err);
      }, timeout);
      self.once(id, callback);
    }

    try {
      target.send(msg);
      if (timeoutHandler) {
        this.queues[id] = timeoutHandler;
      }
    } catch (e) {
      // clean timeout
      if (timeoutHandler) {
        clearTimeout(timeoutHandler);
      }
      e.message = 'send message failed, msg:' + JSON.stringify(msg) + ' error:' + e.message;
      if (msg.action !== FLAG_CALLBACK) {
        this.emit(id, e);
      }
    }
  }
  broadcast(msg, callback) {
    msg.group = this.group;
    this.send(msg, callback);
  }
}

module.exports = new Message();
