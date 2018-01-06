'use strict';

const fs = require('fs');
const crypto = require('crypto');

function sha256(str) {
  // FIXME 如果data是object呢？ 任何object传进来hash值都一样，呵呵。
  if (typeof str !== 'string') {
    throw new Error('sha256 only support string');
  }
  let hash = crypto.createHash('sha256');
  hash.update(str);
  return hash.digest('hex');
}

let argv = process.argv;

if (!argv[2] || !fs.existsSync(argv[2])) {
  process.exit(1);
}

let config = fs.readFileSync(argv[2]).toString();

let adminPwd = crypto.randomBytes(16).toString('hex');
let adminToken = sha256(argv[3] || crypto.randomBytes(16).toString('hex'));

config = config.replace(/\$\{(\w+)\}/g, function (m0, m1) {
  switch (m1) {
    case 'admin_pwd':
      return sha256(adminPwd);
    case 'admin_token':
      return adminToken;
    case 'config_secret':
      return sha256(crypto.randomBytes(16).toString('hex'));
  }
});

fs.writeFileSync(argv[2], config);

console.log('======= info =======');      // eslint-disable-line
console.log('adminPassword:', adminPwd);  // eslint-disable-line
console.log('adminToken:', adminToken);   // eslint-disable-line
console.log('========================='); // eslint-disable-line
