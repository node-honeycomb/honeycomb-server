const should = require('should');
const fs = require('xfs');
const path = require('path');
const mm = require('mm');
const child = require('child_process');
const Nginx = require('../../../lib/proxy/nginx');


describe('lib/proxy/nginx.js', () => {
  const eaccessFile = path.join(__dirname, './eaccess');
  const nginxBin = path.join(__dirname, './nginxBin');
  const nginxConf = path.join(__dirname, './nginxConf');
  const nginxIncludePath = path.join(__dirname, './nginx');
  const nginxSampleConf = path.join(__dirname, '../../../nginx_sample.conf');
  before(() => {
    fs.writeFileSync(nginxBin, 'nginx', {mode: 0o777});
    fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
    fs.writeFileSync(eaccessFile, 'abc', {mode: 0o400});
  });

  after(() => {
    fs.unlinkSync(nginxBin);
    fs.unlinkSync(nginxConf);
    fs.unlinkSync(eaccessFile);
    fs.sync().rm(nginxIncludePath);
  });

  describe('new nginx proxy()', () => {
    let options = {
      nginxBin: nginxBin,
      nginxConfig: nginxConf,
      nginxIncludePath: nginxIncludePath,
      serverConfigPath: '',
      ip: '0.0.0.0',
      port: '80',
      healthCheck: {}
    };
    it('should throw error when binPath error', () => {
      let options = {
        nginxBin: path.join(__dirname, './nginx.test.js'),
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80',
        healthCheck: {}
      };
      try {
        new Nginx(options);
      } catch (e) {
        e.code.should.eql('NGINX_BIN_EACCESS');
      }
    });
    it('should throw error when config file eaccess', () => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: eaccessFile,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80',
        healthCheck: {}
      };
      try {
        new Nginx(options);
      } catch (e) {
        e.code.should.eql('NGINX_CONFIG_EACCESS');
      }
    });

    it('should work fine', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        // version: '0.0.0',
        // buildNum: 0,
        // pid: 4588,
        // type: 'socket',  // default 'http', http | socket | stream
        sockList: ['1.sock', '2.sock']
        // backupSockList: []
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null);
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        done();
      });
    });
    it('should work fine while default', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        // version: '0.0.0',
        // buildNum: 0,
        // pid: 4588,
        // type: 'socket',  // default 'http', http | socket | stream
        sockList: ['1.sock', '2.sock']
        // backupSockList: []
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null);
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        done();
      });
    });
  });
});