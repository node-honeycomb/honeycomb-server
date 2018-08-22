const common = require('../../common.js');
const config = require('../../../config');
const moment = require('moment');
const async = require('async');
const mm = require('mm');
const fs = require('fs');
const path = require('path');
const should = require('should');
const supertest = require('supertest');
const ip = require('ip').address();
const appsPkgBase = path.join(__dirname, '../../../example-apps');

describe('api_exitRecord_test.js', () => {
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  before((done) => {
    common.publishApp(agent, ips, path.join(appsPkgBase, 'simple-app.tgz'))
        .end(done);
  });
  after((done) => {
    mm.restore();
    async.series([
      (done) => common.deleteApp(agent, ips, 'simple-app').end(done)
    ], done);
  });

  it('should return success', function (done) {
      common.cleanAppExitRecord(agent, ips, 'simple-app')
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.length.should.above(0);
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
  });
  it('should return error when  app not exist', function (done) {
      common.cleanAppExitRecord(agent, ips, 'test')
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.error[0].message.should.match(/not found/);
        })
        .end(done);
  });
});