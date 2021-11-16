'use strict';

const ctrlLogBatch = require('./batch_api/log');
const ctrlLogSingle = require('./single_api/log');
const ctrlAppBatch = require('./batch_api/app');
const ctrlAppSingle = require('./single_api/app');
const ctrlSystemBatch = require('./batch_api/system');
const ctrlSystemSingle = require('./single_api/system');
const ctrlDefault  = require('./controller');
const utils = require('../../common/utils');

module.exports = function (router) {
  router.param('appid', (req, res, next, appid) => {
    let error = utils.checkAppId(appid);
    if (error) {
      return next({
        code: 'PARAM_ERROR',
        message: error.message
      });
    }
    next();
  });
  router.param('appName', (req, res, next, appName) => {
    let error = utils.checkAppName(appName);
    if (error) {
      return next({
        code: 'PARAM_ERROR',
        message: error.message
      });
    }
    next();
  });
  /**
   * api v1
   */
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
  router.get('/api/single/ping', ctrlSystemSingle.ping);
  router.get('/api/single/coredump', ctrlAppSingle.listCoreDump);
  router.post('/api/single/coredump', ctrlAppSingle.deleteCoreDump);
  router.get('/api/single/unknow_process', ctrlAppSingle.listUnknowProcess);
  router.delete('/api/single/unknow_process/:pid', ctrlAppSingle.killUnknowProcess);
  router.post('/api/single/cluster_info', ctrlSystemSingle.setClusterInfo);

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
  router.get('/api/unknow_process', ctrlAppBatch.listUnknowProcess);
  router.delete('/api/unknow_process/:pid', ctrlAppBatch.killUnknowProcess);

  router.get('/api/log', ctrlLogBatch.queryLogs);
  router.get('/api/logs', ctrlLogBatch.queryLogFiles);
  router.get('/api/appUsages', ctrlLogBatch.queryAppUsages);
  router.get('/api/status', ctrlSystemBatch.getSystemStatus);
  router.get('/api/ping', ctrlSystemBatch.ping);
  router.post('/api/cluster_info', ctrlSystemBatch.setClusterInfo);

  /**
   * api v2
   */
  router.get('/api/single/apps', ctrlAppSingle.listApps);
  router.post('/api/single/publish', ctrlAppSingle.publishApp);
  router.post('/api/single/app/:appid/start', ctrlAppSingle.startApp);
  router.post('/api/single/app/:appid/stop', ctrlAppSingle.stopApp);
  router.post('/api/single/app/:appid/restart', ctrlAppSingle.restartApp);
  router.post('/api/single/app/:appid/reload', ctrlAppSingle.reloadApp);
  router.delete('/api/single/app/:appid', ctrlAppSingle.deleteApp);
  router.delete('/api/single/app/:appid/exitRecord', ctrlAppSingle.cleanAppExitRecord);
  router.post('/api/single/config/:type/:appName', ctrlAppSingle.setAppConfig);
  router.get('/api/single/config/:type/:appName', ctrlAppSingle.getAppConfig);
  router.post('/api/single/online', ctrlAppSingle.online);
  router.post('/api/single/offline', ctrlAppSingle.offline);
  // router.get('/api/single/log', ctrlLogSingle.queryLog);
  // router.get('/api/single/logs', ctrlLogSingle.queryLogFiles);
  // router.get('/api/single/appUsage', ctrlLogSingle.queryAppUsage);
  // router.get('/api/single/status', ctrlSystemSingle.getSystemStatus);
  // router.get('/api/single/coredump', ctrlAppSingle.listCoreDump);
  router.delete('/api/single/coredump', ctrlAppSingle.deleteCoreDump);
  router.get('/api/single/unknowProcess', ctrlAppSingle.listUnknowProcess);
  router.delete('/api/single/unknowProcess/:pid', ctrlAppSingle.killUnknowProcess);
  router.get('/api/single/downloadLogFile', ctrlLogSingle.downloadLogFile);

  // batch api
  router.get('/api/apps', ctrlAppBatch.listApps);
  router.post('/api/publish', ctrlAppBatch.publish);
  router.post('/api/app/:appid/stop', ctrlAppBatch.stopApps);
  router.post('/api/app/:appid/start', ctrlAppBatch.startApps);
  router.post('/api/app/:appid/reload', ctrlAppBatch.reloadApps);
  router.post('/api/app/:appid/restart', ctrlAppBatch.restartApps);
  router.delete('/api/app/:appid/exitRecord', ctrlAppBatch.cleanAppExitRecord);
  router.delete('/api/app/:appid', ctrlAppBatch.deleteApps);
  router.post('/api/config/:type/:appName', ctrlAppBatch.setAppConfig);
  router.get('/api/config/:type/:appName', ctrlAppBatch.getAppConfig);
  router.post('/api/online', ctrlAppBatch.online);
  router.post('/api/offline', ctrlAppBatch.offline);
  // router.get('/api/coredump', ctrlAppBatch.listCoreDump);
  router.delete('/api/coredump', ctrlAppBatch.deleteCoreDump);
  router.get('/api/unknowProcess', ctrlAppBatch.listUnknowProcess);
  router.delete('/api/unknowProcess/:pid', ctrlAppBatch.killUnknowProcess);
  router.get('/api/downloadLogFile', ctrlLogBatch.downloadLogFileBatch);

  // router.get('/api/log', ctrlLogBatch.queryLogs);
  // router.get('/api/logs', ctrlLogBatch.queryLogFiles);
  router.get('/api/appUsage', ctrlLogBatch.queryAppUsages);
  // router.get('/api/status', ctrlSystemBatch.getSystemStatus);

  // default publish page
  router.get('/', ctrlDefault.publishPage);
  router.post('/api/defaultPublish', ctrlDefault.publishApi);

  return router;
};
