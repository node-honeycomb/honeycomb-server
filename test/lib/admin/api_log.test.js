const common = require('../../common.js');
const config = require('../../../config');
const log = require('../../../common/log');
const moment = require('moment');
const mm = require('mm');
const fs = require('xfs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api log test: ', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  before(() => {
    log.info('multi-line-test\nmulti-line-test2\nmulti-line-test2');
  });
  after(() => {
    mm.restore();
  });

  it('should get app usages success', function (done) {
    common.getAppUsage(agent, ips, {fileName: `app-usage.${moment().format('YYYY-MM-DD')}.log`})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
      })
      .end(done);
  });
  it('should get app usages success', function (done) {
    common.getAppUsage(agent, ips, {file: `app-usage.${moment().format('YYYY-MM-DD')}.log`})
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
      })
      .end(done);
  });
  it('should get app usages failed when file empty', function (done) {
    common.getAppUsage(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/param missing/);
      })
      .end(done);
  });

  it('should get log files success', function (done) {
    fs.sync().mkdir(path.join(__dirname, '../../../logs/abc'));
    fs.sync().mkdir(path.join(__dirname, '../../../logs/__usage__'));
    common.listLog(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
        fs.sync().rm(path.join(__dirname, '../../../logs/abc'));
      })
      .end(done);
  });

  it('should get log files success with params', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.listLog(agent, ips, {
      fileName: fileName,
      logLines: 10,
      startTime: moment().seconds(-5).format('HH:mm:ss')
    })
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.should.be.an.Array();
        res.body.data.error.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log failed without file', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.error[0].message.should.match(/param missing/);
      })
      .end(done);
  });

  it('should get log success with startTime', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      file: fileName,
      lines: 10,
      startTime: moment().seconds(-5).format('HH:mm:ss')
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success without startTime', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      file: fileName,
      lines: 10
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success with filterString', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      file: fileName,
      lines: 10,
      filter: 'multi-line-test'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success[0].should.match(/multi-line-test/);
      })
      .end(done);
  });

  it('should get log success with filterString and startTime', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    let startTime = moment().seconds(-5).format('HH:mm:ss');
    common.getLog(agent, ips, {
      file: fileName,
      lines: 10,
      filter: 'INFO',
      startTime: moment().seconds(-5).format('HH:mm:ss')
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
        res.body.data.success.forEach((line) => {
          line.should.match(/127.0.0.1/);
          line.should.match(/INFO/);
          let m = line.match(/\d{8}-(\d{2}:\d{2}:\d{2}).\d{3}/);
          (m[1] >= startTime).should.eql(true);
        });
      })
      .end(done);
  });

  it('should get log success when limit lines > 500', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      file: fileName,
      lines: 1000,
      filter: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should get log success when limit lines < 500', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      file: fileName,
      lines: 100,
      filter: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.should.be.an.Array();
      })
      .end(done);
  });

  it('should return error when fileName illegal', function (done) {
    let fileName = `../../server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 100,
      filterString: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.error[0].message.should.match(/logpath illegal/);
      })
      .end(done);
  });
  it('should return error when fileName not found', function (done) {
    let fileName = `server1.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 100,
      filterString: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.error[0].message.should.match(/log file not found/);
      })
      .end(done);
  });
  it('should return error when fileName is a dir', function (done) {
    let fileName = `abc`;
    fs.sync().mkdir(path.join(__dirname, '../../../logs/abc'));
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 100,
      filterString: 'INFO'
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.error[0].message.should.match(/log file not found/);
        fs.sync().rm(path.join(__dirname, '../../../logs/abc'));
      })
      .end(done);
  });

  it('should get default lines log when lines not a Number', function (done) {
    let fileName = `server.${moment().format('YYYY-MM-DD')}.log`;
    common.getLog(agent, ips, {
      fileName: fileName,
      logLines: 'abc',
    }).expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.code.should.eql('SUCCESS');
        res.body.data.success.length.should.above(0);
      })
      .end(done);
  });



});