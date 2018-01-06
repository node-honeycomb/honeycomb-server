'use strict';

let http = require('http');
let path = require('path');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  let info = 'hello';
  res.end(info + '#' + process.pid);
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../test_https_app.sock');
  serv.listen(sock);
  cb(null, {
    bind: '8999',
    router: '/example',
    target: sock,
    param: {
      server: {
        ssl_certificate: path.join(__dirname, './ssl/crt.pem'),
        ssl_certificate_key: path.join(__dirname, './ssl/key.pem')
      },
      location: {
        client_max_body_size: '100m', // nginx
      }
    }
  });
};
