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
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });
  it('should return error when missing query.ips', function (done) {
    common.commonErrorGet(agent, '/api/status', {}, {stringToSign: ''})
      .expect(200)
      .expect((res) => {
        res.body.code.should.eql('ERROR');
        res.body.message.should.match(/param missing: ips/);
      })
      .end(done);
  });
  it('should return error when sign illegal', function (done) {
    common.commonErrorGet(agent, '/api/status?ips=' + ips, {}, {stringToSign: 'abc'})
      .expect(403)
      .end(done);
  });
  it('should return error when sign expired', function (done) {
    let date = new Date('2017/01/01');
    common.commonErrorGet(agent, '/api/status', {}, {date: date})
      .expect(403)
      .end(done);
  });

  it('should return error when params.appid illegal', function (done) {
    common.commonPost(agent, '/api/app/illegal@app/stop?ips=' + ips, {})
      .expect(500)
      .expect((res) => {
        res.body.code.should.eql('PARAM_ERROR');
      })
      .end(done);
  });
  it('should return error when params.appid illegal 2', function (done) {
    common.commonErrorGet(agent, '/api/config/app/illegal@app?ips=' + ips, {}, {})
      .expect(500)
      .expect((res) => {
        res.body.code.should.eql('PARAM_ERROR');
      })
      .end(done);
  });
});