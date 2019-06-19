const common = require('../../common.js');
const config = require('../../../config');
const async = require('async');
const mm = require('mm');
const fs = require('xfs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api_app.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  describe('list app', () => {
    it('should work fine', (done) => {
      common.listApp(agent, ips)
        .expect(200)
        .expect((res) => {
          let keys = Object.keys(
            {
              appId: '__PROXY__',
              name: '__PROXY__',
              version: '0.0.0',
              buildNum: 0,
              workerNum: 1,
              expectWorkerNum: 1,
              status: 'online',
              errorExitCount: 0,
              errorExitRecord: [],
              service: {},
              ip: '127.0.0.1'
            }
          );
          res.body.data.success[0].apps.should.have.keys();
        })
        .end(done);
    });
    it('should list app when app online', (done) => {
      async.series([
        (done) => common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz')).end(done),
        (done) => common.publishApp(agent, ips, path.join(appsPkgBase, 'https-app.tgz'), true).end(done),
        (done) => common.publishApp(agent, ips, path.join(appsPkgBase, 'notarget-app.tgz')).end(done)
      ], (err) => {
        should(err).eql(null);

        common.listApp(agent, ips)
          .expect(200)
            .expect((res) => {
              let apps = res.body.data.success[0].apps;
              let appMap = {};
              apps.forEach((v) => {
                appMap[v.appId] = v;
              });
              appMap['__PROXY__'].workerNum.should.above(0);
              appMap['__ADMIN__'].workerNum.should.above(0);
              appMap['simple-app'].workerNum.should.eql(0);
              appMap['notarget-app'].workerNum.should.eql(0);
              appMap['https-app'].workerNum.should.eql(0);
            })
            .end(() => {
              async.series([
                (done) => common.deleteApp(agent, ips, 'simple-app').end(done),
                (done) => common.deleteApp(agent, ips, 'https-app').end(done),
                (done) => common.deleteApp(agent, ips, 'notarget-app').end(done)
              ], done);
            });
      });
    });
  });

  describe('start app', () => {
    before((done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .end(done);
    });
    after((done) => {
      common.deleteApp(agent, ips, 'simple-app')
        .end(done);
    });
    it('should return error when app not exit', (done) => {
      common.startApp(agent, ips, 'no-exists-app')
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.error.length.should.eql(1);
        })
        .end(done);
    });
    it('should return error when app already started', (done) => {
      common.startApp(agent, ips, 'simple-app')
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.error[0].message.should.match(/simple-app already exists/);
        })
        .end(done);
    });
    it('should start app successfully', (done) => {
      common.stopApp(agent, ips, 'simple-app')
        .end(() => {
          common.startApp(agent, ips, 'simple-app')
            .expect(200)
            .expect((res) => {
              let data = res.body.data;
              data.error.length.should.eql(0);
              data.success.length.should.eql(1);
            })
            .end(done);
        });
    });
  });

  describe('stop app', () => {
    before((done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .end(done);
    });
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'simple-app').end(done)
      ], done);
    })
    it('should return success when app not exit', (done) => {
      common.stopApp(agent, ips, 'no-exists-app')
        .expect(200)
        .expect((res) => {
          let data = res.body.data;
          data.error.length.should.eql(0);
        })
        .end(done);
    });
    it('should stop app successfully', (done) => {
      common.stopApp(agent, ips, 'simple-app')
        .expect(200)
        .end(done);
    });
  });

  describe('delete app', () => {
    it('should return error when unmount error', (done) => {
      let master = common.getMaster();
      mm(master, '$unmount', function (appId, cb) {
        cb(new Error('mock_error'));
      });
      common.deleteApp(agent, ips, 'app-not-exist')
        .expect(200)
        .expect((res)=>{
          res.body.data.error.length.should.eql(1);
          res.body.data.error[0].message.should.eql('mock_error');
        })
        .end((err) => {
          mm.restore();
          done(err);
        });
    });
  });

  describe('reload app', () => {
    let request2 = supertest('http://localhost:8080');
    let oldWorkers;
    before((done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .end((err) => {
          let child = common.getMaster().getChild('simple-app');
          oldWorkers = Object.keys(child.workers).sort();
          done(err);
        });
    });
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'simple-app').end(done),
        (done) => common.deleteApp(agent, ips, 'illegal-app').end(done),
        (done) => common.deleteApp(agent, ips, 'exception-retry-app').end(done)
      ], done);
    });
    it('should work fine', (done) => {
      let flagBusy = false;
      let count = 0;
      function checkRes (res) {
        if (res.body.data.error.length) {
          res.text.should.match(/SERVER_BUSY/);
          flagBusy = true;
        } else {
          res.body.data.error.length.should.eql(0);
          res.body.data.success.length.should.eql(1);
        }
      }

      function allDone(err) {
        if (err) return done(err);
        count ++;
        if (count >= 2) {
          request2.get('/simple-app/hello')
            .expect(200)
            .expect((res) => {
              res.body.action.should.eql('broadcast_test');
              let child = common.getMaster().getChild('simple-app');
              let newWorkers = Object.keys(child.workers).sort();
              newWorkers.forEach((v) => {
                oldWorkers.indexOf(v).should.eql(-1);
              });
            })
            .end(done);
        }
      }
      common.reloadApp(agent, ips, 'simple-app')
        .expect(200)
        .expect(checkRes)
        .end(allDone);

      common.reloadApp(agent, ips, 'simple-app')
        .expect(checkRes).end(allDone);
    });

    it('should reload illegal-app fine', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'illegal-app.tgz'))
        .end(() => {
          common.reloadApp(agent, ips, 'illegal-app')
            .expect(200)
            .expect((res) => {
              res.body.data.error[0].message.should.match(/app reload failed/);
            })
            .end(() => {
              let fs = require('fs');
              fs.writeFileSync(
                path.join(__dirname, '../../appsRoot/illegal-app/index.js'),
                `
                class A {
                  constructor() {}
                  run(cb) {
                    cb(null, {});
                  }
                }
                module.exports = A;
                `
              );
              common.reloadApp(agent, ips, 'illegal-app')
                .expect(200)
                .expect((res) => {
                  should(res.body.data.error.length).eql(0);
                }).end(done);
            });
        });
    });

    it('should reload exception-retry-app fine', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'exception-retry-app.tgz'))
        .end(() => {
          setTimeout(() => {
            common.reloadApp(agent, ips, 'exception-retry-app')
              .expect(200)
              .expect((res) => {
                res.body.data.error[0].message.should.match(/app reload failed/);
              })
              .end(() => {
                let fs = require('fs');
                fs.writeFileSync(
                  path.join(__dirname, '../../appsRoot/exception-retry-app/index.js'),
                  `
                  class A {
                    constructor() {}
                    run(cb) {
                      cb(null, {});
                    }
                  }
                  module.exports = A;
                  `
                );
                common.reloadApp(agent, ips, 'exception-retry-app')
                  .expect(200)
                  .expect((res) => {
                    should(res.body.data.error.length).eql(0);
                  }).end(done);
              });
          }, 1000);
        });
    });

    it('should return error when reload none-exists-app', (done) => {
      common.reloadApp(agent, ips, 'none-exists-app')
        .expect(200)
        .expect((res) => {
          res.body.data.error[0].code.should.match(/APP_NOT_MOUNTED/);
        }).end(done);
    });
  });

  describe('restart app', () => {
    let request2 = supertest('http://localhost:8080');
    let oldWorkers;
    before((done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .end((err) => {
          let child = common.getMaster().getChild('simple-app');
          oldWorkers = Object.keys(child.workers).sort();
          done(err);
        });
    });
    after((done) => {
      async.series([
        (done) => common.deleteApp(agent, ips, 'simple-app').end(done)
      ], done);
    });
    it('should work fine', (done) => {
      common.restartApp(agent, ips, 'simple-app')
        .expect(200)
        .expect((res)=>{
          res.body.error.length.should.eql(0);
          res.body.success.length.should.eql(1);
        })
        .end(() => {
          request2.get('/simple-app/hello')
            .expect(200)
            .expect((res) => {
              res.body.action.should.eql('broadcast_test');
              let child = common.getMaster().getChild('simple-app');
              let newWorkers = Object.keys(child.workers).sort();
              newWorkers.forEach((v) => {
                oldWorkers.indexOf(v).should.eql(-1);
              });
            })
            .end(done);
        });
    });
    it('should return when $mount failed', (done) => {
      let master = common.getMaster();
      mm(master, '$mount', function (appId, options, cb) {
        cb(new Error('mock_error'));
      });
      common.restartApp(agent, ips, 'app-not-exist')
        .expect(200)
        .expect((res)=>{
          res.body.data.error.length.should.eql(1);
          res.body.data.error[0].code.should.eql('RESTART_APP_ERROR');
          res.body.data.error[0].message.should.eql('mock_error');
        })
        .end((err) => {
          mm.restore();
          done(err);
        });
    });
  });
});