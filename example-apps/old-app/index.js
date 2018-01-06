'use strict';

let http = require('http');
let path = require('path');
let fs = require('fs');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  res.end('hello');
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../old-app.sock');
  serv.listen(sock);
  cb(null, {
    name: 'old-app',
    version: '1.0.0',
    bind: ['0.0.0.0:10001'],
    url: ['http://localhost/old-app'],
    sock: sock
  });
  process.on('exit', function () {
    try { fs.unlinkSync(sock); } catch (e) {
      // do nothing
    }
  });
};
