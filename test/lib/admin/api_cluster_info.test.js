const common = require('../../common.js');
const config = require('../../../config');
const moment = require('moment');
const mm = require('mm');
const fs = require('fs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api_cluster_info', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);
  describe('cluster info', () => {
    before(() => {
      try {
        fs.unlinkSync(path.join(config.serverRoot, './run/cluster.json'));
      } catch (e) {}
    });
    afterEach((done) => {
      try {
        fs.unlinkSync(path.join(config.serverRoot, './run/cluster.json'));
      } catch (e) {}

      common.stopApp(agent, ips, 'reload-app_1.0.0_1').end((err, data) => {
        common.deleteApp(agent, ips, 'reload-app_1.0.0_1').end(done);
      });
    });

    it('should get empty cluster info', (done) => {
      common.publishApp(agent, ips, path.join(appsPkgBase, 'reload-app_1.0.0_1.tgz'))
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          let ag1 = supertest('http://localhost:6001/reload-app');
          ag1.get('/')
            .expect((res) => {
              res.body.cluster.should.eql({}) //.test.should.eql(d);
            })
            .end(done);
        });
    });  
    it('should get cluster info', (done) => {
      let clusterInfo = {cluster:'test', serverList: ['127.0.0.1']};
      common.setClusterInfo(agent, ips, clusterInfo)
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          common.publishApp(agent, ips, path.join(appsPkgBase, 'reload-app_1.0.0_1.tgz'))
            .expect(200)
            .end((err) => {
              if (err) return done(err);
              let ag1 = supertest('http://localhost:6001/reload-app');
              ag1.get('/')
                .expect((res) => {
                  res.body.cluster.should.eql(clusterInfo) //.test.should.eql(d);
                })
                .end(done);
            });
      });
    });
  });
});

