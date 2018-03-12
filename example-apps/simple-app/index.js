'use strict';

let http = require('http');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  process.message.broadcast({
    group: true,
    action: 'broadcast_test',
    data: 'this is a broadcast_message'
  }, function (err, data) {
    console.log('all message received');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      code: 'SUCCESS',
      data: data,
      action: 'broadcast_test'
    }));
  });
});
console.log('test stdlog');
console.error('test stderror');

serv.on('close', function () {
  console.log('---- simple-app http server close');
});

process.on('broadcast_test', function (data, cb) {
  console.log('>>>> received message:', data);
  cb(null, process.pid);
});

process.on('offline', function (data, cb) {
  console.log('app received offline sig');
  cb(null);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock;
  serv.listen(sock);
  cb(null, {
    bind: '8080',
    router: '/simple-app',
    target: sock
  });
};
