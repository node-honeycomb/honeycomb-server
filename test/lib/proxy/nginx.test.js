const should = require('should');
const fs = require('xfs');
const path = require('path');
const mm = require('mm');
const child = require('child_process');
const Nginx = require('../../../lib/proxy/nginx');


describe('lib/proxy/nginx.js', () => {
  const eaccessFile = path.join(__dirname, './eaccess');
  const nginxBin = path.join(__dirname, './nginxBin');
  const nginxInitedConfig = path.join(__dirname, './conf/nginx_inited_config.conf');
  const nginxNoInjectConfig = path.join(__dirname, './conf/nginx_no_inject.conf');
  const nginxConf = path.join(__dirname, './nginxConf');
  const nginxErrorConf = path.join(__dirname, './nginxErrorconfig');
  const nginxIncludePath = path.join(__dirname, './nginx');
  const nginxSampleConf = path.join(__dirname, '../../../nginx_sample.conf');
  before(() => {
    fs.writeFileSync(nginxErrorConf, '{');
    fs.writeFileSync(nginxBin, 'nginx', {mode: 0o777});
    fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
    fs.writeFileSync(eaccessFile, 'abc', {mode: 0o400});
  });

  after(() => {
    fs.unlinkSync(nginxBin);
    fs.unlinkSync(nginxConf);
    fs.unlinkSync(eaccessFile);
    fs.sync().rm(nginxErrorConf);
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
      healthCheck: {},
      index: '/test'
    };
    beforeEach(() => {
      mm.restore();
      fs.sync().rm(nginxIncludePath);
      fs.sync().mkdir(nginxIncludePath);
    });
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
      let ng;
      try {
        ng = new Nginx(options);
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
      let ng;
      try {
        ng = new Nginx(options);
      } catch (e) {
        e.code.should.eql('NGINX_CONFIG_EACCESS');
      }
    });

    it('should throw error when config file parse error', () => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxErrorConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80',
        healthCheck: {}
      };
      let ng;
      try {
        ng = new Nginx(options);
      } catch (e) {
        e.code.should.eql('NGINX_CONFIG_PARSE_ERROR');
      }
    });

    it('should work fine when conf file without inject', () => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxNoInjectConfig,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        port: '80'
      };
      try {
        let ng = new Nginx(options);
      } catch (e) {
        e.code.should.match(/NGINX_CONFIG_NO_INJECT_FLAG_ERROR/);
      }
    });

    it('should work fine when options.healthCheck is undefined', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80'
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['1.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        file.should.match(/1\.sock/);
        ng.exit();
        done();
      });
    });
    it('should work fine when register stream app', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80'
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        type: 'stream',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['1.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        file.should.eql('');
        ng.exit();
        done();
      });
    });

    it('should work fine when options.healthCheck is setup', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80',
        healthCheck: {
          router: '/status',
          file: 'health_check'
        }
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['111.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        file.should.match(/listen 0.0.0.0:80 +default;/);
        file.should.match(/\/status/);
        file.should.match(/health_check/);
        ng.exit();
        done();
      });
    });

    it('should work fine when app.ssl is setup', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80'
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['111.sock'],
        param: {
          server: {
            ssl_certificate: 's',
            ssl_certificate_key: 's'
          }
        }
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        file.should.match(/listen 0.0.0.0:80 +ssl +default;/);
        ng.exit();
        done();
      });
    });

    it('should work fine when options.ip is undefined', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        port: '80'
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['1.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        file.should.match(/1\.sock/);
        ng.exit();
        done();
      });
    });

    it('should work fine when conf file already inited', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxInitedConfig,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        port: '80'
      };
      let ng = new Nginx(options);
      ng.on('ready', () => {
        ng.exit();
        done();
      });
    });

    it('should watch config file change and re-init', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        port: '80'
      };
      let ng = new Nginx(options);
      let flagReady = 0;
      // change nginxConfig
      ng.on('ready', () => {
        if (flagReady === 1) {
          flagReady++;
          let conf = fs.readFileSync(nginxConf).toString();
          conf.should.match(new RegExp(nginxIncludePath));
          ng.exit();
          done();
        } else if (flagReady === 0) {
          flagReady = 1;
          fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf));
        }
      });
    });

    it('should work fine with upstreamCheck config', (done) => {
      let options = {
        nginxBin: nginxBin,
        nginxConfig: nginxConf,
        nginxIncludePath: nginxIncludePath,
        serverConfigPath: '',
        ip: '0.0.0.0',
        port: '80',
        healthCheck: {},
        index: '/test',
        upstreamCheck: {
          type: 'upstream_check_module'
        }
      };
      let ng = new Nginx(options);
      let app = {
        bind: '80',
        router: '/default_server',
        appId: 'default-app',
        name: 'default-app',
        sockList: ['1.sock', '2.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        file.should.match(/check_http_send/);
        ng.exit();
        done();
      });
    });

    it('should insert honeycomb include and nginx file change re-init', (done) => {
      fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
      let ng = new Nginx(options);
      let file = fs.readFileSync(nginxConf).toString();
      file.match(new RegExp('include ' + nginxIncludePath));
      fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
      setTimeout(() => {
        let file = fs.readFileSync(nginxConf).toString();
        file.match(new RegExp('include ' + nginxIncludePath));
        ng.exit();
        done();
      }, 200);
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
        // type: 'stream',  // default 'http', http  | stream
        sockList: ['1.sock', '2.sock']
        // backupSockList: []
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        fileProxyPass.should.match(/listen 0\.0\.0\.0:80 +default/);
        fileProxyPass.should.match(/location \/default_server\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_default\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_default\-app \{/);
        fileUpstream.should.match(/server unix:1.sock/);
        fileUpstream.should.match(/server unix:2.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with app.router undefined', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/location \//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with app.bind undefined', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        fileProxyPass.should.match(/location \//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with app.bind = {}', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: {},
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        fileProxyPass.should.match(/location \//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with app.bind = []', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: [],
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
        fileProxyPass.should.match(/location \//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with illegal app.bind item', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: ['127.0.0.1:8001', 'abc.com:8002'],
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_127.0.0.1:8001_*.conf')).toString();
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        fs.existsSync(path.join(nginxIncludePath, './http/server_abc.com:8002_*.conf')).should.eql(false);
        nginxProxy.exit();
        done();
      });
    });

    it('should work fine when not match server default flag', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        sockList: ['3.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/listen 0\.0\.0\.0:8080;/);
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:3\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with serverName=[]', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: [],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });

    it('should work fine with multi app register', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        sockList: ['4.sock']
      };
      let app2 = {
        router: '/example2',
        appId: 'simple-app2',
        name: 'simple-app2',
        sockList: ['5.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        nginxProxy.register(app2, (err) => {
          let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:80_*.conf')).toString();
          fileProxyPass.should.match(/location \/example2\/ \{/);
          fileProxyPass.should.match(/location \/example\/ \{/);
          nginxProxy.exit();
          done();
        });
      });
    });

    it('should work fine with serverName={}', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: {},
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.unregister('simple-app', () => {
          fs.existsSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).should.eql(false);
          nginxProxy.exit();
          done();
        });
      });
    });

    it('should work fine with illegal serverName', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: 'abc+def.com',
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.unregister('simple-app', () => {
          fs.existsSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).should.eql(false);
          nginxProxy.exit();
          done();
        });
      });
    });

    it('should work fine with serverName', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: 'test.com',
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_test.com.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });
    it('should work fine with multi serverName', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        serverName: ['test1.com', 'test2.com'],
        sockList: ['4.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_test1.com.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_test2.com.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
      });
    });

    it('should work fine with param', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/example',
        appId: 'simple-app',
        name: 'simple-app',
        param: {
          server: {
            server_directive: 'hello'
          },
          location: {
            location_directive: 'hello'
          }
        },
        sockList: ['4.sock']
      };
      let app2 = {
        bind: '8080',
        router: '/example-22',
        appId: 'simple-app-2',
        name: 'simple-app-2',
        sockList: ['5.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        nginxProxy.register(app2, () => {
          let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
          fileProxyPass.should.match(/location \/example\//);
          fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
          fileProxyPass.should.match(/server_directive hello;/);
          fileProxyPass.should.match(/location_directive hello;/);
          fileProxyPass.indexOf('location_directive').should.eql(fileProxyPass.lastIndexOf('location_directive'));
          let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
          fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
          fileUpstream.should.match(/server unix:4\.sock/);
          nginxProxy.exit();
          done();
        });
      });
    });

    it('should error while nginx reload illegal', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/app1',
        appId: 'app1',
        name: 'app1',
        sockList: ['1.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        let app1 = {
          bind: '8080',
          router: '/app1',
          appId: 'app1',
          name: 'app1',
          sockList: ['1.sock'],
          param: {
            server: {
              rollback_check: 1
            }
          }
        };
        let count = 0;
        mm(child, 'exec', function (cmd, callback) {
          if (/nginxBin \-t /.test(cmd)) {
            callback(null, '', '');
          } else if (/nginxBin \-s reload/.test(cmd)) {
            count ++;
            let err = null;
            let stdout = '';
            let stderr = '';
            if (count <= 1) {
              err = new Error('mock_nginx_reload_error');
              stderr = 'nginx reload error';
            }
            callback(err, stdout, stderr);
          } else {
            callback(null, '', '');
          }
        });
        nginxProxy.register(app, (err) => {
          err.should.match(/mock_nginx_reload_error/);
          let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
          fileProxyPass.should.not.match(/rollback_check/);
          nginxProxy.exit();
          done();
        });
      });
    });

    it('should error while nginx check config illegal', (done) => {
      let nginxProxy = new Nginx(options);
      let app = {
        bind: '8080',
        router: '/app1',
        appId: 'app1',
        name: 'app1',
        sockList: ['1.sock']
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null, '', '');
      });
      nginxProxy.register(app, (err) => {
        let app1 = {
          bind: '8080',
          router: '/app1',
          appId: 'app1',
          name: 'app1',
          sockList: ['1.sock'],
          param: {
            server: {
              rollback_check: 1
            }
          }
        };
        let count = 0;
        mm(child, 'exec', function (cmd, callback) {
          if (/nginxBin \-t /.test(cmd)) {
            count ++;
            let err = null;
            let stdout = '';
            let stderr = '';
            if (count <= 1) {
              err = new Error('mock_nginx_check_error');
              stderr = 'nginx reload error';
            }
            callback(err, stdout, stderr);
          } else if (/nginxBin \-s reload/.test(cmd)) {
            callback(null, '', '');
          }
        });
        nginxProxy.register(app, (err) => {
          err.should.match(/mock_nginx_check_error/);
          let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
          fileProxyPass.should.not.match(/rollback_check/);
          nginxProxy.exit();
          done();
        });
      });
    });
  });

  describe('nginx.getNginxWorkerPids()', () => {
    let options = {
      nginxBin: nginxBin,
      nginxConfig: nginxConf,
      nginxIncludePath: nginxIncludePath,
      serverConfigPath: '',
      ip: '0.0.0.0',
      port: '80',
      healthCheck: {},
      index: '/test'
    };
    beforeEach(() => {
      mm.restore();
    });
    it('should return empty when error', (done) => {
      let ng = new Nginx(options);
      mm(child, 'exec', function (cmd, callback) {
        callback(new Error('mock error'));
      });
      ng.getNginxWorkerPids((err, data) => {
        should(err).eql(null);
        should(data.length).eql(0);
        ng.exit();
        done();
      });
    });
    it('should return empty when error', (done) => {
      let ng = new Nginx(options);
      mm(child, 'exec', function (cmd, callback) {
        callback(null, `
          test 1
          test 2
          test 33
        `);
      });
      ng.getNginxWorkerPids((err, data) => {
        should(err).eql(null);
        should(data).eql(['1', '2', '33']);
        ng.exit();
        done();
      });
    });
  });
  describe('nginx.checkNginxProcess()', () => {
    let options = {
      nginxBin: nginxBin,
      nginxConfig: nginxConf,
      nginxIncludePath: nginxIncludePath,
      serverConfigPath: '',
      ip: '0.0.0.0',
      port: '80',
      healthCheck: {},
      index: '/test'
    };
    beforeEach(() => {
      mm.restore();
    });
    it('should work fine when workers is empty', (done) => {
      let ng = new Nginx(options);
      mm(child, 'exec', function (cmd, callback) {
        callback(null);
      });
      ng.checkNginxProcess([], null, (err) => {
        ng.exit();
        done();
      });
    });
    it('should work fine when workers when check multi time', (done) => {
      let ng = new Nginx(options);
      let a = 0;
      mm(child, 'exec', function (cmd, callback) {
        a++;
        if (a < 3) {
          callback(null);
        } else {
          callback(new Error('mock error'));
        }
      });
      ng.checkNginxProcess([1, 2, 3], null, () => {
        a.should.eql(3);
        ng.exit();
        done();
      });
    });
    it('should work fine when workers when check multi time', (done) => {
      let ng = new Nginx(options);
      let a = 0;
      mm(child, 'exec', function (cmd, callback) {
        a++;
        callback(null);
      });
      ng.checkNginxProcess([1, 2, 3], 2, () => {
        a.should.eql(3);
        ng.exit();
        done();
      });
    });
  });
});