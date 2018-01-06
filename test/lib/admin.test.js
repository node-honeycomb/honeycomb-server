'use strict';

const path = require('path');
const fs = require('xfs');
const should = require('should'); // eslint-disable-line no-unused-vars
const supertest = require('supertest');
const utils = require('../../common/utils');
const TestMod = require('../../lib/master');

describe('lib/admin.js', function () {
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

  describe('test app init config', function () {
    let request = supertest('http://localhost:9999');
    let date = new Date().toGMTString();
    before(function (done) {
      fs.rm(path.join(__dirname, '../../conf/apps'), done);
    });
    it('should get app config success but null', function (done) {
      let url = '/api/single/config/app/appTest';
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

    // ============= batch api ===============
    /* eslint no-console: 0 */
    it('should set app config success again', function (done) {
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


    it('should get app config success with batch api', function (done) {
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

    it('should get app usages success with batch api', function (done) {
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
  });

  describe('test admin worker with single api', function () {
    let request = supertest('http://localhost:9999');
    it('should get app list successfully', function (done) {
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
    it('should faild when date in signature expire', function (done) {
      let url = '/api/single/apps';
      let date = new Date('2017/01/01').toGMTString();
      let stringToSign = `GET\nundefined\n\nundefined\n${date}\n${url}`;
      let signature = utils.sha1(stringToSign, config.admin.token);
      request.get(url)
        .set('date', date)
        .set('authorization', `honeycomb admin:${signature}`)
        .expect(401)
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
        .set('date', date)
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
          // res.body.message.should.match(/Cannot find module/);
        })
        .end(done);
    });

    it('should get success message when stop a not exist app', function (done) {
      let appName = 'err-app-name';
      let date = new Date().toGMTString();
      let url = `/api/single/stop/${appName}`;
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
      let date = new Date().toGMTString();
      let url = `/api/single/delete/${appName}`;
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

    it('should get log files success', function (done) {
      let url = '/api/single/logs';
      let date = new Date().toGMTString();
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
      let dd = `${d.getFullYear()}-${m}-${day}`;
      let date = new Date().toGMTString();
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

    it('should get log success with single api without startTime', function (done) {
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

    it('should get log success with batch api with startTime', function (done) {
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

    it('should get log success with batch api without startTime', function (done) {
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

    it('should get log success with batch api, pass filterString', function (done) {
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

    it('should get log success with batch api, pass logLines > 500', function (done) {
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
      let appName = 'simple-app';
      let date = new Date().toGMTString();
      let url = `/api/single/stop/${appName}`;
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
        .end((err) => {
          if (err) {
            return done(err);
          }
          let url = `/api/single/delete/${appName}`;
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
    });
  });
});
