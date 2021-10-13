/**
 * http rfc about http message
 * https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.4
 */

const net = require('net');
const parsers = require('_httm_common').parsers;

/**
 * 服务端监听
 */
let serv =  net.createServer({
  allowHalfOpen: false,
  pauseOnConnect: false
}, connectionListener);

/**
 * 客户端转发， 应该建立连接池
 * @type {[type]}
 */
let sock = net.connect(options[, connectListener]);
function connectionListener() {

}

