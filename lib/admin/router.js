'use strict';

const ctrlLogBatch = require('./batch_api/log');
const ctrlLogSingle = require('./single_api/log');
const ctrlAppBatch = require('./batch_api/app');
const ctrlAppSingle = require('./single_api/app');
const ctrlSystemBatch = require('./batch_api/system');
const ctrlSystemSingle = require('./single_api/system');
const ctrlDefault  = require('./controller');

module.exports = function (router) {
  // single api
  router.get('/api/single/apps', ctrlAppSingle.listApps);
  router.post('/api/single/publish', ctrlAppSingle.publishApp);
  router.post('/api/single/start/:appid', ctrlAppSingle.startApp);
  router.delete('/api/single/stop/:appid', ctrlAppSingle.stopApp);
  router.delete('/api/single/clean_exit_record/:appid', ctrlAppSingle.cleanAppExitRecord);
  router.post('/api/single/restart/:appid', ctrlAppSingle.restartApp);
  router.post('/api/single/reload/:appid', ctrlAppSingle.reloadApp);
  router.delete('/api/single/delete/:appid', ctrlAppSingle.deleteApp);
  router.post('/api/single/config/:type/:appName', ctrlAppSingle.setAppConfig);
  router.get('/api/single/config/:type/:appName', ctrlAppSingle.getAppConfig);
  router.get('/api/single/online', ctrlAppSingle.online);
  router.get('/api/single/offline', ctrlAppSingle.offline);
  router.get('/api/single/log', ctrlLogSingle.queryLog);
  router.get('/api/single/logs', ctrlLogSingle.queryLogFiles);
  router.get('/api/single/appUsage', ctrlLogSingle.queryAppUsage);
  router.get('/api/single/status', ctrlSystemSingle.getSystemStatus);
  router.get('/api/single/coredump', ctrlAppSingle.listCoreDump);
  router.post('/api/single/coredump', ctrlAppSingle.deleteCoreDump);
  router.get('/api/single/dead_process', ctrlAppSingle.listDeadProcess);
  router.delete('/api/single/dead_process/:pid', ctrlAppSingle.killDeadProcess);

  // batch api
  router.get('/api/apps', ctrlAppBatch.listApps);
  router.post('/api/publish', ctrlAppBatch.publish);
  router.post('/api/stop/:appid', ctrlAppBatch.stopApps);
  router.post('/api/start/:appid', ctrlAppBatch.startApps);
  router.post('/api/reload/:appid', ctrlAppBatch.reloadApps);
  router.post('/api/restart/:appid', ctrlAppBatch.restartApps);
  router.post('/api/delete/:appid', ctrlAppBatch.deleteApps);
  router.post('/api/config/:appName', ctrlAppBatch.setAppConfig);
  router.post('/api/config/:type/:appName', ctrlAppBatch.setAppConfig);
  router.delete('/api/clean_exit_record/:appid', ctrlAppBatch.cleanAppExitRecord);
  router.get('/api/config/:appName', ctrlAppBatch.getAppConfig);
  router.get('/api/config/:type/:appName', ctrlAppBatch.getAppConfig);
  router.get('/api/online', ctrlAppBatch.online);
  router.get('/api/offline', ctrlAppBatch.offline);
  router.get('/api/coredump', ctrlAppBatch.listCoreDump);
  router.post('/api/coredump', ctrlAppBatch.deleteCoreDump);
  router.get('/api/dead_process', ctrlAppBatch.listDeadProcess);
  router.delete('/api/dead_process/:pid', ctrlAppBatch.killDeadProcess);

  router.get('/api/log', ctrlLogBatch.queryLogs);
  router.get('/api/logs', ctrlLogBatch.queryLogFiles);

  router.get('/api/appUsages', ctrlLogBatch.queryAppUsages);
  router.get('/api/status', ctrlSystemBatch.getSystemStatus);

  // default publish page
  router.get('/', ctrlDefault.publishPage);
  router.post('/api/defaultPublish', ctrlDefault.publishApi);

  return router;
};
