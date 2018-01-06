'use strict';

const path = require('path');
const fs = require('xfs');
const should = require('should'); // eslint-disable-line no-unused-vars
const supertest = require('supertest');
const utils = require('../../common/utils');
const TestMod = require('../../lib/master');

describe('lib/admin/batch_api.js', function () {
  let master;
  let config;
  before(function (done) {
    config = require('../../config');
    master = new TestMod(config);
    master.run(done);
  });

  after(function (done) {
    master.exit(done);
  });

  describe('test config batch api', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    before(function (done) {
      fs.rm(path.join(__dirname, '../../conf/apps'), done);
    });

    /* eslint no-console: 0 */
    it('should set app config success', function (done) {
      let url = '/api/config/appTest?ips=127.0.0.1';
      let postData = {
        appTest: {
          order: 1,
          processorNum: 5
        }
      };
      let contentMd5 = utils.md5base64(JSON.stringify(postData));
      let stringToSign = `POST\nundefined\n${contentMd5}\napplication/json\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .type('json')
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .send(postData)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.success.length.should.above(0);
        })
        .end(done);
    });

    it('should get app config success', function (done) {
      let url = '/api/config/appTest?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.success.length.should.above(0);
          res.body.data.success[0].data.should.have.keys(['appTest']);
        })
        .end(done);
    });
  });

  describe('test log batch api', function () {
    let request = supertest('http://localhost:9999');
    it('should get app usages success', function (done) {
      let date = new Date().toGMTString();
      let url = '/api/appUsages?ips=127.0.0.1&fileName=app-usage.2017-01-05-19.log';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.success.should.be.an.Array();
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });

    it('should get log files success', function (done) {
      let url = '/api/logs?ips=127.0.0.1';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.success.should.be.an.Array();
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });

    it('should get log success, pass startTime', function (done) {
      let d = new Date();
      let m = d.getMonth() + 1;
      if (m < 10) {
        m = '0' + m;
      }
      let day = d.getDate();
      if (day < 10) {
        day = '0' + day;
      }
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let date = new Date().toGMTString();
      let fileName = `server.${dd}.log`;
      let url = `/api/log?fileName=${fileName}&ips=127.0.0.1&logLines=10&startTime=00:00:00`;
      let contentType = 'application/json';
      let stringToSign = `GET\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.should.be.an.Array();
        })
        .end(done);
    });

    it('should get log success, not pass startTime', function (done) {
      let d = new Date();
      let m = d.getMonth() + 1;
      if (m < 10) {
        m = '0' + m;
      }
      let day = d.getDate();
      if (day < 10) {
        day = '0' + day;
      }
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let date = new Date().toGMTString();
      let fileName = `server.${dd}.log`;
      let url = `/api/log?fileName=${fileName}&ips=127.0.0.1&logLines=10`;
      let contentType = 'application/json';
      let stringToSign = `GET\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.should.be.an.Array();
        })
        .end(done);
    });

    it('should get log success, pass filterString', function (done) {
      let d = new Date();
      let m = d.getMonth() + 1;
      if (m < 10) {
        m = '0' + m;
      }
      let day = d.getDate();
      if (day < 10) {
        day = '0' + day;
      }
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let date = new Date().toGMTString();
      let fileName = `server.${dd}.log`;
      let url = `/api/log?fileName=${fileName}&ips=127.0.0.1&logLines=10&filterString=INFO`;
      let contentType = 'application/json';
      let stringToSign = `GET\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.should.be.an.Array();
        })
        .end(done);
    });

    it('should get log success, pass logLines > 500', function (done) {
      let d = new Date();
      let m = d.getMonth() + 1;
      if (m < 10) {
        m = '0' + m;
      }
      let day = d.getDate();
      if (day < 10) {
        day = '0' + day;
      }
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let date = new Date().toGMTString();
      let fileName = `server.${dd}.log`;
      let url = `/api/log?fileName=${fileName}&ips=127.0.0.1&logLines=1000&filterString=xxxx`;
      let contentType = 'application/json';
      let stringToSign = `GET\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.should.be.an.Array();
        })
        .end(done);
    });
  });

  describe('test status batch api', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    it('should get system status success', function (done) {
      let url = '/api/status?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.success.length.should.above(0);
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
  });

  describe('test clean exit record batch api', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    it('should clean app\'s exit_record', function (done) {
      let url = '/api/clean_exit_record/__ADMIN__?ips=127.0.0.1';
      let stringToSign = `DELETE\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.delete(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.success.length.should.above(0);
          res.body.data.error.should.be.an.Array();
        })
        .end(done);
    });
  });

  describe('test server online offline', () => {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    after((done) => {
      let url = '/api/online?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          let cnt = fs.readFileSync(config.proxy.healthCheck.file);
          cnt.toString().should.eql('');
        })
        .end(done);
    });
    it('should let server offline', function (done) {
      let url = '/api/offline?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          let bool = fs.existsSync(config.proxy.healthCheck.file);
          bool.should.eql(false);
        })
        .end(done);
    });
    it('should let server online', function (done) {
      let url = '/api/online?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          let cnt = fs.readFileSync(config.proxy.healthCheck.file);
          cnt.toString().should.eql('');
        })
        .end(done);
    });
  });

  describe('coredump api', () => {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    it('should list coredump', (done) => {
      let url = '/api/coredump?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      fs.sync().save(path.join(__dirname, '../../core.123'));
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.error.length.should.eql(0);
          res.body.data.success[0].data.should.eql(['core.123']);
          fs.sync().rm(path.join(__dirname, '../../core.123'));
        })
        .end(done);
    });
    it('should delete coredump', (done) => {
      let url = '/api/coredump?ips=127.0.0.1';
      let postData = {files: ['core.123']};
      let contentMd5 = utils.md5base64(JSON.stringify(postData));
      let stringToSign = `POST\nundefined\n${contentMd5}\napplication/json\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      fs.sync().save(path.join(__dirname, '../../core.123'));
      request.post(url)
        .type('json')
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .send(postData)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
        })
        .end(done);
    });
    it('should delete coredump success when core file not found', (done) => {
      let url = '/api/coredump?ips=127.0.0.1';
      let postData = {files: ['core.123']};
      let contentMd5 = utils.md5base64(JSON.stringify(postData));
      let stringToSign = `POST\nundefined\n${contentMd5}\napplication/json\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.post(url)
        .type('json')
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .send(postData)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
        })
        .end(done);
    });
  });

  describe('test batch admin process check api', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    it('should get dead process success', function (done) {
      let url = '/api/dead_process?ips=127.0.0.1';
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
        })
        .end(done);
    });
    it('should return error when delete unknow process', function (done) {
      let appName = 'err-app-name';
      let url = `/api/dead_process/12345?ips=127.0.0.1`;
      let contentType = 'application/json';
      let stringToSign = `DELETE\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.delete(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.error[0].message.should.match(/process is not a dead one/);;
        })
        .end(done);
    });
  });

  describe('test batch admin apps api', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    it('should return apps', function (done) {
      let url = `/api/apps?ips=127.0.0.1`;
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          let keys = Object.keys(
            {
              appId: '__PROXY__',
              name: '__PROXY__',
              version: '0.0.0',
              buildNum: 0,
              workerNum: 1,
              expectWorkerNum: 1,
              status: 'online',
              errorExitCount: 0,
              errorExitRecord: [],
              service: {},
              ip: '127.0.0.1'
            }
          );
          res.body.data.success[0].apps.should.have.keys();
          res.body.code.should.eql('SUCCESS');
        })
        .end(done);
    });
  });

});
