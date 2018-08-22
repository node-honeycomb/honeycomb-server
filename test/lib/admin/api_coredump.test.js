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

describe('api_coredump.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  it('should list coredump', (done) => {
    // mock file
    fs.sync().save(path.join(__dirname, '../../../core.123'));
    common.checkCoreDump(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.error.length.should.eql(0);
        res.body.data.success[0].data.should.eql(['core.123']);
        fs.sync().rm(path.join(__dirname, '../../../core.123'));
      })
      .end(done);
  });
  it('should delete coredump', (done) => {
    fs.sync().save(path.join(__dirname, '../../../core.123'));
    common.deleteCoreDump(agent, ips, {files: 'core.123'})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.length.should.eql(1);
        res.body.data.error.length.should.eql(0);
      })
      .end(done);
  });
  it('should delete coredump success when core file not exist', (done) => {
    common.deleteCoreDump(agent, ips, {files: 'core.123'})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.length.should.eql(1);
        res.body.data.error.length.should.eql(0);
      })
      .end(done);
  });
  it('should return error when query.files miss', (done) => {
    common.deleteCoreDump(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/param missing/);
      })
      .end(done);
  });

  it('should return error when query.files illegal', (done) => {
    common.deleteCoreDump(agent, ips, {files: 'core1.abc'})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/illegal core dump file/);
      })
      .end(done);
  });
});