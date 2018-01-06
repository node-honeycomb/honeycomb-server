'use strict';

let net = require('net');
let path = require('path');
let fs = require('fs');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = net.createServer(function (socket) {
  socket.on('data', function (chunk) {
    console.log('received msg:', chunk.toString()); // eslint-disable-line
    socket.write('server echo:' + chunk);
  });
  socket.on('error', function (err) {
    console.log('[socket error]', err); // eslint-disable-line
  });
});

process.on('offline', function (data, callback) {
  serv.close(callback);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, './test.sock');
  serv.listen(sock);
  cb(null, {
    bind: '6000',
    target: sock,
    type: 'socket'
  });
  process.on('exit', function () {
    try {
      fs.unlinkSync(sock);
    } catch (e) {
      // do nothing
    }
  });
};
