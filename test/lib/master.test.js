'use strict';

const mm = require('mm');
const fs = require('xfs');
const path = require('path');
const should = require('should');
const ip = require('ip').address();
const supertest = require('supertest');
const utils = require('../../common/utils');
const message = require('../../lib/message');
const common = require('../common');
const Master = require('../../lib/master');

describe('lib/master.js', function () {
  let master;
  let config = require('../../config');
  before(function (done) {
    master = common.getMaster();
    done();
  });

  after(function () {
    mm.restore();
  });
  describe('test https boot', function () {
    // const Master = require('../../lib/master');
    let master;
    let httpsConfig;
    before((done) => {
      httpsConfig = JSON.parse(JSON.stringify(config));
      httpsConfig.logsRoot = path.join(__dirname, '../../logs');
      httpsConfig.admin.https = {
        key: path.join(__dirname, '../common/key.pem'),
        cert: path.join(__dirname, '../common/server.crt'),
      };
      httpsConfig.admin.port += 2;
      done();
    });
    after((done) => {
      if (master && !master.flagExit) {
        return master.exit(done);
      }
      done();
    });
    it('should boot with https when https config is right', function (done) {
      master = new Master(httpsConfig);
      master.run((err) => {
        should(err).eql(null);
        let agent = supertest(`https://localhost:${httpsConfig.admin.port}`);
        common.status(agent,'127.0.0.1')
          .expect(200)
          .end((err, res) => {
            if(err) {
              return master.exit(() => {
                done(err);
              });
            }
            should(res.body.code).eql('SUCCESS');
            master.exit(done);
            master = null;
          })
      });
    });
    it('publish simple app', function (done) {
      let agent = supertest(`https://localhost:${httpsConfig.admin.port}`);
      const appsPkgBase = path.join(__dirname, '../../example-apps');
      master = new Master(httpsConfig);
      master.run((err) => {
        should(err).eql(null);
        common.publishApp(agent, '127.0.0.1', path.join(appsPkgBase, 'simple-app.tgz'))
          .expect(200)
          .end((err, res) => {
            if (err) {
              return master.exit(() => {
                done(err);
              });
            }
            should(res.body.data.success.length).above(0);
            master.exit(done);
            master = null;
          });
      });
    });
    it('should boot with http when https config is error', function (done) {
      httpsConfig.admin.https.key = null;
      master = new Master(httpsConfig);
      master.run((err) => {
        should(err).eql(null);
        should(master.admin.options.https).eql(undefined);
        master.exit(done);
        master = null;
      });
    });
  });
  describe('test $mount()', function () {
    it('should return error when appId not exists', function (done) {
      master.$mount(null, {
        dir: '/test'
      }, function (err) {
        err.code.should.eql('PARAM_MISSING');
        done();
      });
    });
    it('should return error when appId not exists', function (done) {
      master.$mount('test', {
        dir: ''
      }, function (err) {
        err.code.should.eql('PARAM_MISSING');
        done();
      });
    });
  });
  describe('test $unmount()', function () {
    it('should work fine when appId not exists', function (done) {
      master.$unmount(null, function (err) {
        err.code.should.eql('APP_NOT_MOUNTED');
        done();
      });
    });
    it('should work fine when appId forbidden to unmount', function (done) {
      master.$unmount('__ADMIN__', function (err) {
        err.code.should.eql('APP_FORBIDDEN_MOUNT');
        done();
      });
    });
    it('should work fine when appId forbidden to unmount', function (done) {
      master.$unmount('__PROXY__', function (err) {
        err.code.should.eql('APP_FORBIDDEN_MOUNT');
        done();
      });
    });
  });

  describe('test child fork', () => {
    it('should return when child\' worker already forked', () => {
      let proxy = master.getChild('__PROXY__');
      Object.keys(proxy.workers).length.should.eql(1);
      proxy._create();
      Object.keys(proxy.workers).length.should.eql(1);
    });
  });

  describe('test $restartAdmin', () => {
    it('should work fine', (done) => {
      let oldPid = master.admin.getPid()[0];
      master.$restartAdmin((err) => {
        let newPid = master.admin.getPid()[1];
        should(err).eql(null);
        oldPid.should.not.eql(newPid);
        done();
      });
    });
  });


  describe('test $status', function () {
    it('should work fine', function (done) {
      master.$status(function (err, data) {
        should.not.exists(err);
        data.startTime.should.be.an.Number();
        data.runningTime.should.be.an.Number();
        data.apps.should.be.an.Object();
        done();
      });
    });
  });
  /*
  describe('test $list', function () {
    it('should work fine', function (done) {
      master.$list(function (err, apps) {
        should.not.exists(err);
        apps.should.be.an.Object();
        done();
      });
    });
  });
  */

  describe('test Events', function () {
    it('should work fine when app_message called', function (done) {
      master.$test = function (info, cb) {
        info.should.eql(123);
        cb(null, 'hello');
      };

      let proc = master.admin.getFirstWorker();
      let msg = message.genMessage({
        action: '$test',
        data: 123,
        target: proc,
      });
      mm(proc, 'send', function (cbmsg) {
        cbmsg._id.should.eql(msg._id);
        cbmsg.action.should.eql(message.getCallbackActionName());
        cbmsg.data.should.eql('hello');
        mm.restore();
        done();
      });
      proc.emit('message', msg);
    });

    it('should work fine when app_message called with arguments', function (done) {
      master.$test = function (info, cb) {
        info.should.eql(123);
        cb(null, 'hello');
      };

      let proc = master.admin.getFirstWorker();
      let msg = message.genMessage({
        action: '$test',
        arguments: [123],
        target: proc,
      });
      mm(proc, 'send', function (cbmsg) {
        cbmsg._id.should.eql(msg._id);
        cbmsg.action.should.eql(message.getCallbackActionName());
        cbmsg.data.should.eql('hello');
        mm.restore();
        done();
      });
      proc.emit('message', msg);
    });

    it('should work fine when app_message called without args', function (done) {
      master.$test = function (cb) {
        cb(null, 'hello');
      };

      let proc = master.admin.getFirstWorker();
      let msg = message.genMessage({
        action: '$test',
        target: proc,
      });
      mm(proc, 'send', function (cbmsg) {
        cbmsg._id.should.eql(msg._id);
        cbmsg.action.should.eql(message.getCallbackActionName());
        cbmsg.data.should.eql('hello');
        mm.restore();
        done();
      });
      proc.emit('message', msg);
    });
    it('should work fine when app_message called no exists func', function (done) {
      let proc = master.admin.getFirstWorker();
      let msg = message.genMessage({
        action: '$no-exists',
        target: proc,
      });
      mm(proc, 'send', function (cbmsg) {
        cbmsg._id.should.eql(msg._id);
        cbmsg.action.should.eql(message.getCallbackActionName());
        cbmsg.error.should.eql('unknow rpc call: $no-exists');
        mm.restore();
        done();
      });
      proc.emit('message', msg);
    });

    it('should work fine when emit app_exit', function () {
      master.emit('app_exit', {
        options: {
          appId: 1
        }
      });
    });
    it('should work fine when emit app_retry', function () {
      master.emit('app_retry', {
        options: {
          appId: 1
        }
      });
    });
    it('should work fine when emit app_giveup', function () {
      master.emit('app_giveup', {
        options: {
          appId: 1
        }
      });
    });
    it('should work fine when emit app_error', function () {
      master.emit('app_error', {
        options: {
          appId: 1
        }
      }, {});
    });
  });

  describe('test _fork', function () {
    it('should return if already exists app', function (done) {
      master.children['xx-xx'] = {
        status: 'online'
      };
      master._fork('xx-xx', {}, function (err) {
        err.message.should.match(/already exists/);
        delete master.children['xx-xx'];
        done();
      });
    });
    it('should return if no-exists app', function (done) {
      master._fork('unexists-dir', {
        file: 'null'
      }, function (err) {
        err.message.should.match(/enter_file_not_found/);
        done();
      });
    });
  });


  describe('test signal', function () {
    it('should offline server when kill SIGUSR2', function (done) {
      fs.writeFileSync(config.serverStatusFile, 'offline');
      process.emit('SIGUSR2');
      setTimeout(function () {
        should(fs.existsSync(config.proxy.healthCheck.file)).eql(false);
        fs.writeFileSync(config.proxy.healthCheck.file, '');
        done();
      }, 1000);
    });
    after(() => {
      fs.writeFileSync(config.serverStatusFile, 'online');
      process.emit('SIGUSR2');
      should(fs.existsSync(config.proxy.healthCheck.file)).eql(true);
    })
  });

  describe('test app with broken api(will cause app exit)', () => {

  });

  describe.skip('test master.initApps', () => {
    let newCfg = JSON.parse(JSON.stringify(config));
    newCfg.admin.port = 29999;
    newCfg.appsSessionPath = path.join(__dirname, 'tmp_mount2.yaml');
    newCfg.pidFile = path.join(__dirname, 'hc.pid');
    let master;
    let agent = supertest(`http://localhost:${newCfg.admin.port}`);
    let ips = `http://127.0.0.1:${newCfg.admin.port}`;
    beforeEach((done) => {
      const appsPkgBase = path.join(__dirname, '../../example-apps');
      master = new Master(newCfg);
      master.run((err) => {
        common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
          .expect(200)
          .end(done);
      });
    });
    afterEach((done) => {
      fs.sync().rm(newCfg.appsSessionPath);
      common.stopApp(agent, ips, 'simple-app')
        .end(() => {
          common.deleteApp(agent, ips, 'simple-app')
            .end(() => {
              master.exit(done);
            });
        });
    }); 
    it('should work fine when apps ok', (done) => {
      let appsRoot = newCfg.appsRoot;
      master.exit((err) => {
        should.not.exists(err);
        master = new Master(newCfg);
        master.run((err) => {
          should.not.exists(err);
          master.getChild('simple-app').getPid()[0].should.above(0);
          done();
        });
      });
    });
    it('should work fine when app dir is missing', (done) => {
      let appsRoot = newCfg.appsRoot;
      master.exit((err) => {
        should.not.exists(err);
        fs.sync().rm(path.join(appsRoot, 'simple-app'));
        master = new Master(newCfg);
        master.run((err) => {
          should.not.exists(err);
          master.getChild('simple-app').getPid()[0].should.above(0);
          done();
        });
      });
    });
    it('should error when app.tgz is missing', (done) => {
      let appsRoot = newCfg.appsRoot;
      master.exit((err) => {
        should.not.exists(err);
        fs.sync().rm(path.join(appsRoot, 'simple-app.tgz'));
        master = new Master(newCfg);
        master.run((err) => {
          err.message.should.match(/app simple-app not exists/);
          fs.sync().rm(path.join(appsRoot, 'simple-app'));
          done();
        });
      });
    });
  });
});
