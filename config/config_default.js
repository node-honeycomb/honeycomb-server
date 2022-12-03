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
   * clusterName，server的ping接口会用其判断集群是否一致
   * 也可以通过process.env.HONEYCOMB_CLUSTER 来传递
   */
  cluster: '',
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
   * master会尝试graceful关闭app，但是在超过下面的时间之后app仍在运行，则会强制退出app
   */
  forceKillTimeout: 15000,
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
  appsCommon: {
    /**
     * https请求忽略证书异常
     */
    honeycomb: {env: {NODE_TLS_REJECT_UNAUTHORIZED: 0}},
  },
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
   * app ready timeout
   * 在run.js中设置appReadyTimeoutCheck用
   * 仅作用于node应用
   */
  appReadyTimeout: 60000,
  /**
   * service's app ready check max retry
   * java app always start with long weitting time
   */
  appReadyMaxRetry: 3000,
  /**
   * 日志根目录，默认为 $serverRoot/logs
   * @type {String}  abs path
   */
  logsRoot: null,
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
      match: /^([\w-.]+)\.\d{4}-\d{2}-\d{2}-\d{2}\.log$/,
      pattern: '$1.{year}-{month}-{day}-{hour}.log'
    },
    {
      // server.2016-12-26.log
      // access.2016-12-26.log
      match: /^([\w-.]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1.{year}-{month}-{day}.log'
    },
    {
      // access-20161226.log
      // node-20161226.log
      match: /^([\w-.]+)-\d{8}\.log/,
      pattern: '$1-{year}{month}{day}.log'
    },
    {
      // admin/sys.2016-12-26.log
      match: /^([\w-.]+)\/([\w-.]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2.{year}-{month}-{day}.log'
    },
    {
      // admin/app-usage.2016-12-26-22.log
      // admin/access-2016-12-26.log
      match: /^([\w-.]+)\/([\w-.]+)(\.|\-)\d{4}-\d{2}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2$3{year}-{month}-{day}-{hour}.log'
    },
    {
      // admin/app-usage.2016.12.26.log
      match: /^([\w-.]+)\/(^[\w-.]+)\.\d{4}-\d{2}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2.{year}-{month}-{day}-{hour}.log'
    },
    {
      // admin/test/sys.2016-12-26.log
      match: /^([\w-.]+)\/([\w-.]+)\/([\w-.]+)\.\d{4}-\d{2}-\d{2}\.log$/,
      pattern: '$1/$2/$3.{year}-{month}-{day}.log'
    }
  ],
  /**
   * proxy配置段
   */
  proxy: {
    /**
     * 监听的ip，如果不指定，则设置为
     *   ipv4: 0.0.0.0
     *   ipv6: ::
     * 如果指定网卡，则指定监听的ip
     */
    ip: '*',
    /**
     * 默认端口
     */
    port: 8080,
    /**
     * bind []
     *  {
     *    ip:,
     *    port:
     *    ssl:
     *    default:
     *    ipv6:
     *  }
     */
    bind: null,
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
     * 请求id，如果为空，不设置
     * 如果指定, 则以指定的值作为header，加入nginx $request_id
     *   proxy_set_header ${requestId} $request_id;
     *   proxy_set_header X-Request-Id $request_id;
     *
     * 注意需要 nginx >= 1.11
     * @type {String}
     */
    requestId: '',
    serverIndexs: {},
    /**
     * 健康检查
     */
    healthCheck: {
      router: '/status',
      /**
       * healthCheck check Duration, server should wait duration time, then kill apps
       * @type {Number}
       */
      duration: 5000,
      /**
       * 设置file，通过touch文件来控制健康检查
       * 如果file为null，则默认将请求转发到honeycomb-server admin的检查接口: server admin的 Get  http://localhost:9999/api/health
       *   honeycomb-server的健康检查接口的逻辑为，检查所有在线app的healthCheck接口，合并结果，所有app健康则返回200， 否则返回404
       * @type {[type]}
       */
      file: path.join(__dirname, '../run/status'),
      /**
       * 设置url则，通过代理来控制健康检查
       * 如设置了file，则file优先
       * @type {String}
       */
      url: '',
    },
    /*
    upstreamCheck: {
      type: 'upstream_check_module'
    }
    ,*/
    switch: {
      stream: 'nginx', // can only be nginx
      http: 'nginx'
    },
    /**
     * proxy admin control api
     * 控制接口通过默认端口提供服务，减少端口占用
     * 此配置只有nginx模式有效，node模式暂不支持
     * @type {String}
     */
    proxyAdmin: '/__hc__'
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
     * 配置服务端口是否开启https
     * you can gen you key and sert like this
     * openssl req -newkey rsa:2048 -new -nodes -keyout key.pem -out csr.pem
     * openssl x509 -req -days 365 -in csr.pem -signkey key.pem -out server.crt
     * key.pem is your key
     * server.crt is your cert
     * https: {
     *   key: {Path}
     *   scrt: {Path}
     * }
     */
    https: null,
    healthCheck: '/status',
    /**
     * 默认发布页的密码, 上线请务必修改
     * 密码可以通过
     *   `honeycomb pwd $pwd`来生成， 比如`honeycomb pwd honeycomb123` 即可得到以下hash串
     */
    password: 'd2df9aa1cde859aef1d78401a6d37cd435d172b79d23ca8662f47bd2d2e3b99e', // honeycomb123
    /**
     * admin 管控接口的api签名token, 请务必修改
     */
    token: '***honeycomb-default-token***',
    signExpire: 30000,
    /**
     * admin端口的service超时时间
     * @type {Number}
     * publish接口的超时时间为这个值/2
     */
    serverTimeout: 600000,
    /**
     * 串行发布，默认为true [deprecated, since publish action may stop app first]
     * @type {Boolean}
     */
    seriesPublish: true,
    uploadMaxBody: 800 * 1024 * 1024, // 800m
    gatherUsage: false,
    gatherUsageInterval: 5000,
    gatherUsageTimeout: 3000,
    readLogMaxLines: 1000,
    readLogDefaultLines: 100,
    hooks: {
      publish: null
    },
    /**
     * single api 切割日志，以该正则来识别是否新一条日志
     * 注意正则中的匹配，必须为 x:y:z
     * 因为目前console查询提交的startTime格式不可定制
     * TODO: 需要让console中的startTime可以定制格式
     *   2019-09-02 01:15:00,285
     */
    queryLogNewLineRegExp: /^(?:\d{8}|\d{4}\-\d{2}\-\d{2}).(\d{2}:\d{2}:\d{2})(\.|,)\d{3}/,
    /**
     * 日志排序匹配正则，主要是捕获日志中的时间
     * 在batch api中，通过捕获的时间排序，让返回的多机合并的日志按时序排列
     */
    queryLogSortRegExp: /^(?:\d{8}|\d{4}\-\d{2}\-\d{2}).\d{2}:\d{2}:\d{2}(\.|,)\d{3}/
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
