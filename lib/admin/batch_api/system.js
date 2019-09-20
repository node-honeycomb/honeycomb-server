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
  utils.callremote(path, {method: 'GET', ips: ips, timeout: 5000}, function (err, results) {
    res.json(resultsWrap(err, results));
  });
};

/**
 * @api {POST} /api/cluster_info
 * @query {string} ips - 批处理调用single api时的 ip 列表
 * @body
 *		{cluster: '', serverList: []}
 */
exports.setClusterInfo = function (req, res) {
  let ips = req.query.ips;
  ips = ips && ips.split(',');
  let path = '/api/single/cluster_info';
  utils.callremote(path, {method: 'POST', ips: ips, data: req.body}, function (err, results) {
    res.json(resultsWrap(err, results));
  });
};
