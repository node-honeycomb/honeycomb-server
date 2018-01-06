'use strict';

const mm = require('mm');
const fs = require('fs');
const path = require('path');
const should = require('should');
const ip = require('ip').address();
const supertest = require('supertest');
const utils = require('../../common/utils');
const TestMod = require('../../lib/master');
const message = require('../../lib/message');

describe('lib/master.js', function () {
  let master;
  let config = require('../../config');
  let date = new Date().toGMTString();
  before(function (done) {
    config = require('../../config');
    master = new TestMod(config);
    master.run(done);
  });

  after(function () {
    mm.restore();
    master.exit();
  });

  describe('test $mount()', function () {
    it('should work fine when appId not exists', function (done) {
      master.$mount(null, {dir: 'test'}, function (err) {
        err.message.should.match(/Error/);
        master.$mount('test', {}, function (err) {
          err.message.should.match(/Error/);
          done();
        });
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

  describe('test $list', function () {
    it('should work fine', function (done) {
      master.$list(function (err, apps) {
        should.not.exists(err);
        apps.should.be.an.Object();
        done();
      });
    });
  });

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
      master.emit('app_exit', {options: {appId: 1}});
    });
    it('should work fine when emit app_retry', function () {
      master.emit('app_retry', {options: {appId: 1}});
    });
    it('should work fine when emit app_giveup', function () {
      master.emit('app_giveup', {options: {appId: 1}});
    });
    it('should work fine when emit app_error', function () {
      master.emit('app_error', {options: {appId: 1}}, {});
    });
  });

  describe('test _fork', function () {
    it('should return if already exists app', function (done) {
      master.children['xx-xx'] = {status: 'online'};
      master._fork('xx-xx', {}, function (err) {
        err.message.should.match(/already exists/);
        delete master.children['xx-xx'];
        done();
      });
    });
    it('should return if no-exists app', function (done) {
      master._fork('unexists-dir', {file: 'null'}, function (err) {
        err.message.should.match(/not found/);
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
  /*
  describe.skip('test shutdown', function () {
    afterEach(function () {
      mm.restore();
    });
    it('should exit with signal SIGINT', function (done) {
      mm(master, 'exit', function () {
        done();
      });
      process.emit('SIGINT');
    });
    it('should exit with signal SIGTERM', function (done) {
      mm(master, 'exit', function () {
        done();
      });
      process.emit('SIGTERM');
    });
    it('should exit with signal SIGHUB', function (done) {
      mm(master, 'exit', function () {
        done();
      });
      process.emit('SIGHUB');
    });
    it('should exit with uncaughtException', function (done) {
      mm(master, 'exit', function () {
        done();
      });
      process.emit('uncaughtException', new Error('mock_error'));
    });
  });
  */

  describe('test admin worker', function () {
    let request = supertest(`http://localhost:${config.admin.port}`);
    let appId = 'simple-app';

    it('should upload and publish simple-app.tgz success', function (done) {
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
    it('should get response from simple-app', (done) => {
      let request = supertest(`http://localhost:8080`);
      let date = new Date().toGMTString();
      request.get('/simple-app/abc')
        .expect(200)
        .expect((res) => {
          res.body.code.should.eql('SUCCESS');
          res.body.action.should.eql('broadcast_test');
          Object.keys(res.body.data).forEach((key) => {
            key.should.eql(res.body.data[key] + '');
          });
        }).end(done);
    });

    it('should get 404 when request match none app', (done) => {
      let request = supertest(`http://localhost:8080`);
      let date = new Date().toGMTString();
      request.get('/non-app/')
        .expect(404)
        .end(done);
    });
    it('should get 200 when request healthCheck', (done) => {
      let request = supertest(`http://localhost:8080`);
      let date = new Date().toGMTString();
      request.get('/status')
        .expect(200)
        .end(done);
    });


    it('should get app list failed, when not pass ips', function (done) {
      let url = '/api/apps';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.message.should.match(/param missing: ips/);
        })
        .end(done);
    });

    it('should get app list success', function (done) {
      let url = '/api/apps?ips=127.0.0.1';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success.should.matchAny(function (value) { value.ip.should.be.eql('127.0.0.1'); });
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });

    it('should stop app successfully', function (done) {
      let child = master.getChild(appId);
      let date = new Date().toGMTString();
      should.exists(child);
      let url = `/api/stop/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          child = master.getChild(appId);
          child.status.should.eql('offline');
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });

    it('should start app successfully', function (done) {
      let child = master.getChild(appId);
      let date = new Date().toGMTString();
      let url = `/api/start/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          res.body.data.error.length.should.eql(0);
          child = master.getChild(appId);
          should.exists(child);
          child.status.should.eql('online');
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });

    it('should restart app successfully', function (done) {
      let child = master.getChild(appId);
      let date = new Date().toGMTString();
      let originPid = child.getPid();
      let url = `/api/restart/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild(appId);
          let pid = child.getPid();
          pid.should.not.eql(originPid);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });
    it('should reload app successfully', function (done) {
      let child = master.getChild(appId);
      let originPid = child.getPid();
      let date = new Date().toGMTString();
      let url = `/api/reload/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild(appId);
          let pid = child.getPid();
          pid.should.not.eql(originPid);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });

    it('should delete app successfully', function (done) {
      let url = `/api/delete/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let date = new Date().toGMTString();
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild(appId);
          should.not.exists(child);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });
  });

  describe('test proxy version select', function () {
    let request = supertest(`http://localhost:${config.admin.port}`);
    let request2 = supertest('http://localhost:6001');
    // first publish v1.0.0_1
    it('should upload and publish simple-app_1.0.0_1.tgz success', function (done) {
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app_1.0.0_1.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(function () {
          request2.get('/example/hello')
            .expect(200)
            .expect('simple-app_v1.0.0_1')
            .end(done);
        });
    });
    // then publish v1.1.0_1
    it('should upload and publish simple-app_1.1.0_1.tgz success, and router to v1.1.0_1', function (done) {
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app_1.1.0_1.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(function () {
          request2.get('/example/hello')
            .expect(200)
            .expect('simple-app_v1.1.0_1')
            .end(done);
        });
    });
    // then restart v1.0.0_1
    it('should remain router to v1.1.0_1', function (done) {
      let appId = 'simple-app_1.0.0_1';
      let child = master.getChild(appId);
      let date = new Date().toGMTString();
      let originPid = child.getPid();
      let url = `/api/restart/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild(appId);
          let pid = child.getPid();
          pid.should.not.eql(originPid);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(function () {
          request2.get('/example/hello')
            .expect(200)
            .expect('simple-app_v1.1.0_1')
            .end(done);
        });
    });

    // then stop v1.1.0_1
    it('should router to v1.0.0_1 when stop v1.1.0_1', function (done) {
      let appId = 'simple-app_1.1.0_1';
      let url = `/api/stop/${appId}?ips=127.0.0.1`;
      let date = new Date().toGMTString();
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .end(function () {
          request2.get('/example/hello')
            .expect(200)
            .expect('simple-app_v1.0.0_1')
            .end(done);
        });
    });
  });

  describe('test socket servers', () => {
    let net = require('net');
    let request = supertest(`http://localhost:${config.admin.port}`);
    // first publish v1.0.0_1
    it('should upload and publish socket-app_1.0.0_1.tgz success', function (done) {
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/socket-app_1.0.0_1.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(function () {
          let client = net.connect(6000, 'localhost');
          client.on('error', done);
          client.on('data', function (chunk) {
            chunk.toString().should.eql('socket-app_1.0.0_1');
            done();
          });
        });
    });
    // then publish v1.1.0_1
    it('should upload and publish socket-app_1.0.0_2.tgz success, and router to v1.0.0_2', function (done) {
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/socket-app_1.0.0_2.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(function () {
          let client = net.connect(6000, 'localhost');
          client.on('error', done);
          client.on('data', function (chunk) {
            chunk.toString().should.eql('socket-app_1.0.0_2');
            done();
          });
        });
    });
    // then restart v1.0.0_1
    it('should remain router to v1.0.0_2 when restart v1.0.0_2', function (done) {
      let appId = 'socket-app_1.0.0_2';
      let date = new Date().toGMTString();
      let child = master.getChild(appId);
      let originPid = child.getPid();
      let url = `/api/restart/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild(appId);
          let pid = child.getPid();
          pid.should.not.eql(originPid);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(function () {
          let client = net.connect(6000, 'localhost');
          client.on('error', done);
          client.on('data', function (chunk) {
            chunk.toString().should.eql('socket-app_1.0.0_2');
            done();
          });
        });
    });

    // then stop v1.1.0_1
    it('should router to v1.0.0_1 when stop v1.1.0_1', function (done) {
      let appId = 'socket-app_1.0.0_2';
      let url = `/api/stop/${appId}?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let date = new Date().toGMTString();
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .end(function () {
          let client = net.connect(6000, 'localhost');
          client.on('error', done);
          client.on('data', function (chunk) {
            chunk.toString().should.eql('socket-app_1.0.0_1');
            done();
          });
        });
    });
  });

  describe('test old framework support', function () {
    it('should publish old-app.tgz success', function (done) {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('appPkg', path.join(__dirname, '../../example-apps/old-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
    it('old app should work fine', function (done) {
      let request = supertest('http://localhost:10001');
      request.get('/old-app/name')
        .expect(200)
        .expect('hello')
        .end(done);
    });
  });

  describe('test publish but no start', () => {
    it('should publish app but no start successfully', (done) => {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = '/api/publish?ips=' + ip + '&nostart=true';
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('appPkg', path.join(__dirname, '../../example-apps/https-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          let child = master.getChild('https-app');
          should.not.exists(child);
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
    after((done) => {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = `/api/delete/https-app?ips=127.0.0.1`;
      let contentType = 'application/json';
      let contentMd5 = utils.md5base64('');
      let date = new Date().toGMTString();
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect(function (res) {
          let child = master.getChild('https-app');
          should.not.exists(child);
          res.body.should.have.properties({code: 'SUCCESS'});
        }).end(done);
    });
  });

  describe('test https apps', () => {
    it('should publish https-app successfully', (done) => {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('appPkg', path.join(__dirname, '../../example-apps/https-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .set('date', date)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
    it('https app should work fine', function (done) {
      let request = supertest('https://localhost:8999');
      request.get('/example/')
        .expect(200)
        .expect(/hello#\d+/)
        .end(done);
    });
  });

  describe('test websocket', () => {
    it('should publish websocket-app successfully', (done) => {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('appPkg', path.join(__dirname, '../../example-apps/websocket-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .set('date', date)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });

    it('should connect websocket app successfully', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://localhost:8080/socket/');
      ws.on('open', function open() {
        ws.send('something');
      });
      ws.on('message', function incoming(data) {
        data.match(/something/);
        done();
      });
    });
  });

  describe('test no target app', () => {
    it('should publish websocket-app successfully', (done) => {
      let request = supertest(`http://localhost:${config.admin.port}`);
      let url = '/api/publish?ips=' + ip;
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('appPkg', path.join(__dirname, '../../example-apps/notarget-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.have.properties({code: 'SUCCESS'});
          res.body.data.should.have.properties('success');
          res.body.data.success[0].should.have.properties('ip');
          res.body.data.error.should.be.an.Array();
          let child = master.getChild('notarget-app');
          Object.keys(child.workers).should.above(0);
        })
        .end(done);
    });
  });

  describe('test app with broken api(will cause app exit)', () => {

  });
});
