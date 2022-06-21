'use strict';
const path = require('path');
// const cp = require('child_process');

/*
function getNginxNin() {
  let ng = cp.execSync('which nginx').toString().trim();
  return ng;
}
*/

module.exports = {
  debug: false,
  cluster: 'test',
  logs: {
    sys: {
      level: 'DEBUG',
      file: path.join(__dirname, '../logs/server.%year%-%month%-%day%.log')
    },
    appUsage: {
      level: 'INFO',
      rotation: 168,
      file: path.join(__dirname, '../logs/app-usage.%year%-%month%-%day%-%hour%.log')
    }
  },
  appReadyTimeout: 3000,
  proxy: {
    port: 8080,
    index: '/console',
    traceIdName: 'test',
    nginxBin: null, // getNginxNin(),
    nginxConfig: null // path.join(__dirname, '../nginx.conf')
  },
  appsSessionPath: path.join(__dirname, '../test/app.mount.info.yaml'),
  appsRoot: path.join(__dirname, '../test/appsRoot'),
  admin: {
    msgTimeout: 6 * 1000,
    enablePublishPage: true,
    gatherUsage: true,
    readLogMaxLines: 500,
    hooks: {
      publish: 'ls .'
    }
  }
};
