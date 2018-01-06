'use strict';

let http = require('http');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);
let pkg = require('./package.json');
let serv = http.createServer(function (req, res) {
  res.end(`simple-app_v${pkg.version}_${pkg.build}`);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock;
  serv.listen(sock);
  cb(null, {
    bind: '6001',
    router: '/example',
    target: sock
  });
};
