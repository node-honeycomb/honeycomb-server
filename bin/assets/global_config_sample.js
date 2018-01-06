'use strict';

const path = require('path');

module.exports = {
  /**
   * deploy server root dir
   */
  serverRoot: '/home/admin/honeycomb',
  /**
   * [必选] 服务控制台账号
   */
  admin: {
    /**
     * 服务控制台端口，可更改
     */
    port: 9999,
    /**
     * 控制台登陆用户名
     */
    username: 'honeycomb',
    password: '${admin_pwd}', // `bin/gen_pwd $newpwd` 可以重新创建
    /**
     * 控制台签名密码
     */
    token: '${admin_token}',
    /**
     * 开启默认的publish页面
     */
    enablePublishPage: true,
    gatherUsage: true,
    gatherUsageInterval: 5000,
    gatherUsageTimeout: 3000
  },
  proxy: {
    /**
     * 默认端口
     */
    port: 8080,
    /**
     * [optional] 由前级系统产生的traceId，记录日志的时候需要获取到，可以方便追踪用
     */
    traceIdName: null,
    /**
     * 默认首页地址， 如果 / 没有被劫持，
     */
    index: '/',
    /**
     * nginx 命令地址
     * @type {String}
     */
    nginxBin: '',
    /**
     * nginx 配置文件路径，abs path
     * @type {String}
     */
    nginxConfig: '',
    healthCheck: {
      router: '/status.taobao',
      file: path.join(__dirname, '../run/status'),
      /**
       * honeycomb是否自动touch health检测文件
       * @type {Boolean}
       */
      autoTouch: true
    },
    /**
     * nginx upstream health check, for tengine
     * @type {Object}
     */
    upstreamCheck: {
      // type: 'upstream_check_module',
      // check: 'interval=3000 rise=2 fall=5 timeout=1000 type=http',
      // check_keepalive_requests: 1000,
      // check_http_send: '"GET /_ HTTP/1.0\\r\\n\\r\\n"',
      // check_http_expect_alive: 'http_2xx'
    }
  },
  configSecret: '${config_secret}',
  /** 私有云标记 **/
  serverEnv: '',
  privateCloud: true
};
