'use strict';

const should = require('should');
const utils = require('../../common/utils');
const mm = require('mm');

/* eslint no-console: 0 */

describe('common/utils,', function () {
  describe('mkdirp()', function () {
    it('should work fine', function () {
      utils.mkdirp(__dirname);
    });
  });
  describe('md5(str)', function () {
    it('should work fine', function () {
      utils.md5('hello');
    });
    it('should throw exception when input not string', function () {
      try {
        utils.md5({});
      } catch (e) {
        e.message.should.eql('md5 only support string');
      }
    });
  });
  describe('sha256(str)', function () {
    it('should work fine', function () {
      utils.sha256('hello');
    });
    it('should throw exception when input not string', function () {
      try {
        utils.sha256({});
      } catch (e) {
        e.message.should.eql('sha256 only support string');
      }
    });
  });

  /*
  describe('getUidAndGid()', function () {
    it('should return empty obj', function () {
      let data = utils.getUidAndGid();
      data.should.be.empty();
    });

    it('should return obj', function () {
      let data = utils.getUidAndGid(true);
      data.should.have.keys('uid', 'gid');
    });
    it('should return obj when uid < 500', function () {
      mm(process, 'getuid', function () {
        return 1;
      });
      let data = utils.getUidAndGid(true);
      console.log(data);
      mm.restore();
    });
  });
  */

  describe('exec(cmd, option, cb)', function () {
    it('should work fine', function (done) {
      utils.exec('ls', function (err, data) {
        should.not.exists(err);
        data.should.be.an.Array();
        data.length.should.eql(2);
        data[0].length.should.above(0);
        done();
      });
    });
    it('should work fine with option', function (done) {
      utils.exec('ls', {timeout: 3000}, function (err, data) {
        should.not.exists(err);
        data[0].length.should.above(0);
        data[1].length.should.eql(0);
        done();
      });
    });
    it('should error when cmd not found', function (done) {
      utils.exec('no_exist_ssh_cmd', {timeout: 3000}, function (err) {
        err.message.should.match(/command not found/);
        done();
      });
    });
  });

  describe('parseAppId()', function () {
    let list = {
      'abc': {
        name: 'abc',
        version: '0.0.0',
        buildNum: '0'
      },
      'abc_1.0.0': {
        name: 'abc',
        version: '1.0.0',
        buildNum: '0'
      },
      'abc_def': {
        name: 'abc_def',
        version: '0.0.0',
        buildNum: '0'
      },
      'abc_def_1.0.0': {
        name: 'abc_def',
        version: '1.0.0',
        buildNum: '0'
      },
      'abc_def_1.0.0_1': {
        name: 'abc_def',
        version: '1.0.0',
        buildNum: '1'
      },
      'abc_def_1.0.01_1': {
        name: 'abc_def',
        version: '1.0.01',
        buildNum: '1'
      },
      'abc_def_2': {
        name: 'abc_def',
        version: '0.0.0',
        buildNum: '2'
      },
      'abc.def_2': {
        name: 'abc.def',
        version: '0.0.0',
        buildNum: '2'
      },
      'abc.def_1.0.0': {
        name: 'abc.def',
        version: '1.0.0',
        buildNum: '0'
      },
      'abc.def_1.0.0_3': {
        name: 'abc.def',
        version: '1.0.0',
        buildNum: '3'
      },
    };
    Object.keys(list).forEach(function (key) {
      let result = list[key];
      it('should work fine with ' + key, function () {
        utils.parseAppId(key).should.eql(result);
      });
    });
  });

  describe('encryptObject & decryptObject', () => {
    let pwd = 'addfsdfhwqefqwfg';
    it('should work fine with null', function () {
      let obj = utils.encryptObject(null, pwd);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql(null);
    });
    it('should work fine with null', function () {
      let obj = utils.encryptObject(undefined, pwd);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql(undefined);
    });
    it('should work fine with array', function () {
      let obj = utils.encryptObject(['abc', 'e::a'], pwd);
      obj[1].should.match(/^d::/);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql(['abc', 'a']);
    });
    it('should work fine with array[object]', function () {
      let obj = utils.encryptObject([{name: 'abc', value: 'e::a'}], pwd);
      obj[0].value.should.match(/^d::/);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql([{name: 'abc', value: 'a'}]);
    });
    it('should work fine with object', function () {
      let obj = utils.encryptObject({name: 'abc', value: 'e::a'}, pwd);
      obj.value.should.match(/^d::/);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql({name: 'abc', value: 'a'});
    });
    it('should work fine with object{object}', function () {
      let obj = utils.encryptObject({
        pwd: 'e::abcasfasdfasdfasdfsadfasdfasdf',
        raw: 'r::abc',
        raw2: 'r::e::abc',
        test: 123,
        config: {name: 'abc', value: 'e::a', list: [{name: 'e::name'}]}
      }, pwd);
      obj.pwd.should.match(/^d::/);
      obj.raw.should.eql('r::abc');
      obj.raw2.should.eql('r::e::abc');
      obj.test.should.eql(123);
      obj.config.value.should.match(/^d::/);
      obj.config.list[0].name.should.match(/^d::/);
      obj = utils.decryptObject(obj, pwd);
      should(obj).eql({
        pwd: 'abcasfasdfasdfasdfsadfasdfasdf',
        raw: 'abc',
        raw2: 'e::abc',
        test: 123,
        config: {
          name: 'abc',
          value: 'a',
          list: [{name: 'name'}]
        }
      });
    });
  });

  describe('exports.fixStringLength()', () => {
    it('should work fine', () => {
      utils.fixStringLength('abc', 5).should.eql('abc  ');
      utils.fixStringLength('abc', 5, 'left').should.eql('abc  ');
      utils.fixStringLength('abc', 5, 'right').should.eql('  abc');
      utils.fixStringLength('abcde', 5).should.eql('abcde');
      utils.fixStringLength('abcdef', 5).should.eql('abcdef');
    });
  });
});
