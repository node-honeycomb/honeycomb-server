'use strict';
const Master = require('./lib/master');
const config = require('./config');
const log = require('./common/log');
// 迁移老配置
const migrate = require('./common/migration');
const flag = migrate.run(config.serverRoot);
if (flag) {
  config.reload();
}
const master = new Master(config);

process.chdir(__dirname);

log.info('====================');
log.info('starting server');
log.info('====================');

master.on('ready', () => {
  master.run(function (err) {
    if (err) {
      console.error('server start failed, err: ', err.stack); // eslint-disable-line
      process.exit(1);
    } else {
      log.info('server start success', `http://${config.host || '127.0.0.1'}:${config.proxy.port}`);
      // do not remove this console.log, for start.sh checking
      console.log('SERVER_START_SUCCESSFULLY'); // eslint-disable-line
    }
  });
});

master.on('error', function (err) {
  log.error('MASTER_ERROR', err);
});
