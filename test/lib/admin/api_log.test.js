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

describe('api log test: ', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });

  it('should get app usages success', function (done) {
    common.getAppUsage(agent, ips, {fileName: 'app-usage.2017-01-05-19.log'})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log files success', function (done) {
    common.listLog(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success, pass startTime', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 10,
      startTime: '00:00:00'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success, not pass startTime', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 10
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success, pass filterString', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 10,
      filterString: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log 500 line success, pass logLines > 500', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 1000,
      filterString: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

});