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
    msg.stderr[0].join(' ').should.match(/Loading server config failed/);
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
    msg.stderr[0].join(' ').should.match(/Loading server config failed/);
    fs.unlinkSync(gCfgFile);
  });

  it('should throw error when app\'s config error', () => {
    let aCfg = '{';
    let aCfgFile = path.join(root, './conf/apps/test.json');
    fs.writeFileSync(aCfgFile, aCfg);
    mockConsole.mock();
    testMod.reload();
    let msg = info;
    mockConsole.reset();
    msg.stderr[0].join(' ').should.match(/Loading app config failed/);
    fs.unlinkSync(aCfgFile);
  });

  it('should reload config_server.json and rename it to server.json', () => {
    let file = path.join(root, './conf/config_server.json');
    let newFile = path.join(root, './conf/server.json');
    let cnt;
    fs.writeFileSync(file, JSON.stringify({
      test: 'test_server_json'
    }));
    try {
      fs.unlinkSync(newFile);
    } catch(e) {}

    mockConsole.mock();
    testMod.reload();
    testMod.test.should.eql('test_server_json');
    should(fs.existsSync(file)).eql(false);
    should(fs.existsSync(newFile)).eql(true);
    fs.unlinkSync(newFile);
    mockConsole.reset();
  });
  it('should reload apps_common.json and rename it to server.json', () => {
    let file = path.join(root, './conf/apps_common.json');
    let newFile = path.join(root, './conf/common.json');
    let cnt;
    fs.writeFileSync(file, JSON.stringify({
      test: 'test_server_json'
    }));
    try {
      fs.unlinkSync(newFile);
    } catch(e) {}

    mockConsole.mock();
    testMod.reload();
    testMod.appsCommon.test.should.eql('test_server_json');
    should(fs.existsSync(file)).eql(false);
    should(fs.existsSync(newFile)).eql(true);
    fs.unlinkSync(newFile);
    mockConsole.reset();
  });
  it('should reload apps/*.json and rename it to server.json', () => {
    let appCfg = path.join(root, './conf/apps/test.json');
    let common = path.join(root, './conf/common.json');
    let cnt;
    fs.sync().save(appCfg, JSON.stringify({
      test: 'abc'
    }));
    fs.writeFileSync(common, JSON.stringify({
      test: 'test_server_json'
    }));
    try {
      fs.unlinkSync(newFile);
    } catch(e) {}
    testMod.reload();
    testMod.apps.test.test.should.eql('abc');
    fs.unlinkSync(appCfg);
    fs.unlinkSync(common);
  });
});
