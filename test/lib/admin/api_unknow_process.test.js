const common = require('../../common.js');
const config = require('../../../config');
const moment = require('moment');
const mm = require('mm');
const fs = require('xfs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api unknow process test: ', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  it('should list unknow process', (done) => {
    common.checkUnknowProcess(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.error.length.should.eql(0);
      })
      .end(done);
  });
  it('should return error when pid is not exist', (done) => {
    common.killUnknowProcess(agent, ips, '1000000')
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/not a unknow process/);
      })
      .end(done);
  });
  it('should return error when pid is master', (done) => {
    common.killUnknowProcess(agent, ips, process.pid)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/not a unknow process/);
      })
      .end(done);
  });
});