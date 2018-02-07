'use strict';

const path = require('path');
const cp = require('child_process');
/**
 * server install root, this project code abs path
 */
const serverInstallRoot = path.join(__dirname, '../');

let nginxDefaultBin;

try {
  nginxDefaultBin = cp.execSync('which nginx', {stdio: ['pipe', 'pipe', 'ignore']}).toString().trim();
} catch (e) {
  // do nothing
}

module.exports = {
  /**
   * just the appName
   */
  name: 'honeycomb-server',
  /**
   * debug flag
   */
  debug: true,
  /**
   * the server root, 应用部署的根目录一般的服务器端部署目录如下:
   *   /home/admin/honeycomb-server       // this is the server root
   *                              /bin
   *                              /logs
   *                              /run
   *                              /target
   *                                      /honeycomb
   *                                      /honeycomb.tgz
   */
  serverRoot: serverInstallRoot,
  /**
   * !应用初始化顺序, order小的提前启动
   *   order: 如不配置，默认order值1000,
   *   processorNum: 该应用的进程数
   */
  apps: {
    system: {
      order: 1
    }
  },
  /**
   * !各应用的公共配置，会merge到各应用中
   * @type {Object}
   */
  appsCommon: {},
  /**
   * app启动状态存储文件，一般不需要修改
   * @internal
   */
  appsSessionPath: '',
  /**
   * 发布上来的app包存放地址
   * @internal
   */
  appsRoot: '',
  /**
   * 服务器的log配置，一般只需要修改路径
   * TODO 文档说明
   */
  logs: {
    sys: {
      level: 'DEBUG'
    },
    appUsage: {
      level: 'INFO'
    }
  },
  appExtraInfo: ['bind', 'port', 'router', 'type', 'framework'],
  /**
   * 服务器日志分析
   * TODO 文档说明
   */
  logFilePatterns: [
    {
      // app-usage.2016-12-26-22.log
      match: /(^[^\/]+)\.\d{4}-\d{2}-\d{2}-\d{2}\.log$/,
      pattern: '$1.{year}-{month}-{day}-{hour}.log'
    },
    {
      // server.2016-12-26.log
      // access.2016-12-26.log
      match: /(^[^\/]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1.{year}-{month}-{day}.log'
    },
    {
      // access-20161226.log
      // node-20161226.log
      match: /(^[^\/]+)-\d{8}\.log/,
      pattern: '$1-{year}{month}{day}.log'
    },
    {
      // admin/sys.2016-12-26.log
      match: /(^\.*[^\/]+)\/(\.*[^\/]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2.{year}-{month}-{day}.log'
    },
    {
      // admin/test/sys.2016-12-26.log
      match: /(^\.*[^\/]+)\/(\.*[^\/]+)\/(\.*[^\/]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2/$3.{year}-{month}-{day}.log'
    },
    {
      // admin/access-2016-12-26.log
      match: /(^\.*[^\/]+)\/(\.*[^\/]+)\-\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2-{year}-{month}-{day}.log'
    }
  ],
  /**
   * proxy配置段
   */
  proxy: {
    ip: '0.0.0.0',
    /**
     * 默认端口
     */
    port: 8080,
    /**
     * nginx 命令地址
     * @type {String}
     */
    nginxBin: nginxDefaultBin,
    /**
     * nginx 配置文件路径，abs path
     * @type {String}
     */
    nginxConfig: path.join(__dirname, '../nginx.conf'),
    /**
     * nginx install prefix
     *
     * @type {String}
     */
    nginxPrefix: '',
    /**
     * [optional] 由前级系统产生的traceId，记录日志的时候需要获取到，可以方便追踪用
     */
    traceIdName: null,
    /**
     * 默认首页地址， 如果 / 没有被劫持，
     */
    index: '/',
    /**
     * 健康检查
     */
    healthCheck: {
      router: '/status',
      file: path.join(__dirname, '../run/status'),
      /**
       * honeycomb是否自动touch health检测文件
       * @type {Boolean}
       */
      autoTouch: true
    },
    /*
    upstreamCheck: {
      type: 'upstream_check_module'
    }
    ,*/
    switch: {
      stream: 'node',
      http: 'nginx'
    }
  },
  /**
   * admin配置段
   * @type {Object}
   */
  admin: {
    /**
     * 管控接口
     */
    port: 9999,
    /**
     * 是否开启默认的发布页，默认开启。 主要是方便发布管理app上去
     */
    enablePublishPage: true,
    /**
     * you can gen you key and sert like this
     * openssl req -newkey rsa:2048 -new -nodes -keyout key.pem -out csr.pem
     * openssl x509 -req -days 365 -in csr.pem -signkey key.pem -out server.crt
     * key.pem is your key
     * server.crt is your cert
     */
    /*
    https: {
      key: '',
      cert: ''
    },
    */
    /**
     * 默认发布页的用户名、密码, 上线请务必修改
     * 密码生成可以用server/bin目录下提供的工具
     *  bin/
     */
    username: 'honeycomb',
    password: 'd2df9aa1cde859aef1d78401a6d37cd435d172b79d23ca8662f47bd2d2e3b99e', // honeycomb123
    /**
     * admin 管控接口的api签名token, 请务必修改
     */
    token: '***honeycomb-default-token***',
    signExpire: 30000,
    gatherUsage: false,
    gatherUsageInterval: 5000,
    gatherUsageTimeout: 3000,
    readLogMaxLines: 1000,
    readLogDefaultLines: 100,
    queryLogTimeRegExp: /^\d{8}.(\d{2}:\d{2}:\d{2})/,
    queryLogSortRegExp: /^\d{8}.\d{2}:\d{2}:\d{2}\.\d{3}/
  },
  /**
   * 私有配置保护用
   */
  configSecret: '***honeycomb-default-secret***',
  /**
   * [optional] 服务类型, 一般无需设置，这个参数会传递给app，方便app做不同运行环境的区分
   */
  serverEnv: ''
};
