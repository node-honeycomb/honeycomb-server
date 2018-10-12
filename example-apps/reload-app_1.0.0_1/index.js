'use strict';

let http = require('http');
let path = require('path');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  res.setHeader('content-type', 'application/json');
  serverConfig.config.cluster = process.getClusterInfo();
  res.end(JSON.stringify(serverConfig.config));
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock;
  serv.listen(sock);
  cb(null, {
    bind: '6001',
    router: '/reload-app',
    target: sock
  });
};
