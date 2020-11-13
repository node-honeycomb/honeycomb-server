const should = require('should');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Logtail = require('../../../lib/admin/log_tail');

describe('log_tail.test.js', () => {
  it('should work fine with short lines', (done) => {
    let cnt = '1\n2\n3';
    let file = path.join(os.tmpdir(), new Date().getTime() + '');
    fs.writeFileSync(file, cnt);
    let ft = new Logtail(file, {bufferLength: 1024});
    ft.tail(2, (err, data) => {
      console.log(data);
      data.length.should.eql(2);
      fs.unlinkSync(file);
      done();
    });
  });

  it('should work fine with long lines', (done) => {
    let cnt = '1\n\n1234\n3\n';
    let file = path.join(os.tmpdir(), new Date().getTime() + '');
    fs.writeFileSync(file, cnt);
    let ft = new Logtail(file, {bufferLength: 2});
    ft.tail(5, (err, data) => {
      console.log(data);
      data.length.should.eql(5);
      fs.unlinkSync(file);
      done();
    });
  });

  it('should return error with none-exist file', (done) => {
    let ft = new Logtail(path.join(__dirname, 'none-exist'), {bufferLength: 2});
    ft.tail(5, (err, data) => {
      err.code.should.eql('ENOENT');
      //data.length.should.eql(5);
      //fs.unlinkSync(file);
      done();
    });
  });
});