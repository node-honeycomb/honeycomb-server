const RSA = require('node-rsa');
const key = new RSA({b: 1024});

/** 
 * 获取公钥、私钥, 每次创建的结果都不一样，记得一定保存好。
 * 私钥不可泄露
 */
var publicDer = key.exportKey('public');
var privateDer = key.exportKey('private');
console.log('公钥:',publicDer);
console.log('私钥:',privateDer);


let str = 'hello 你好';
// 私钥加密
let ek = new RSA();
ek.importKey(privateDer, 'private');
let en = ek.encryptPrivate(str, 'base64', 'utf8');

// 公钥解密
let dk = new RSA();
dk.importKey(publicDer, 'public');
let de = dk.decryptPublic(en, 'utf8');

// 结果
console.log('result:', de, str === de);