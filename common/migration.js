const fs = require('xfs');
const path = require('path');

function migrateConfigFile(confPath) {
  let newConfPath = path.join(confPath, 'custom');
  let flag = false;
  let list = [
    'config_server.json',
    'server.json',
    'common.json',
    'apps'
  ];
  list.forEach((file) => {
    let absFileOld = path.join(confPath, file);
    let absFileNew = path.join(newConfPath, file);
    if (fs.existsSync(absFileOld) && !fs.existsSync(absFileNew)) {
      fs.renameSync(absFileOld, absFileNew);
      flag = true;
    }
  });
  let notice = 'from v1.2.5, json config are all move to `./custom` dir';
  fs.writeFileSync(path.join(confPath, 'README.md'), notice);
  return flag;
}

exports.run = (serverRoot) => {
  let confPath = path.join(serverRoot, 'conf');
  let flag = false;
  flag |= migrateConfigFile(confPath);
  return flag;
};
