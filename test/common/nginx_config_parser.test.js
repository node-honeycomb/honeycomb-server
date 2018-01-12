'use strcit';

const should = require('should');
const fs = require('fs');
const path = require('path');
const TestMod = require('../../common/nginx_config_parser');

describe('nginx config parser', () => {
  let list = fs.readdirSync(path.join(__dirname, './nginx_cases'));

  describe('parse()', () => {
    list.forEach((file) => {
      if (!/\.conf$/.test(file)) {
        return;
      }
      let confFile = path.join(__dirname, '/nginx_cases/' + file);
      let confResult = path.join(__dirname, '/nginx_cases/' + file + '.json');
      it('should parse fine:' + file, () => {
        let cnt = fs.readFileSync(confFile).toString();
        let tokens = TestMod.parse(cnt, {loc: false});
      });
      it('should parse fine with loc:' + file, () => {
        let cnt = fs.readFileSync(confFile).toString();
        let tokens = TestMod.parse(cnt, {loc: true});
      });
    });

    let errors = [
      'http {',
      'test \'abc',
      'direction'
    ];
    errors.forEach((err) => {
      it('should throw error' + err, () => {
        try {
          TestMod.parse(err, {loc: false});
        } catch (e) {
          e.name.should.eql('SyntaxError');
          // console.log(e);
        }
      });
    });
  });


});