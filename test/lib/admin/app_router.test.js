const common = require('../../common.js');
const config = require('../../../config');
const mm = require('mm');
const async = require('async');
const fs = require('fs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('app_router.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(function () {
    mm.restore();
  });

  describe('http router', () => {
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'simple-app').end(done),
        (done) => common.deleteApp(agent, ips, 'websocket-app').end(done),
        (done) => common.deleteApp(agent, ips, 'https-app').end(done)
      ], done);
    });
    it('should work fine when normal http app', (done) => {
      let request2 = supertest('http://localhost:8080');
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .expect(200)
        .end(() => {
          setTimeout(function() {
            request2.get('/simple-app/hello')
              .expect(200)
              .expect((res) => {
                res.body.action.should.eql('broadcast_test');
              })
              .end(done);
            }, 500);
        });
    });
    it('should work fine when websocket app', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'websocket-app.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(function() {
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:8080/socket');
            ws.on('open', function open() {
              ws.send('websocket-test');
            });
            ws.on('message', function incoming(data) {
              data.toString().should.match(/websocket\-test/);
              done();
            });
          }, 1000);
        });
    });
    it('should work fine when https app', (done) => {
      let request2 = supertest('https://localhost:8999');
      common.publishApp(agent, ips, path.join(appsPkgBase, 'https-app.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          request2.get('/example')
            .expect(200)
            .expect((res) => {
              res.text.should.match(/https#\d+/);
            })
            .end(done);
        });
    });
  });

  describe('socket router', () => {
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'socket-app').end(done)
      ], done);
    });
    it('should work fine when socket app', (done) => {
      let request2 = supertest('http://localhost:6000');
      common.publishApp(agent, ips, path.join(appsPkgBase, 'socket-app.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let net = require('net');
          let client = net.connect(6000, 'localhost');
          client.on('error', done);
          client.on('data', function (chunk) {
            chunk.toString().should.match(/socket\-test/);
            done();
          });
          client.write('socket-test');
        });
    });
  });

  describe('http multi version switch', () => {
    let request2 = supertest('http://localhost:6001');
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'simple-app_1.0.0_1').end(done),
        (done) => common.deleteApp(agent, ips, 'simple-app_1.1.0_1').end(done)
      ], done);
    });
    it('should router to simple-app_1.0.0_1 successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app_1.0.0_1.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(function() {
            request2.get('/example/hello')
              .expect(200)
              .expect('simple-app_v1.0.0_1')
              .end(done);
          }, 500);
        });
    });
    it('should router to simple-app_1.1.0_1 successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app_1.1.0_1.tgz'))
        .expect(200)
        .end((err) => {
          should(err).eql(null);
          setTimeout(function() {
            request2.get('/example/hello')
              .expect(200)
              .expect('simple-app_v1.1.0_1')
              .end(done);
          }, 500);
        });
    })
    it('should switch to simple-app_1.0.0_1 when stop 1.1.0_1', (done) => {
      common.stopApp(agent, ips, 'simple-app_1.1.0_1')
        .expect(200)
        .end((err) => {
          should(err).eql(null);
          setTimeout(function() {
            request2.get('/example/hello')
              .expect(200)
              .expect('simple-app_v1.0.0_1')
              .end(done);
          }, 500);
        });
    });
  });

  describe('socket multi version switch', () => {
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'socket-app_1.0.0_1').end(done),
        (done) => common.deleteApp(agent, ips, 'socket-app_1.0.0_2').end(done)
      ], done);
    });
    it('should router to socket-app_1.0.0_1', (done) => {
      let request2 = supertest('http://localhost:6000');
      common.publishApp(agent, ips, path.join(appsPkgBase, 'socket-app_1.0.0_1.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let net = require('net');
          setTimeout(function() {
            let client = net.connect(6000, 'localhost');
            client.on('error', done);
            client.on('data', function (chunk) {
              chunk.toString().should.eql('socket-app_1.0.0_1');
              client.end(done)
            });
          }, 500);
        });
    });
    it('should router to socket-app_1.0.0_2', (done) => {
      let request2 = supertest('http://localhost:6000');
      common.publishApp(agent, ips, path.join(appsPkgBase, 'socket-app_1.0.0_2.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let net = require('net');
          setTimeout(function() {
            let client = net.connect(6000, 'localhost');
            client.on('error', done);
            client.on('data', function (chunk) {
              chunk.toString().should.eql('socket-app_1.0.0_2');
              client.end(done)
            });
          }, 500);
        });
    });
    it('should router to socket-app_1.0.0_1 when newer app stoped', (done) => {
      let request2 = supertest('http://localhost:6000');
      common.stopApp(agent, ips, 'socket-app_1.0.0_2')
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let net = require('net');
          setTimeout(function() {
            let client = net.connect(6000, 'localhost');
            client.on('error', done);
            client.on('data', function (chunk) {
              chunk.toString().should.eql('socket-app_1.0.0_1');
              client.end(done)
            });
          }, 500);
        });
    });
    it('should router to socket-app_1.0.0_2 when newer app started', (done) => {
      let request2 = supertest('http://localhost:6000');
      common.startApp(agent, ips, 'socket-app_1.0.0_2')
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let net = require('net');
          setTimeout(function() {
            let client = net.connect(6000, 'localhost');
            client.on('error', done);
            client.on('data', function (chunk) {
              chunk.toString().should.eql('socket-app_1.0.0_2');
              client.end(done)
            });
          }, 500);
        });
    });
  });

  describe('server default port', () => {
    before((done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app_1.0.0_1.tgz'))
        .expect(200)
        .end((err) => {
          should(err).eql(null);
          setTimeout(done, 500);
        });
    });
    after((done) => {
      common.deleteApp(agent, ips, 'simple-app_1.0.0_1').end(done);
    });
    it('should get 404 when request match none app', (done) => {
      let request = supertest('http://127.0.0.1:6001');
      request.get('/non-app/404')
        .expect(404)
        .end(done);
    });
    it('should get 200 when request healthCheck', (done) => {
      let request = supertest('http://127.0.0.1:8080');
      request.get('/status')
        .expect(200)
        .end(done);
    });
    it('should get 400 when bad request healthCheck', (done) => {
      let net = require('net');
      let c = net.connect({port: 6001});
      c.once('data', (chunk) => {
        chunk.toString().should.match(/HTTP\/1\.1 400 Bad Request/);
        done();
      });
      c.on('connect', () => {
        c.write('GET /status s\r\n\r\n');
      });
    });
  });
});