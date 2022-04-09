'use strict';

const testMod = require('../config');
const should = require('should');
const path = require('path');
const fs = require('xfs');
const root = path.join(__dirname, '../');


let info = {
  stderr: [],
  stdout: []
};

let mockConsole = {
  log: function(...args) {
    info.stdout.push(args);
  },
  error: function(...args) {
    info.stderr.push(args);
  }
}

mockConsole.reset = function() {
  info = {
    stderr: [],
    stdout: []
  };
  if (mockConsole.mocked) {
    console.log = mockConsole.originConsole.log;
    console.error = mockConsole.originConsole.error;
    mockConsole.mocked = false;
  }
};

mockConsole.mock = function () {
  if (mockConsole.mocked) {
    return;
  }
  mockConsole.mocked = true;
  mockConsole.originConsole = {
    log: console.log,
    error: console.error
  };

  console.log = mockConsole.log;
  console.error = mockConsole.error;

};

describe('test config', () => {

  after(() => {
    testMod.reload();
  });
  it('should throw error when set config.reload', function () {
    mockConsole.mock();
    try {
      testMod.reload = 1;
    } catch (e) {
      e.message.should.match(/can not set global config properties "\w+" dynamic/);
    }
    mockConsole.reset();
  });

  it('should throw error when serverRoot config.js is error', () => {
    let gCfg = '{';
    let gCfgFile = path.join(root, './conf/config.js');
    fs.writeFileSync(gCfgFile, gCfg);
    mockConsole.mock();
    testMod.reload();
    let msg = info;
    mockConsole.reset();
    msg.stderr[0].join(' ').should.match(/Loading conf\/config.js failed/);
    fs.unlinkSync(gCfgFile);
  });

  it('should throw error when serverRoot config_default.js is error', () => {
    let gCfg = '{';
    let gCfgFile = path.join(root, './conf/config_default.js');
    fs.writeFileSync(gCfgFile, gCfg);
    mockConsole.mock();
    testMod.reload();
    let msg = info;
    mockConsole.reset();
    msg.stderr[0].join(' ').should.match(/Loading conf\/config_default\.js failed/);
    fs.unlinkSync(gCfgFile);
  });

  it('should throw error when app\'s config error', () => {
    let aCfg = '{';
    let aCfgFile = path.join(root, './conf/custom/apps/test.json');
    fs.sync().mkdir(path.dirname(aCfgFile));
    fs.writeFileSync(aCfgFile, aCfg);
    mockConsole.mock();
    testMod.reload();
    let msg = info;
    mockConsole.reset();
    msg.stderr[0].join(' ').should.match(/Loading conf\/custom\/apps\/test.json failed/);
    fs.unlinkSync(aCfgFile);
  });

  it('should reload conf/custom/config.js', () => {
    let file = path.join(root, './conf/custom/config.js');
    let cnt = `
        module.exports = {
          file: __filename,
          dir: __dirname,
          exec: (str) => {
            return require('child_process').execSync('echo ' + str).toString();
          }
        }
    `;
    fs.sync().mkdir(path.dirname(file));
    fs.writeFileSync(file, cnt);
    mockConsole.mock();
    testMod.reload();
    testMod.file.should.eql(file);
    testMod.dir.should.eql(path.dirname(file));
    testMod.exec('hello').should.match(/hello/);
    fs.unlinkSync(file);
    mockConsole.reset();
  });

  it('should reload conf/custom/server.json', () => {
    let file = path.join(root, './conf/custom/config_server.json');
    let newFile = path.join(root, './conf/custom/server.json');
    let cnt;
    fs.sync().mkdir(path.dirname(newFile));

    fs.writeFileSync(file, JSON.stringify({
      old: true,
      test: 'test_config_server_json'
    }));

    fs.writeFileSync(newFile, JSON.stringify({
      test: 'test_server_json'
    }));
    mockConsole.mock();
    testMod.reload();
    testMod.test.should.eql('test_server_json');
    testMod.old.should.eql(true);
    fs.unlinkSync(file);
    fs.unlinkSync(newFile);
    mockConsole.reset();
  });
  it('should reload conf/custom/common.json', () => {
    let file = path.join(root, './conf/custom/apps_common.json');
    let newFile = path.join(root, './conf/custom/common.json');
    let cnt;
    fs.sync().mkdir(path.dirname(newFile));

    fs.writeFileSync(file, JSON.stringify({
      old: true,
      test: 'test_apps_common_json'
    }));
    fs.writeFileSync(newFile, JSON.stringify({
      test: 'test_common_json'
    }));

    mockConsole.mock();
    testMod.reload();
    testMod.appsCommon.test.should.eql('test_common_json');
    testMod.appsCommon.old.should.eql(true);
    fs.unlinkSync(file);
    fs.unlinkSync(newFile);
    mockConsole.reset();
  });
  it('should reload apps/*.json and rename it to server.json', () => {
    let appCfg = path.join(root, './conf/custom/apps/test.json');
    let common = path.join(root, './conf/custom/common.json');
    let cnt;
    fs.sync().mkdir(path.dirname(appCfg));

    fs.writeFileSync(appCfg, JSON.stringify({
      test: 'test_app_json'
    }));
    fs.writeFileSync(common, JSON.stringify({
      test: 'test_app_common_json'
    }));
    testMod.reload();
    testMod.apps.test.test.should.eql('test_app_json');
    testMod.appsCommon.test.should.eql('test_app_common_json');
    fs.unlinkSync(appCfg);
    fs.unlinkSync(common);
  });
});
