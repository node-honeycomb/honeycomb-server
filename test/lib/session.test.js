'use strict';

const should = require('should');
const TestMod = require('../../lib/session');
const fs = require('fs');
const path = require('path');

describe('lib/session.js', function () {
  let f = path.join(__dirname, 'tmp_mount.yaml');
  let apps;
  let test = new TestMod({file: f});
  after(function () {
    console.log('>>>> test');
    try{
      fs.unlinkSync(f);
    } catch (e) {
      // do nothing
    }
  });
  it('should work fine when file not exist', function () {
    console.log('>>>> session test case 01');
    apps = test.apps();
    apps.should.be.empty();
  });
  it('should ok when call set()', function () {
    console.log('>>>> session test case 02');
    test.set('test', {dir: 'xxxx'});
    apps = test.apps();
    apps.should.eql({test: {dir: 'xxxx'}});
  });
  it('should ok when call get()', function () {
    test.get('test').should.eql({dir: 'xxxx'});
  });
  it('should ok when call remove()', function () {
    test.remove('test');
    should.not.exists(test.get('test'));
  });
});
