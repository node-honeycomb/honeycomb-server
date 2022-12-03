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

describe('api_online_offline.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  before((done) => {
    common.publishApp(agent, ips, path.join(appsPkgBase, 'kill-old-before-mount-app_1.0.0_1.tgz')).end(done);
  });
  after((done) => {
    mm.restore();
    common.online(agent, ips).end(()=>{
      common.deleteApp(agent, ips, 'kill-old-before-mount-app_1.0.0_1').end(done);
    });
  });
  it('should offline server', (done) => {
    common.offline(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.length.should.above(0);
        /*
        let bool = fs.existsSync(config.proxy.healthCheck.file);
          bool.should.eql(false);
          */
      })
      .end((err) => {
        if (err) return done(err);
        supertest('http://localhost:8080').get('/status').expect(404)
          .end(() => {
            // offline again should work fine too
            common.offline(agent, ips)
              .expect(200)
              .expect(function (res) {
                res.body.data.success.length.should.above(0);
                // let bool = fs.existsSync(config.proxy.healthCheck.file);
                //  bool.should.eql(false);
              }).end(done);
          });
      });
  });
  it('should online server', (done) => {
    common.online(agent, ips)
      .expect(200).expect((res) => {
        // let cnt = fs.readFileSync(config.proxy.healthCheck.file);
        // cnt.toString().should.eql('');
      })
      .end((err) => {
        if (err) return done(err);
        supertest('http://localhost:8080').get('/status').expect(200)
          .end((err) => {
            if (err) return done(err);
            // online again should work fine too
            common.online(agent, ips)
              .expect(200).expect(function (res) {
                res.body.data.success.length.should.above(0);
                // let cnt = fs.readFileSync(config.proxy.healthCheck.file);
                //   cnt.toString().should.eql('');
              }).end(done);
          });
      });
  })
});
