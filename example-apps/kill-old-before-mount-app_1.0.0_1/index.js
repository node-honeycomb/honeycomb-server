'use strict';

let http = require('http');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let healthStatus = true;
let router = '/kill-old';

let serv = http.createServer(function (req, res) {
  let path = req.url;
  console.log(path);
  if (path == router + '/health') {
    if (healthStatus) {
      res.statusCode = 200;
    } else {
      res.statusCode = 404;
    }
    res.end();
  } else if (path == router + '/status') {
    healthStatus = !healthStatus;
    res.end('switch health status to:' + healthStatus);
  } else {
    res.statusCode = 404;
    res.end('404:' + path);
  }
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock;
  serv.listen(sock);
  cb(null, {
    bind: '8080',
    router: router,
    target: sock
  });
};
