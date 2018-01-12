'use strict';
const fs = require('xfs');
const path = require('path');
process.env.changeUser = false;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.env.HONEYCOMB_SERVER_ROOT = path.join(__dirname, '../');

let configFile = path.join(__dirname, '../config/config_test.js');
let configTmp = path.join(__dirname, '../config/config.js');

fs.sync().save(configTmp, fs.readFileSync(configFile));
fs.sync().mkdir(path.join(__dirname, '../conf/apps'));

if (process.version < 'v6.0.0') {
  throw new Error('please update node version up to v6.0.0');
}


process.on('exit', function () {
  fs.unlinkSync(configTmp);
  fs.sync().rm(path.join(__dirname, './appsRoot'));
  fs.sync().rm(path.join(__dirname, './app.mount.info.yaml'));
});