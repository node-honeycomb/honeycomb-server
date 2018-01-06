'use strict';

const path = require('path');
const serverInstallRoot = path.join(__dirname, '../../../');
const fs = require('fs');
const ip = require('ip');
let serverList = [];

try {
  let serverListFile = path.join(serverInstallRoot, './conf/server.list');
  let servers = fs.readFileSync(serverListFile).toString().split('\n');
  serverList = [];
  servers.forEach(function (v) {
    v = v.trim();
    if (!v) {
      return;
    }
    serverList.push(v);
  });
} catch (e) {
  // do nothing
  serverList = [ip.address()];
}

module.exports = {
  debug: false,
  env: 'daily',
  runDir: path.join(serverInstallRoot, './run'),
  pidFile: path.join(serverInstallRoot, './run/server.pid'),
  appsSessionPath: path.join(serverInstallRoot, './run/app.mount.info.yaml'),
  logs: {
    sys: {
      level: 'INFO',
      rotation: 60,
      file: path.join(serverInstallRoot, './logs/server.%year%-%month%-%day%.log')
    },
    appUsage: {
      level: 'INFO',
      rotation: 168,
      file: path.join(serverInstallRoot, './logs/app-usage.%year%-%month%-%day%-%hour%.log')
    }
  },
  admin: {
    appsRoot: path.join(serverInstallRoot, './run/appsRoot'),
    gatherUsage: true
  },
  proxy: {
    port: 6001
  },
  serverList: serverList
};
