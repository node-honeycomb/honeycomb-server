'use strict';

let http = require('http');
let path = require('path');
let fs = require('fs');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);
let serv = http.createServer(function (req, res) {
  setTimeout(function () {
    res.end('hello');
  }, 5000);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../timout.sock');
  serv.listen(sock);

  process.on('exit', function () {
    fs.unlinkSync(sock);
  });
};
