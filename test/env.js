'use strict';
const fs = require('xfs');
const path = require('path');
const _ = require('lodash');
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

const childProcess = require('child_process');
const fork = childProcess.fork;

childProcess.fork = function(modulePath, args, options) {
  const execPath = path.resolve(__dirname, '../node_modules/.bin/istanbul');
  args = [
    'cover',
    '--report', 'none',
    '--print', 'none',
    '--include-pid',
    '--root', path.join(__dirname, '../'),
    modulePath
  ].concat(args);
  return fork.apply(childProcess,[execPath, args, options]);
}

process.on('exit', function () {
  fs.sync().rm(path.join(__dirname, './appsRoot'));
  fs.sync().rm(path.join(__dirname, './app.mount.info.yaml'));
});