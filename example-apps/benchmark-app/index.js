'use strict';

let http = require('http');
let path = require('path');
let fs = require('fs');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);
let serv = http.createServer(function (req, res) {
  return res.end('hello');
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../benchmark.sock');
  serv.listen(sock);
  cb(null, {
    bind: '10002',
    target: sock
  });
  process.on('exit', function () {
    try {
      fs.unlinkSync(sock);
    } catch (e) {
      // do nothing
    }
  });
};
