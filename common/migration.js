const fs = require('xfs');
const path = require('path');

// 跨磁盘copy不能用 fs.rename
function renameFileSavely(absFileOld, absFileNew) {
  let stats = fs.statSync(absFileOld);
  if (stats.isDirectory()) {
    let list = fs.readdirSync(absFileOld);
    list.forEach((file) => {
      let oldF = path.join(absFileOld, file);
      let newF = path.join(absFileNew, file);
      renameFileSavely(oldF, newF);
    });
  } else {
    let data = fs.readFileSync(absFileOld);
    fs.sync().save(absFileNew, data);
    fs.unlinkSync(absFileOld);
  }
}

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
      renameFileSavely(absFileOld, absFileNew);
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
