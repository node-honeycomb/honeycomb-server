const qs = require('querystring');
const path = require('path');
const async = require('async');
const supertest = require('supertest');
const config = require('../config');
const utils = require('../common/utils');
const Master = require('../lib/master');
let master;
before(function (done) {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);
  const appsPkgBase = path.join(__dirname, '../example-apps');
  master = new Master(config);
  /**
   * test for master start with app.session
   */
  async.series([
    (done) => {
      master.children['mock'] = {stop: function(cb){cb()}};
      master.exit(() => {
        master = new Master(config);
        done();
      });
    },
    (done) => {
      master.___exit = master.exit;
      master.exit = function () {};
      master.run(() => {
        process.emit('SIGHUB');
        process.emit('SIGTEM');
        process.emit('SIGQUIT');
        // process.emit('SIGINT');
        process.emit('SIGABRT');
        master.___exit(() => {
          master = new Master(config);
          done();
        });
      });
    },
    (done) => master.run(done),
    (done) => {
      exports.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz')).end(done)
    },
    (done) => {
      exports.publishApp(agent, ips, path.join(appsPkgBase, 'https-app.tgz')).end(done)
    },
    (done) => {
      master.exit(done);
      master.exit((err) => {
        err.message.should.match(/master is shutting down/);
      });
    },
    (done) => {
      master = new Master(config);
      master.run(done);
    },
    (done) => {
      Object.keys(master.getChild('simple-app')).length.should.above(0);
      Object.keys(master.getChild('https-app')).length.should.above(0);
      done();
      console.log('test server ready');
    },
    (done) => exports.deleteApp(agent, ips, 'simple-app').end(done),
    (done) => exports.deleteApp(agent, ips, 'https-app').end(done)
  ], done);
});

after((done) => {
  console.log('test server exit');
  master.exit(done);
});

function commonErrorGet(superAgent, url, query, opt) {
  if (typeof query === 'object') {
    query = qs.stringify(query);
  }
  if (query) {
    if (url.indexOf('?') === -1) {
      url += '?' + query;
    } else {
      url += '&' + query;
    }
  }
  let date = opt.date ? opt.date.toGMTString() : new Date().toGMTString();
  let stringToSign = opt.stringToSign || `GET\nundefined\n\nundefined\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  return superAgent.get(url)
    .set('date', date)
    .set('authorization', `honeycomb admin:${signature}`);
};

function commonGet(superAgent, url, query) {
  if (typeof query === 'object') {
    query = qs.stringify(query);
  }
  if (query) {
    if (url.indexOf('?') === -1) {
      url += '?' + query;
    } else {
      url += '&' + query;
    }
  }
  let date = new Date().toGMTString();
  let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  return superAgent.get(url)
    .set('date', date)
    .set('authorization', `honeycomb admin:${signature}`);
};

function commonDelete(superAgent, url, query) {
  if (typeof query === 'object') {
    query = qs.stringify(query);
  }
  if (query) {
    if (url.indexOf('?') === -1) {
      url += '?' + query;
    } else {
      url += '&' + query;
    }
  }
  let date = new Date().toGMTString();
  let stringToSign = `DELETE\nundefined\n\nundefined\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  return superAgent.delete(url)
    .set('date', date)
    .set('authorization', `honeycomb admin:${signature}`);
};

function commonPost(superAgent, url, data) {
  let contentType = 'application/json';
  let contentMd5;
  let date = new Date().toGMTString();
  if (data) {
    contentMd5 = utils.md5base64(JSON.stringify(data));
  } else {
    contentMd5 = utils.md5base64('');
  }
  let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  let agent = superAgent.post(url)
    .set('Date', date)
    .type(contentType)
    .set('Authorization', `honeycomb admin:${signature}`);
  if (data) {
    agent.send(data)
  }
  return agent;
};

