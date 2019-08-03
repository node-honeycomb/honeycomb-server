const common = require('../../common.js');
const config = require('../../../config');
const async = require('async');
const mm = require('mm');
const fs = require('fs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('app_publish.test.js', () => {
  let master;
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);
  after(function (done) {
    mm.restore();
    async.series([
      (done) => common.deleteApp(agent, ips, 'simple-app').end(done),
      (done) => common.deleteApp(agent, ips, 'notarget-app').end(done),
      (done) => common.deleteApp(agent, ips, 'cant-found-module').end(done),
      (done) => common.deleteApp(agent, ips, 'old-app').end(done),
      (done) => common.deleteApp(agent, ips, 'https-app').end(done),
      (done) => common.deleteApp(agent, ips, 'illegal-app').end(done),
      (done) => common.deleteApp(agent, ips, 'noenter-app').end(done),
      (done) => common.deleteApp(agent, ips, 'norun-app').end(done),
      (done) => common.deleteApp(agent, ips, 'timeout-app').end(done),
      (done) => common.deleteApp(agent, ips, 'java-app').end(done)
    ], done);
  });
  describe('publish api', () => {
    it('should publish simple app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          console.log(JSON.stringify(data, null, 2));
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end(done);
    });
    it('should publish old app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'old-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          if (err) return done(err);
          let request2 = supertest('http://localhost:10001');
          request2.get('/old-app/hello')
            .expect(200)
            .end(done);
        });
    });
    it('should publish notarget app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'notarget-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          let child = common.getMaster().getChild('notarget-app');
          Object.keys(child.workers).length.should.eql(1);
          done(err);
        });
    });
    it('should publish java app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'java-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          if (err) return done(err);
          let child = common.getMaster().getChild('java-app');
          Object.keys(child.workers).length.should.eql(1);
          let client = require('net').connect({host: 'localhost', port: 9090});
          let msg = {test: true};
          client.on('data', (chunk) => {
            let obj = JSON.parse(chunk);
            obj.should.eql(msg);
            client.end();
            common.reloadApp(agent, ips, 'java-app')
              .expect(200)
              .expect((res) => {
                let data = res.body.data;
                data.success.length.should.eql(1);
                data.error.length.should.eql(0);
              })
              .end(done);
          });
          client.write(JSON.stringify(msg));
        });
    });
    it('should publish java port app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'java-port-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          if (err) return done(err);
          let child = common.getMaster().getChild('java-port-app');
          Object.keys(child.workers).length.should.eql(1);
          let client = require('net').connect({host: 'localhost', port: 9099});
          let msg = {test: true};
          client.on('data', (chunk) => {
            let obj = JSON.parse(chunk);
            obj.should.eql(msg);
            client.end();
            common.reloadApp(agent, ips, 'java-port-app')
              .expect(200)
              .expect((res) => {
                let data = res.body.data;
                data.success.length.should.eql(1);
                data.error.length.should.eql(0);
              })
              .end(done);
          });
          client.write(JSON.stringify(msg));
        });
    });
    it('should publish app but not started', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'https-app.tgz'), true)
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          let child = common.getMaster().getChild('https-app');
          should(child).eql(undefined);
          done(err);
        });
    });
    it('should return error when app noenter', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'noenter-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
          data.error[0].message.should.match(/enter_file_not_found/);
        })
        .end(done);
    });
    it('should return error when app norun', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'norun-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
          data.error[0].message.should.match(/unexpect_worker_exit/);
        })
        .end(done);
    });
    it('should return error when app illegal', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'illegal-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
          data.error[0].message.should.match(/unexpect_worker_exit/);
        })
        .end(done);
    });
    it('should return error when app ready timeout', (done) => {
      let date = new Date();
      common.publishApp(agent, ips, path.join(appsPkgBase, 'timeout-app.tgz'))
        .expect(200)
        .expect((res) => {
          let timeSpend = new Date().getTime() - date.getTime();
          let data = res.body.data;
          timeSpend.should.above(config.appReadyTimeout);
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
          data.error[0].message.should.match(/app_ready_timeout/);
        })
        .end(done);
    });
    it('should return error when app with syntax error', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'cant-found-module.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.error[0].message.should.match(/unexpect_worker_exit/);
        })
        .end(done);
    });
  });
});