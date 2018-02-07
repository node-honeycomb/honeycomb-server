
exports.request = function (superAgent, method, url, data) {
  // first update config, let config failed
  let date = new Date().toGMTString();
  let contentMd5 = utils.md5base64(JSON.stringify(data));
  let stringToSign = `POST\nundefined\n${contentMd5}\napplication/json\n${date}\n${url}`;
  let signature = utils.sha1(stringToSign, config.admin.token);
  return superAgent.post(url);
};