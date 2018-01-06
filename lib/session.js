'use strict';

const fs = require('xfs');
const util = require('util');
const yaml = require('yamljs');
const EventEmitter = require('events');

const log = require('../common/log');

/**
 * =========================
 * example yaml config file
 * =========================
 *
 * example_1.0.0_1:
 *   dir: /$install_dir/run/receiver/example_1.0.0_1
 * websocket_1.1.0_40:
 *   dir: /$install_dir/run/receiver/websocket_1.1.0_40
 * socket_1.0.0_52:
 *   dir: /$install_dir/run/receiver/socket_1.0.0_52
 */

/**
 * Class Yaml
 * @class  Yaml
 * @param {Object} options
 *        - file {Path} yaml file abs path
 */
function Session(options) {
  EventEmitter.call(this);
  this.options = options;
  this.file = options.file;
  try {
    fs.accessSync(this.file);
  } catch (e) {
    fs.sync().save(this.file, '');
  }
}
util.inherits(Session, EventEmitter);

Session.prototype.apps = function () {
  let info;
  try {
    info = yaml.load(this.file);
  } catch (e) {
    log.warn('Load app session file error: ', this.file);
    log.warn(e);
    info = {};
  }
  return info || {};
};

Session.prototype.get = function (appName) {
  const info = this.apps();
  return info && info[appName];
};
/**
 * [set description]
 * @param {String} appName
 * @param {Object} value
 *        - dir {Path}  app root dir
 */
Session.prototype.set = function (appName, value) {
  const info = this.apps();
  info[appName] = value;
  const str = yaml.stringify(info, 4);
  return fs.writeFileSync(this.file, str);
};

Session.prototype.remove = function (appName) {
  const info = this.apps();
  delete info[appName];
  const str = yaml.stringify(info, 4);
  return fs.writeFileSync(this.file, str);
};

module.exports = Session;
