const common = require('../../common.js');
const config = require('../../../config');
const mm = require('mm');
const fs = require('fs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api_config.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  it('should get server common config', (done) => {
    common.getServerConfig(agent, ips, 'common')
      .expect(200)
      .expect((res) => {
        let data = res.body.data;
        data.success[0].data.should.eql({});
      })
      .end(done);
  });
  it('should set server common config', (done) => {
    common.setServerConfig(agent, ips, 'common', {test: 'hello'})
      .expect(200)
      .end(() => {
        common.getServerConfig(agent, ips, 'common')
          .expect(200)
          .expect((res) => {
            let data = res.body.data;
            data.success[0].data.should.eql({test: 'hello'});
          })
          .end(done);
      });
  });

  it('should get server config', (done) => {
    common.getServerConfig(agent, ips, 'server')
      .expect(200)
      .expect((res) => {
        let data = res.body.data;
        data.success[0].data.should.eql({});
      })
      .end(done);
  });
  it('should set server config', (done) => {
    common.setServerConfig(agent, ips, 'server', {test: 'server'})
      .expect(200)
      .end(() => {
        common.getServerConfig(agent, ips, 'server')
          .expect(200)
          .expect((res) => {
            let data = res.body.data;
            data.success[0].data.should.eql({test: 'server'});
          })
          .end(done);
      });
  });

  it('should get app config', (done) => {
    common.getAppConfig(agent, ips, 'test')
      .expect(200)
      .expect((res) => {
        let data = res.body.data;
        data.success[0].data.should.eql({});
      })
      .end(done);
  });
  it('should set app config', (done) => {
    common.setAppConfig(agent, ips, 'test', {test: 'test'})
      .expect(200)
      .end(() => {
        common.getAppConfig(agent, ips, 'test')
          .expect(200)
          .expect((res) => {
            let data = res.body.data;
            data.success[0].data.should.eql({test: 'test'});
          })
          .end(done);
      });
  });

  it.skip('should affect server when server config changed', () => {

  });

  it('should affect app when common config changed and app reloaded', (done) => {
    common.publishApp(agent, ips, path.join(appsPkgBase, 'reload-app_1.0.0_1.tgz'))
      .expect(200)
      .end((e) => {
        let d = new Date().getTime();
        common.setServerConfig(agent, ips, 'common', {testCommon: d})
          .end((e) => {
            common.reloadApp(agent, ips, 'reload-app_1.0.0_1')
              .end((e) => {
                setTimeout(() => {
                  let ag1 = supertest('http://localhost:6001/reload-app');
                  ag1.get('/')
                    .expect((res)=> {
                      res.body.testCommon.should.eql(d);
                    })
                    .end(done);
                  }, 500);
              });
          });
      });
  });

  it('should affect app when config changed and app reloaded', (done) => {
    common.publishApp(agent, ips, path.join(appsPkgBase, 'reload-app_1.0.0_1.tgz'))
      .expect(200)
      .end(() => {
        let d = new Date().getTime();
        common.setAppConfig(agent, ips, 'reload-app', {test: d})
          .end(() => {
            common.reloadApp(agent, ips, 'reload-app_1.0.0_1')
              .end(() => {
                setTimeout(() => {
                  let ag1 = supertest('http://localhost:6001/reload-app');
                  ag1.get('/')
                    .expect((res)=> {
                      res.body.test.should.eql(d);
                    })
                    .end(done);
                  }, 500);
              });
          });
      });
  });

});