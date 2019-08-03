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

describe.only('api_online_offline.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after((done) => {
    mm.restore();
    common.online(agent, ips).end(done);
  });
  it('should offline server', (done) => {
    common.offline(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.length.should.above(0);
        let bool = fs.existsSync(config.proxy.healthCheck.file);
          bool.should.eql(false);
      })
      .end((err) => {
        if (err) return done(err);
        // offline again should work fine too
        common.offline(agent, ips)
          .expect(200)
          .expect(function (res) {
            res.body.data.success.length.should.above(0);
            let bool = fs.existsSync(config.proxy.healthCheck.file);
              bool.should.eql(false);
          }).end(done);
      });
  });
  it('should online server', (done) => {
    common.online(agent, ips)
      .expect(200)
      .expect((res) => {
        let cnt = fs.readFileSync(config.proxy.healthCheck.file);
          cnt.toString().should.eql('');
      })
      .end((err) => {
        if (err) return done(err);
        // online again should work fine too
        common.online(agent, ips)
          .expect(200).expect(function (res) {
            res.body.data.success.length.should.above(0);
            let cnt = fs.readFileSync(config.proxy.healthCheck.file);
              cnt.toString().should.eql('');
          }).end(done);
      });
  })
});
