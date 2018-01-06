'use strict';

const should = require('should');
const TestMod = require('../../lib/proxy');
const mm = require('mm');
const supertest = require('supertest');


/*
describe.skip('lib/proxy.js', function () {
  let proxy;
  let request;
  before(function (done) {
    let cfg = {
      port: 11111,
      prepare: function (req, res, next) {
        let url = req.url;
        let index = url.indexOf('?');
        let p = url.substr(0, index === -1 ? undefined : index);
        if (p === '/test.node') {
          return res.end('success');
        } else if (p === '/status.taobao') {
          return res.end('success');
        }
        next();
      }
    };
    proxy = new TestMod(cfg);
    request = supertest('http://localhost:11111');
    proxy.run(function (err, data) {
      data.ip.should.eql('0.0.0.0');
      data.port.should.eql(11111);
      done();
    });
  });


  afterEach(function () {
    mm.restore();
  });


  describe('test status api', function () {
    it('should return this file content', function (done) {
      request.get('/status.taobao')
        .expect(200)
        .expect(function (res) {
          res.text.should.match(/success/);
        })
        .end(done);
    });
    it('should return success on /test.node', function (done) {
      request.get('/test.node')
        .expect(200)
        .expect('success')
        .end(done);
    });
  });
  describe('$bindProxy()', function () {
    it('should fine while bind with empty {}', function () {
      proxy.httpProxys['0.0.0.0:11111'].apps.length.should.eql(0);
      proxy.$bindProxy({
        appId: 'test',
        target: 'abc.sock'
        // bind {String|Number|Array}
        // serverName {String|Array}
        // router {String} 匹配前缀
        // target {String} 目标url 或者是
      });
      proxy.httpProxys['0.0.0.0:11111'].apps.length.should.eql(1);
      proxy.httpProxys['0.0.0.0:11111'].apps[0].appId.should.eql('test');
    });

    it('should fine while bind with {bind:number}', function () {
      let obj = {
        appId: 'test01',
        bind: 11112,
        target: 'abc.sock'
        // serverName {String|Array}
        // router {String} 匹配前缀
        // target {String} 目标url 或者是
      };
      proxy.$bindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(1);
      proxy.httpProxys['0.0.0.0:11112'].apps[0].appId.should.eql('test01');
      proxy.$unbindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(0);
    });
    it('should fine while bind with {bind:string}', function () {
      let obj = {
        appId: 'test01',
        bind: '11112',
        target: 'abc.sock'
        // serverName {String|Array}
        // router {String} 匹配前缀
        // target {String} 目标url 或者是
      };
      proxy.$bindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(1);
      proxy.httpProxys['0.0.0.0:11112'].apps[0].appId.should.eql('test01');
      proxy.$unbindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(0);
    });
    it('should fine while bind with {bind:array}', function () {
      let obj = {
        appId: 'test01',
        bind: ['11112', '0.0.0.0:11112', '123:11113', '*:11114'],
        serverName: ['a', 'b'],
        router: '/abc',
        target: 'abc.sock'
        // router {String} 匹配前缀
        // target {String} 目标url 或者是
      };
      proxy.$bindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(1);
      should.not.exists(proxy.httpProxys['0.0.0.0:11113']);
      proxy.httpProxys['0.0.0.0:11114'].apps.length.should.eql(1);
      proxy.httpProxys['0.0.0.0:11114'].apps[0].match.router.should.eql('/abc/');
      proxy.httpProxys['0.0.0.0:11114'].apps[0].match.serverName.should.eql(['a', 'b']);
      should.not.exists(proxy.httpProxys['0.0.0.0:11113']);
      proxy.httpProxys['0.0.0.0:11112'].apps[0].appId.should.eql('test01');
      proxy.$unbindProxy(obj);
      proxy.httpProxys['0.0.0.0:11112'].apps.length.should.eql(0);
    });
    // it('should not bind while bind with {bind: object}', function () {
    //   let obj = {
    //     appId: 'test01',
    //     bind: {},
    //     serverName: 'abc.com',
    //     router: '/test/', // 匹配前缀
    //     target: 'http://test.com/abc' // 目标url 或者是
    //   };
    //   proxy.proxys['0.0.0.0:11111'].apps.length.should.eql(1);
    //   proxy.$bindProxy(obj);
    //   proxy.proxys['0.0.0.0:11111'].apps.length.should.eql(1);
    //   proxy.$unbindProxy(obj);
    //   proxy.proxys['0.0.0.0:11112'].apps.length.should.eql(0);
    // });
  });
  describe('test proxy sortRouter', function () {
    it('should sort will', function () {
      let map = {
        'www.taobao.com': [
          {appId: 'simple-app'},
          {appId: 'a'},
          {appId: 'simple-app_1.2.3_1'},
          {appId: 'test_app_1.10.3_2'}
        ]
      };
      let proxyServer = proxy.httpProxys['0.0.0.0:11111'];
      proxyServer.sortRouter(map);
      map.should.eql({
        'www.taobao.com': [
          {appId: 'test_app_1.10.3_2'},
          {appId: 'simple-app_1.2.3_1'},
          {appId: 'simple-app'},
          {appId: 'a'}
        ]
      });
    });
  });

  describe('test query proxy', function () {
    it('should work fine', function (done) {
      let http = require('http');
      let obj = {
        bind: '0.0.0.0:11115',
        router: '/test',
        target: '/abc.sock'
      };
      let request = supertest('http://localhost:11115');
      proxy.$bindProxy(obj);
      let originalReq = http.request;
      mm(http, 'request', function (param, callback) {
        if (!callback && param.port === '11115') {
          return originalReq.call(http, param);
        }
        callback({
          statusCode: 200,
          headers: {},
          setHeader: function () {},
          pipe: function (res) {
            res.end();
          },
          on: function () {

          }
        });
        return originalReq.call(http, {method: 'get', host: 'localhost', port: '11115'});
      });
      request.get('/test').expect(200).end(function () {
        request.get('/teste').expect(404).end(function () {
          request.get('/test/').expect(200).end(done);
        });
      });
    });
  });
});
*/