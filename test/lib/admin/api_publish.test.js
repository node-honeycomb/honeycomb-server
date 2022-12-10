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
      (done) => common.deleteApp(agent, ips, 'java-app').end(done),
      (done) => common.deleteApp(agent, ips, 'java-port-app').end(done),
      (done) => common.deleteApp(agent, ips, 'exenoent-app').end(done),
      (done) => common.deleteApp(agent, ips, 'job-app').end(done),
      (done) => common.deleteApp(agent, ips, 'job-exception-app').end(done),
      (done) => common.deleteApp(agent, ips, 'none-main-app').end(done),
      (done) => common.deleteApp(agent, ips, 'kill-old-before-mount-app_1.0.0_1').end(done),
      (done) => common.deleteApp(agent, ips, 'kill-old-before-mount-app_1.1.0_1').end(done),
    ], done);
  });
  describe('publish api', () => {
    it('should publish simple app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
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
          should(err).eql(null);
          let request2 = supertest('http://localhost:10001');
          setTimeout(() => {
            request2.get('/old-app/hello')
              .expect(200)
              .end(done);
          }, 1000);
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
    it('should publish none-main-app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'none-main-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          let master = common.getMaster();
          let child = master.getChild('none-main-app');
          Object.keys(child.workers).length.should.eql(0);
          should(err).eql(null)
          done()
          /*
          supertest("http://localhost:8080/").get('/none-main/test/hello.txt').expect((res) => {
            res.text.should.eql('hello static');
          }).end(done)
          */
        });
    });

    it('should publish kill-old-before-mount-app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'kill-old-before-mount-app_1.0.0_1.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          should(err).eql(null);
          let master = common.getMaster();
          let child = master.getChild('kill-old-before-mount-app_1.0.0_1');
          Object.keys(child.workers).length.should.eql(1);
          supertest('http://localhost:8080').get('/status').expect(200).end(function() {
            common.publishApp(agent, ips, path.join(appsPkgBase, 'kill-old-before-mount-app_1.1.0_1.tgz'))
            //.expect(200)
              .end((err) => {
                should(err).eql(null);
                let master = common.getMaster();
                let c0 = master.getChild('kill-old-before-mount-app_1.0.0_1');
                should(c0).eql(undefined);
                let c1 = master.getChild('kill-old-before-mount-app_1.1.0_1');
                Object.keys(c1.workers).length.should.eql(1)
                supertest('http://localhost:8080').get('/status').expect(200).end(done);
              });
          });
          /*
          supertest("http://localhost:8080/").get('/none-main/test/hello.txt').expect((res) => {
            res.text.should.eql('hello static');
          }).end(done)
          */
        });
    });

    it('should publish job-app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'job-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(1);
          data.error.length.should.eql(0);
        })
        .end((err) => {
          let master = common.getMaster();
          let child = master.getChild('job-app');
          Object.keys(child.workers).length.should.eql(1);
          let tt = new Date();
          let t0 = require('litelog').getTime(tt, '%Y-%m-%d');
          let logFile = path.join(master.config.logsRoot, `job-app/stdout.${t0}.log`);
          let dd = fs.readFileSync(logFile).toString();
          let lines = dd.trim().split(/\n/);
          let t1 = require('litelog').getTime(tt, '%Y%m%d-%H');
          let lastlog = lines.pop();
          // console.log('t1', lastlog.indexOf(t1))
          // console.log('serverRoot', lastlog.indexOf(master.config.serverRoot))
          lastlog.indexOf(t1).should.eql(0);
          lastlog.indexOf(master.config.serverRoot).should.above(0);
          child.status.should.eql('online');
          common.stopApp(agent, ips, 'job-app')
            .expect(200)
            .expect((res) => {
              let data = res.body.data;
              data.success.length.should.eql(1);
              data.error.length.should.eql(0);
            }).end((err) => {
              let child = common.getMaster().getChild('job-app');
              should(child).eql(undefined);
              done(err)
            })
        });
    });
    it('should publish illegal-tgz-pkg successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'illegal-tgz-pkg.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
        })
        .end((err) => {
          let master = common.getMaster();
          let child = master.getChild('illegal-tgz-pkg');
          should(child).eql(undefined);
          done(err);
        });
    });
    it('should publish job-exception-app successfully', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'job-exception-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
        })
        .end((err) => {
          let master = common.getMaster();
          let child = master.getChild('job-exception-app');
          should(child).eql(undefined);
          done(err)
        });
    });

    it.skip('should publish java app successfully', (done) => {
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
          client.on('error', done);
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
          setTimeout(() => {
            let client = require('net').connect({host: '127.0.0.1', port: 9099});
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
            client.on('error', done);
            client.write(JSON.stringify(msg));
          }, 500);
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
    it('should return error when app illegal2', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'exenoent-app.tgz'))
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.success.length.should.eql(0);
          data.error.length.should.eql(1);
          data.error[0].message.should.match(/spawn noent-exec ENOENT/);
        }).end(() => {
          let m = common.getMaster();
          let child = m.getChild('exenoent-app');
          should(child).eql(undefined);
          done();
        });
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