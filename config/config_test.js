'use strict';
const path = require('path');

module.exports = {
  debug: false,
  logs: {
    sys: {
      level: 'DEBUG',
      file: path.join(__dirname, '../logs/server.%year%-%month%-%day%.log')
    }
  },
  appReadyTimeout: 2000,
  proxy: {
    port: 8080,
    index: '/console',
    traceIdName: 'test',
    nginxBin: null,
    nginxConfig: null
  },
  appsSessionPath: path.join(__dirname, '../test/app.mount.info.yaml'),
  appsRoot: path.join(__dirname, '../test/appsRoot'),
  admin: {
    msgTimeout: 6 * 1000,
    enablePublishPage: true,
    gatherUsage: true
  }
};
