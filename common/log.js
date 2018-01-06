'use strict';

const LiteLog = require('litelog');
const config = require('../config');
const utils = require('./utils');
const log = LiteLog.create(config.logs);


log.get('sys').setFormatter(function (obj) {
  let pid = utils.fixStringLength(obj.pid, 5);
  let level = obj.level.length === 4 ? obj.level + ' ' : obj.level;
  let colorDisPlay = obj.color(obj.level, obj.time() + ' ' + level);
  return `${colorDisPlay} #${pid} ${obj.msg} \t(${obj.pos})`;
});


log.colorful(config.debug);

module.exports = log;
