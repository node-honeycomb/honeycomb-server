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

describe('api_check.test.js', () => {
  let ips = 'http://127.0.0.1:9999';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  it('should return error when missing query.ips', function (done) {
    common.healthCheck(agent)
      .expect(200)
      .expect((res) => {
        res.text.should.eql('ok');
      })
      .end(done);
  });

  it('should return error when missing query.ips', function (done) {
    common.status(agent, ips)
      .expect(200)
      .expect((res) => {
        res.body.data.success.length.should.above(0);
        res.body.data.error.length.should.eql(0);
      })
      .end(done);
  });
});