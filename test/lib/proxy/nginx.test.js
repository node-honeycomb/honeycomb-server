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
  const nginxErrorConf = path.join(__dirname, './nginx_error_config');
  const nginxIncludePath = path.join(__dirname, './nginx');
  const nginxSampleConf = path.join(__dirname, '../../../nginx_sample.conf');
  before(() => {
    fs.writeFileSync(nginxBin, 'nginx', {mode: 0o777});
    fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
    fs.writeFileSync(eaccessFile, 'abc', {mode: 0o400});
  });

  after(() => {
    console.log('>> lib/proxy/nginx.js test done');
    try {
      fs.unlinkSync(nginxBin);
      fs.unlinkSync(nginxConf);
      fs.unlinkSync(eaccessFile);
      fs.sync().rm(nginxErrorConf);
      fs.sync().rm(nginxIncludePath);
    } catch (e) {
      console.log('>> lib/proxy/nginx.js after hook exception', e.stack);
      // do nothing
    }
    console.log('>> lib/proxy/nginx.js test after hook done');
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
        callback(null);
      });
      ng.register(app, (err) => {
        let file = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        file.should.match(/check_http_send/);
        done();
      });
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

    it('should insert honeycomb include and nginx file change re-init', (done) => {
      fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
      let ng = new Nginx(options);
      let file = fs.readFileSync(nginxConf).toString();
      file.match(new RegExp('include ' + nginxIncludePath));
      fs.writeFileSync(nginxConf, fs.readFileSync(nginxSampleConf), {mode: 0o666});
      setTimeout(() => {
        let file = fs.readFileSync(nginxConf).toString();
        file.match(new RegExp('include ' + nginxIncludePath));
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
        // type: 'socket',  // default 'http', http | socket | stream
        sockList: ['1.sock', '2.sock']
        // backupSockList: []
      };
      mm(child, 'exec', function (cmd, callback) {
        callback(null);
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
        callback(null);
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
      mm(child, 'exec', function (cmd, callback) {
        callback(null);
      });
      nginxProxy.register(app, (err) => {
        should.not.exists(err);
        let fileProxyPass = fs.readFileSync(path.join(nginxIncludePath, './http/server_0.0.0.0:8080_*.conf')).toString();
        fileProxyPass.should.match(/location \/example\//);
        fileProxyPass.should.match(/proxy_pass http:\/\/honeycomb_simple\-app;/);
        fileProxyPass.should.match(/server_directive hello;/);
        fileProxyPass.should.match(/location_directive hello;/);
        let fileUpstream = fs.readFileSync(path.join(nginxIncludePath, './http/all_upstream.conf')).toString();
        fileUpstream.should.match(/upstream honeycomb_simple-app \{/);
        fileUpstream.should.match(/server unix:4\.sock/);
        nginxProxy.exit();
        done();
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
        callback(null);
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
            callback(null);
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
        callback(null);
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
            callback(null);
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
});