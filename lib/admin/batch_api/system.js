'use strict';
const utils = require('../utils');

const resultsWrap = utils.resultsWrap;

/**
 * @api /api/status
 * @query {string} ips - 批处理调用single api时的 ip 列表
 */
exports.getSystemStatus = function (req, res) {
  let ips = req.query.ips;
  ips = ips && ips.split(',');
  let path = '/api/single/status';
  utils.callremote(path, {method: 'GET', ips: ips}, function (err, results) {
    res.json(resultsWrap(err, results));
  });
};
