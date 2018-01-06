'use strict';

let net = require('net');
let pkg = require('./package');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);
let serv = net.createServer(function (socket) {
  socket.end(pkg.name + '_' + pkg.version + '_' + pkg.build);
});

process.on('offline', function (data, callback) {
  serv.close(callback);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock;
  serv.listen(sock);
  cb(null, {
    bind: '6000',
    target: sock,
    type: 'socket'
  });
};
