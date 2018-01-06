'use strict';

const testMod = require('../config');
const should = require('should');
const path = require('path');
const fs = require('fs');
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

  it('should work fine', () => {
    let file = path.join(root, './conf/config_server.json');
    let cnt;
    if (fs.existsSync(file)) {
      cnt = fs.readFileSync(file);
      fs.unlinkSync(file);
    }
    mockConsole.mock();
    testMod.reload();
    let msg = info;
    mockConsole.reset();
    // msg.stdout[0].join(' ').should.match(/config_server\.json/);
    if (cnt) {
      fs.writeFileSync(file, cnt);
    }
  });
});
