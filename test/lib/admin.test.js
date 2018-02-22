'use strict';

const path = require('path');
const fs = require('xfs');
const should = require('should'); // eslint-disable-line no-unused-vars
const supertest = require('supertest');
const utils = require('../../common/utils');
const common = require('../common');

describe('lib/admin.js', function () {
  let config = require('../../config');
  let ips = '127.0.0.1';
  let agent = supertest(`http://localhost:${config.admin.port}`);

  describe('test simple app publish', () => {
    let request = supertest('http://localhost:9999');
    it('should open a upload page', (done) => {
      request.get('/')
        .expect(200)
        .expect(/PUBLISH APP/)
        .end(done);
    });
    it('should upload app faild when pwd miss', (done) => {
      request.post('/api/defaultPublish')
        .field('username', 'honeycomb')
        .field('ipList', '127.0.0.1')
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app.tgz'))
        .expect(403)
        .end(done);
    });
    it('should upload app faild when user miss', (done) => {
      request.post('/api/defaultPublish')
        .field('ipList', '127.0.0.1')
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app.tgz'))
        .expect(403)
        .end(done);
    });
    it('should upload app faild when pwd miss', (done) => {
      request.post('/api/defaultPublish')
        .field('username', 'honeycomb')
        .field('ipList', '127.0.0.1')
        .expect(403)
        .end(done);
    });
    it('should upload app failed when pwd wrong', (done) => {
      request.post('/api/defaultPublish')
        .field('username', 'honeycomb')
        .field('password', 'honeycomb1')
        .field('ipList', '127.0.0.1')
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app.tgz'))
        .expect(403)
        .end(done)
    });
    it('should upload app successfully', (done) => {
      request.post('/api/defaultPublish')
        .field('username', 'honeycomb')
        .field('password', 'honeycomb123')
        .field('ipList', '127.0.0.1')
        .attach('pkg', path.join(__dirname, '../../example-apps/simple-app.tgz'))
        .expect(200)
        .expect((res) => {
          res.text.should.match(/publish success/);
        })
        .end(done);
    });
    after((done) => {
      common.deleteApp(agent, ips, 'simple-app')
        .expect(200)
        .end(done);
    });
  });
});
