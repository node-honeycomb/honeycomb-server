'use strict';

const path = require('path');
const fs = require('xfs');
const should = require('should'); // eslint-disable-line no-unused-vars
const supertest = require('supertest');
const utils = require('../../common/utils');
const TestMod = require('../../lib/master');

describe('lib/admin/single_api.js', function () {
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

  describe('test config single api', function () {
    let request = supertest('http://localhost:9999');
    before(function (done) {
      fs.rm(path.join(__dirname, '../../conf/apps'), done);
    });
    it('should get app config success but null', function (done) {
      let url = '/api/single/config/app/appTest';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.should.empty();
        })
        .end(done);
    });

    it('should set app config success', function (done) {
      let url = '/api/single/config/app/appTest';
      let postData = {
        appTest: {
          order: 1,
          processorNum: 5
        }
      };
      let date = new Date().toGMTString();
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

    it('should set app config success again', function (done) {
      let url = '/api/single/config/app/appTest';
      let postData = {
        appTest: {
          order: 1,
          processorNum: 4
        }
      };
      let date = new Date().toGMTString();
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

    it('should get app config changed', function (done) {
      let url = '/api/single/config/app/appTest';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.should.eql({
            appTest: {
              order: 1,
              processorNum: 4
            }
          });
        })
        .end(done);
    });

    it('should set server config success', function (done) {
      let url = '/api/single/config/app/config_server';
      let postData = {
        proxy: {
          processorNum: 2
        }
      };
      let date = new Date().toGMTString();
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

    it('should get server config success', function (done) {
      let url = '/api/single/config/app/config_server';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.should.eql({
            proxy: {
              processorNum: 2
            }
          });
        })
        .end(done);
    });

    it('should set app common config success', function (done) {
      let url = '/api/single/config/server/common';
      let postData = {
        systemToken: 'xxx',
      };
      let contentMd5 = utils.md5base64(JSON.stringify(postData));
      let date = new Date().toGMTString();
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

    it('should get app common config success', function (done) {
      let url = '/api/single/config/server/common';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.data.should.eql({
            systemToken: 'xxx',
          });
        })
        .end(done);
    });
  });

  describe('test admin worker with single api', function () {
    let request = supertest('http://localhost:9999');
    it('should get success message when get app list', function (done) {
      let url = '/api/single/apps';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.should.be.an.Array();
        })
        .end(done);
    });

    it('should get error message when publish illegal app pkg', function (done) {
      let url = '/api/single/publish';
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, '../../example-apps/illegal-app.tgz'));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(500)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('PUBLISH_APP_FAILED');
        })
        .end(done);
    });

    it('should get error message when publish cant-found-module app pkg', function (done) {
      let appName = 'cant-found-module';
      let url = '/api/single/publish';
      let date = new Date().toGMTString();
      let agent = request.post(url)
        .set('Date', date)
        .attach('pkg', path.join(__dirname, `../../example-apps/${appName}.tgz`));
      let formData = agent._getFormData().getHeaders({});
      let contentType = formData['content-type'];
      let contentMd5 = utils.md5base64('');
      let stringToSign = `POST\nundefined\n${contentMd5}\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      agent
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(500)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('PUBLISH_APP_FAILED');
          //res.body.message.should.match(/Cannot find module/);
        })
        .end(done);
    });

    it('should get success message when stop a not exist app', function (done) {
      let appName = 'err-app-name';
      let url = `/api/single/stop/${appName}`;
      let date = new Date().toGMTString();
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
        })
        .end(done);
    });

    it('should get success message when delete a not exist app', function (done) {
      let appName = 'err-app-name';
      let url = `/api/single/delete/${appName}`;
      let date = new Date().toGMTString();
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
        })
        .end(done);
    });

    it('should delete app cant-found-module success', function (done) {
      let appName = 'cant-found-module';
      let url = `/api/single/delete/${appName}`;
      let date = new Date().toGMTString();
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
        })
        .end(done);
    });

    it('should delete app illegal-app success', function (done) {
      let appName = 'illegal-app';
      let url = `/api/single/delete/${appName}`;
      let contentType = 'application/json';
      let date = new Date().toGMTString();
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
        })
        .end(done);
    });

    it('should get log files success', function (done) {
      let url = '/api/single/logs';
      let contentType = 'application/json';
      let date = new Date().toGMTString();
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
        })
        .end(done);
    });

    it('should get log success with single api, pass startTime', function (done) {
      let d = new Date();
      let m = d.getMonth() + 1;
      if (m < 10) {
        m = '0' + m;
      }
      let day = d.getDate();
      if (day < 10) {
        day = '0' + day;
      }
      let date = new Date().toGMTString();
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let fileName = `server.${dd}.log`;
      let url = `/api/single/log?fileName=${fileName}&ips=127.0.0.1&logLines=10&startTime=00:00:00`;
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
          res.body.data.length.should.eql(10);
        })
        .end(done);
    });

    it('should get log success with single api, not pass startTime', function (done) {
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
      let url = `/api/single/log?fileName=${fileName}&logLines=10`;
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
          res.body.data.length.should.above(0);
        })
        .end(done);
    });
  });

  describe('test admin worker status api', function () {
    let request = supertest('http://localhost:9999');
    it('should get status message success', function (done) {
      let url = '/api/single/status';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.should.have.properties([
            'uname',
            'hostname',
            'serverVersion',
            'kernel',
            'systemTime',
            'nodeVersion',
            'cpuNum',
            'cpu',
            'timezone',
            'memory'
          ]);
        })
        .end(done);
    });
  });

  describe('coredump api', () => {
    let request = supertest('http://localhost:9999');
    it('should list coredump', (done) => {
      let url = '/api/single/coredump';
      let date = new Date().toGMTString();
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
          res.body.data.should.eql(['core.123']);
          fs.sync().rm(path.join(__dirname, '../../core.123'));
        })
        .end(done);
    });

    it('should list coredump', (done) => {
      let url = '/api/single/coredump';
      let postData = {files: ['core.123']};
      let date = new Date().toGMTString();
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
  });

  describe('test admin process check api', function () {
    let request = supertest('http://localhost:9999');
    it('should get dead process success', function (done) {
      let url = '/api/single/dead_process';
      let date = new Date().toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('Date', date)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(200)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('SUCCESS');
          res.body.data.should.eql([]);
        })
        .end(done);
    });
    it('should return error when delete unknow process', function (done) {
      let url = `/api/single/dead_process/12345`;
      let contentType = 'application/json';
      let date = new Date().toGMTString();
      let stringToSign = `DELETE\nundefined\n\n${contentType}\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.delete(url)
        .set('Date', date)
        .type(contentType)
        .set('Authorization', `honeycomb admin:${signature}`)
        .expect(500)
        .expect('content-type', /application\/json/)
        .expect(function (res) {
          res.body.code.should.eql('ERROR');
          res.body.message.should.match(/process is not a dead one/);
        })
        .end(done);
    });
  });
});
