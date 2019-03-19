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
  // single vm
  serverList = [ip.address()];
}

module.exports = {
  debug: false,
  env: 'production',
  serverRoot: serverInstallRoot,
  logs: {
    sys: {
      level: 'INFO',
      rotation: 60,
      file: path.join(serverInstallRoot, './logs/server.%year%-%month%-%day%.log')
    },
    appUsage: {
      level: 'INFO',
      rotation: 168,
      file: path.join(serverInstallRoot, './logs/__usage__/app-usage.%year%-%month%-%day%-%hour%.log')
    },
    nodejsStd: {
      level: 'INFO',
      rotation: 168,
    }
  },
  proxy: {
    proxyAdmin: false
  },
  admin: {
    gatherUsage: true
  },
  serverList: serverList
};