exports.publishApp = (superAgent, ips, file, noStart) => {
  let url = `/api/publish?ips=${ips}&timeout=60000`;
  if (noStart) {
    url += '&nostart=true'
  }
  let agent = superAgent.post(url)
    .attach('pkg', file);
  let date = new Date().toGMTString();
  let headers = agent._getFormData().getHeaders({});
  let contentType = headers['content-type'];
  let contentMd5 = utils.md5base64('');
  let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  agent.set('Date', date);
  agent.set('Authorization', `honeycomb admin:${signature}`);
  return agent;
};

exports.listApp = (superAgent, ips) => {
  let url = `/api/apps?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.startApp = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}/start?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.stopApp = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}/stop?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.deleteApp = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}?ips=${ips}`;
  return commonDelete(superAgent, url);
};

exports.restartApp = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}/restart?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.reloadApp = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}/reload?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.getAppConfig = (superAgent, ips, appName) => {
  let url = `/api/config/app/${appName}?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.setAppConfig = (superAgent, ips, appName, data) => {
  let url = `/api/config/app/${appName}?ips=${ips}`;
  return commonPost(superAgent, url, data);
};

exports.getServerConfig = (superAgent, ips, appName) => {
  let url = `/api/config/server/${appName}?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.setServerConfig = (superAgent, ips, appName, data) => {
  let url = `/api/config/server/${appName}?ips=${ips}`;
  return commonPost(superAgent, url, data);
};

exports.setClusterInfo = (superAgent, ips, data) => {
  let url = `/api/cluster_info?ips=${ips}`;
  return commonPost(superAgent, url, data);
}

/**
 * get app usages
 * @param  {Object} superAgent
 * @param  {String} ips
 * @param  {Object} query
 *         fileName {FileName} app-usage.2017-01-05-19.log
 */
exports.getAppUsage = (superAgent, ips, query) => {
  let url = `/api/appUsages?ips=${ips}`;
  return commonGet(superAgent, url, query);
};

exports.listLog = (superAgent, ips) => {
  let url = `/api/logs?ips=${ips}`;
  return commonGet(superAgent, url);
};

/**
 * get log
 * @param  {Object} superAgent [description]
 * @param  {String} ips        [description]
 * @param  {Object} query
 *         fileName {FileName} xxxx.log
 *         logLines {Number} 100
 *         startTime {String} 10:00:00
 *         filterString {String}
 */
exports.getLog = (superAgent, ips, query) => {
  let url = `/api/log?ips=${ips}`;
  return commonGet(superAgent, url, query);
};

exports.downloadLog = (superAgent, ips, fileName) => {
  let url = `/api/downloadLogFile?ips=${ips}&file=${fileName}`;
  return commonGet(superAgent, url);
};

exports.status = (superAgent, ips) => {
  let url = `/api/status?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.ping = (superAgent, ips, cluster) => {
  let url = `/api/ping?ips=${ips}&clusterCode=${cluster}`;
  return commonGet(superAgent, url);
};

exports.healthCheck = (superAgent, ips) => {
  let url = `/status`;
  return commonGet(superAgent, url);
};

exports.cleanAppExitRecord = (superAgent, ips, appId) => {
  let url = `/api/app/${appId}/exitRecord?ips=${ips}`;
  return commonDelete(superAgent, url);
};

exports.online = (superAgent, ips) => {
  let url = `/api/online?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.offline = (superAgent, ips) => {
  let url = `/api/offline?ips=${ips}`;
  return commonPost(superAgent, url);
};

exports.checkCoreDump = (superAgent, ips) => {
  let url = `/api/coredump?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.deleteCoreDump = (superAgent, ips, query) => {
  let url = `/api/coredump?ips=${ips}`;
  return commonDelete(superAgent, url, query);
};

exports.checkUnknowProcess = (superAgent, ips) => {
  let url = `/api/unknowProcess?ips=${ips}`;
  return commonGet(superAgent, url);
};

exports.killUnknowProcess = (superAgent, ips, pid) => {
  let url = `/api/unknowProcess/${pid}?ips=${ips}`;
  return commonDelete(superAgent, url);
};

exports.getMaster = () => {
  return master;
};

exports.commonPost = commonPost;
exports.commonErrorGet = commonErrorGet;
