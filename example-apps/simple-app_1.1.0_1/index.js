'use strict';

let http = require('http');
let path = require('path');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  res.end('simple-app_v1.1.0_1');
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../simple-app_v1.1.0_1.sock');
  serv.listen(sock);
  cb(null, {
    bind: '6001',
    router: '/example',
    target: sock
  });
};
