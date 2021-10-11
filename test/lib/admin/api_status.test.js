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

describe('api_status.test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  after(() => {
    mm.restore();
  });
  it('should get system status success', function (done) {
    common.status(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        res.body.data.success.length.should.above(0);
        res.body.data.error.length.should.eql(0);
        res.body.data.success[0].data.should.have.properties([
          'uname',
          'hostname',
          'serverVersion',
          'kernel',
          'sysTime',
          'nodeVersion',
          'cpuNum',
          'cpu',
          'timezone',
          'memory',
          'memoryUsage',
          'diskInfo',
          'sysLoad'
        ]);
      })
      .end(done);
  });
  it('should get system status success', function (done) {
    common.ping(agent, ips)
      .expect(200)
      .expect('content-type', /application\/json/)
      .expect(function (res) {
        let data = res.body.data;
        data.success.length.should.eql(1);
        data.error.length.should.eql(0);
        data.success[0].data.should.have.properties(['serverTime', 'cluster']);
      })
      .end(done);
  });
});