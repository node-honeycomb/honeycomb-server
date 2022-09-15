'use strict';

const fs = require('xfs');
const _ = require('lodash');
const child = require('child_process');
const path = require('path');
const xfs = require('xfs');
const log = require('../../common/log');
const utils = require('../../common/utils');
const gConfig = require('../../config');
const Proxy = require('./proxy');
const NgConfigParser = require('../../common/nginx_config_parser');
const FLAG_NGINX = 'NGINX';

const defaultUpstreamCheckConfig = {
  type: 'upstream_check_module',
  check: 'interval=3000 rise=2 fall=5 timeout=1000 type=http',
  check_keepalive_requests: 1000,
  check_http_send: '"GET /_ HTTP/1.0\\r\\n\\r\\n"',
  check_http_expect_alive: 'http_2xx'
};

const defaultUpstreamConfig = {
  max_fails: 0,
  fail_timeout: '0',
};

class Nginx extends Proxy {
  /**
   * @param {Object} options 来自主配置的proxy对象
   *
   *         nginxBin  nginx bin 路径
   *         nginxConfig  nginx config 路径
   *         serverConfigPath honeycomb产生的nginx配置路径
   *         ip 默认IP
   *         port 默认端口
   *         healthCheck 健康检查, slb流量切换用
   *         requestId: X-Request-Id
   *         upstreamCheck:
   *           type: 'upstream_check_module', // or nginx plus
   *           check: 'interval=3000 rise=2 fall=5 timeout=1000 type=http',
   *           check_keepalive_requests: 1000,
   *           check_http_send: '"GET /_ HTTP/1.0\\r\\n\\r\\n"',
   *           check_http_expect_alive: 'http_2xx'
   *
   *         upstreamCheck:
   *           type: 'normal',
   *           max_fails: 2,      // default 1
   *           fail_timeout: '10s' // if fail, wait xx ms
   *
   */
  constructor(options) {
    super(options);
    this.type = 'nginx';
    this.init(options);
  }
  init(options) {
    super.init(options);
    this.binPath = options.nginxBin;
    this.configPath = options.nginxConfig;
    this.prefixPath = options.nginxPrefix;
    this.includePath = options.nginxIncludePath;

    if (!options.healthCheck) {
      options.healthCheck = {};
    }

    if (options.upstreamCheck && options.upstreamCheck.type === 'upstream_check_module') {
      options.upstreamCheck = _.merge({}, defaultUpstreamCheckConfig, options.upstreamCheck);
    } else {
      options.upstreamCheck = _.merge({}, defaultUpstreamConfig, options.upstreamCheck);
    }
    /* istanbul ignore if */
    if (!this.checkConfig()) {
      let e = new Error(`nginx_config_file_eaccess : ${this.configPath}, need +rw permission`);
      e.code = 'NGINX_CONFIG_EACCESS';
      throw e;
    }
    /* istanbul ignore if */
    if (!this.checkBin()) {
      let e = new Error(`nginx_bin_eaccess : ${this.binPath}  need +x permission`);
      e.code = 'NGINX_BIN_EACCESS';
      throw e;
    }
    /* no more watch for nginx file change since fs.watch is not stable
    if (!this.configWatcher) {
      this.configWatcher = true;
      fs.watchFile(this.configPath, (a, b) => {
        // eslint-disable-next-line
        console.log('>>> fs.watchFile', this.flagInitConfig);
        if (this.flagInitConfig) {
          this.flagInitConfig = false;
          this.emit('ready');
          return;
        }
        if (a.mtime !== b.mtime) {
          log.warn('nginx_config_changed, re-init config file');
          this.initConfig();
        }
      });
    }
    */
    this.initConfig();
  }
  exit() {
    super.exit();
    /*
    if (this.configWatcher) {
      fs.unwatchFile(this.configPath);
      this.configWatcher = false;
    }
    */
    this.cleanConfig();
  }
  /**
   * check if nginx config file accessible
   * @return {Boolean}
   */
  checkConfig() {
    try {
      fs.accessSync(this.configPath,  fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      /* istanbul ignore next */
      return false;
    }
    return true;
  }
  checkBin() {
    try {
      fs.accessSync(this.binPath,  fs.constants.X_OK);
    } catch (e) {
      /* istanbul ignore next */
      return false;
    }
    return true;
  }
  /**
   * 初始化config
   *   主要的动作就是加载config，注入 include honeycomb的server配置
   *
   * 注意如果nginx config 没有写权限，则打印warn信息，包含
   */
  initConfig() {
    let code = fs.readFileSync(this.configPath, 'utf8');
    let ast;
    try {
      ast = NgConfigParser.parse(code, {loc: true});
    } catch (e) {
      e.message = 'nginx_config_parse_error: ' + e.message;
      e.code = 'NGINX_CONFIG_PARSE_ERROR';
      throw e;
    }
    let httpInsertNodeOffset = null;
    let flagHttpWSConfig = false;
    let flagHttpInclude = null;
    let httpIncludePath = path.join(this.includePath, 'http/*.conf');
    // let streamIncludePath = path.join(this.includePath, 'stream/*.conf')

    let flagStreamInclude = null;
    let streamInsertNodeOffset = null;
    let streamIncludePath = path.join(this.includePath, 'stream/*.conf');

    ast.statements.forEach((node) => {
      // check http block
      if (node.key === 'http') {
        let stms = node.block.statements;
        flagHttpInclude = false;
        httpInsertNodeOffset = false;
        stms.forEach((n) => {
          switch (n.key) {
            case 'map':
              if (
                n.value.length === 2 &&
                n.value[0].value === '$http_upgrade' &&
                n.value[1].value === '$connection_upgrade'
              ) {
                flagHttpWSConfig = true;
              }
              break;
            case 'include':
              if (n.value.length === 1 && n.value[0].value === httpIncludePath) {
                flagHttpInclude = true;
              }
              break;
            default:
              if (n.type === 'comment' && n.value.trim() === '@honeycomb') {
                httpInsertNodeOffset = n;
              }
          }
        });
      } else if (node.key === 'stream') {
        let stms = node.block.statements;
        flagStreamInclude = false;
        streamInsertNodeOffset = false;
        stms.forEach((n) => {
          switch (n.key) {
            case 'include':
              if (n.value.length === 1 && n.value[0].value === streamIncludePath) {
                flagStreamInclude = true;
              }
              break;
            default:
              if (n.type === 'comment' && n.value.trim() === '@honeycomb') {
                streamInsertNodeOffset = n;
              }
          }
        });
      }
    });

    if (httpInsertNodeOffset === false) {
      let e = new Error('please inset nginx.conf single line comment `# @honeycomb` at http section');
      e.code = 'NGINX_CONFIG_NO_INJECT_FLAG_ERROR';
      throw e;
    }
    if (streamInsertNodeOffset === false) {
      let e = new Error('please inset nginx.conf single line comment `# @honeycomb` at stream section');
      e.code = 'NGINX_CONFIG_NO_INJECT_FLAG_ERROR';
      throw e;
    }

    let offsetHttp = 0;
    let offsetStream = 0;
    if (httpInsertNodeOffset) {
      offsetHttp = httpInsertNodeOffset.loc.end.offset;
    }
    if (streamInsertNodeOffset) {
      offsetStream = streamInsertNodeOffset.loc.end.offset;
    }

    if (offsetHttp === offsetStream) {
      let e = new Error('stream insert position should not equal http insert position');
      e.code = 'NGINX_CONFIG_INJECT_ERROR';
      throw e;
    }

    let offsetMin = Math.min(offsetHttp, offsetStream);
    let offsetMax = Math.max(offsetHttp, offsetStream);
    let locHttp;
    let locStream;

    let finalCode = []; // 0,[1],2,[3],4
    finalCode[0] = code.substring(0, offsetMin);
    finalCode[2] = code.substring(offsetMin, offsetMax);
    finalCode[4] = code.substring(offsetMax);

    locHttp = offsetHttp === offsetMin ? 1 : 3;
    locStream = offsetStream === offsetMin ? 1 : 3;
    /**
     * inject http section
     */
    let indent = httpInsertNodeOffset ? httpInsertNodeOffset.loc.start.column : 0;
    let injectHttp = [];
    if (!flagHttpWSConfig) {
      injectHttp.push([indent, 'map $http_upgrade $connection_upgrade {default upgrade;"" close;}']);
      injectHttp.push([indent, 'proxy_set_header Upgrade $http_upgrade;']);
      injectHttp.push([indent, 'proxy_set_header Connection $connection_upgrade;']);
    }

    if (flagHttpInclude === false) {
      injectHttp.push([indent, `include ${httpIncludePath};`]);
    }
    /**
     * inject stream section
     */
    let indentStream = streamInsertNodeOffset ? streamInsertNodeOffset.loc.start.column : 0;
    let injectStream = [];
    if (flagStreamInclude === false) {
      injectStream.push([indentStream, `include ${streamIncludePath};`]);
    }

    // do inject
    if (injectHttp.length) {
      injectHttp.unshift('');
      finalCode[locHttp] = utils.stringifyInfo(injectHttp);
    }

    if (injectStream.length) {
      injectStream.unshift('');
      finalCode[locStream] = utils.stringifyInfo(injectStream);
    }

    let codeNew = finalCode.join('');
    // this.flagInitConfig = true;

    fs.writeFileSync(this.configPath, codeNew, {encoding: 'utf8'});
    process.nextTick(() => {
      this.emit('ready');
    });
  }
  /**
   * 更新路由
   * @public
   */
  updateRouter(callback) {
    let flag = super.updateRouter();
    if (flag === false) {
      return callback(null);
    }
    this.updateConfig(callback);
  }
  updateConfig(done) {
    log.debug('update router');
    let map = this.map;
    let config = {
      http: {
        upStreams: {},
        servers: {}
      },
      stream: {
        upStreams: {},
        servers: {}
      }
    };

    function fixRedirectIndex(path) {
      if (path.indexOf('?') >= 0 || path.indexOf('$args') >= 0) {
        return path;
      }
      return path + '$is_args$args';
    }

    Object.keys(map).forEach((appName) => {
      /*
      { bind: '8080',
        router: '/example',
        target: '*.1.sock',
        appId: 'simple-app',
        name: 'simple-app',
        version: '0.0.0',
        buildNum: 0,
        pid: 4588,
        type: 'socket',  // default 'http', http | socket | stream
        sockList: ['1.sock, 2.sock']
        portList: [2001,2003]
        backupSockList: []
        static: {"path": "filePath"}
      }
      */
      let app = map[appName];
      let binds = this.prepareBind(app, this.options);
      let ngConfig;
      let defaultKey;
      let defaultServerCfg;

      switch (app.type) {
        case 'stream':
          ngConfig = config.stream;
          ngConfig.upStreams['honeycomb_' + appName] = {
            main: (app.portList && app.portList.length) ? app.portList : app.sockList,
            // backup: (app.backupPortList && app.backupPortList.length)  ? app.backupPortList : app.backupSockList
          };
          binds.forEach((v) => {
            /**
             * v
             *   id: v.ip + ':' + v.port,
             *   ip: v.ip,
             *   port: v.port
             *   default: v.default
             *   ssl: v.ssl
             *   ipv6: v.ipv6
             */
            let id = v.id;
            let serverNameList = v.serverName;
            serverNameList.forEach((serverName) => {
              // 根据 listen的端口 和 serverName 作为key
              let key = id + '_' + serverName;
              if (!ngConfig.servers[key]) {
                ngConfig.servers[key] = {
                  listen: {
                    ip: v.ip,
                    port: v.port,
                    default: v.default,
                    ssl: false,
                    ipv6: v.ipv6
                  },
                  proxyPass: 'honeycomb_' + appName,
                  serverParam: {}
                };
              }
              let tmp = ngConfig.servers[key];
              if (v.ipv6) {
                tmp.listen.ipv6 = v.ipv6;
              }
              if (v.param) {
                _.merge(tmp.serverParam, v.param.server);
              }
              // check if ssl configed
              if (tmp.serverParam.ssl_certificate) {
                tmp.listen.ssl = true;
              }
            });
          });
          break;
        default: // http
          ngConfig = config.http;
          if (!app.noUpstream) {
            ngConfig.upStreams['honeycomb_' + appName] = {
              main: (app.portList && app.portList.length) ? app.portList : app.sockList,
              backup: (app.backupPortList && app.backupPortList.length)  ? app.backupPortList : app.backupSockList
            };
          }

          this.options.bind.forEach((cfg) => {
            defaultKey = cfg.ip + ':' + cfg.port + '_*';
            if (!ngConfig.servers[defaultKey]) {
              defaultServerCfg = {
                listen: {
                  ip: cfg.ip,
                  port: cfg.port,
                  default: cfg.default,
                  ssl: false,
                  ipv6: cfg.ipv6
                },
                serverName: '',
                locations: {},
                serverParam: {}
              };

              if (this.options.healthCheck.router) {
                defaultServerCfg.locations[this.options.healthCheck.router] = {
                  file: this.options.healthCheck.file
                };
              }
              if (this.options.index) {
                defaultServerCfg.locations['= /'] = {
                  redirect: fixRedirectIndex(this.options.index)
                };
              }
              if (this.options.proxyAdmin) {
                defaultServerCfg.locations[this.options.proxyAdmin] = {
                  proxyPass: `http://localhost:${gConfig.admin.port}/`
                };
              }
              ngConfig.servers[defaultKey] = defaultServerCfg;
            }
          });

          binds.forEach((v) => {
            /**
             * v {Object}
             *   id: v.ip + ':' + v.port,
             *   ip: v.ip,
             *   port: v.port,
             *   serverName: serverName,
             *   router: config.router
             */
            let id = v.id;
            let serverNameList = v.serverName;
            serverNameList.forEach((serverName) => {
              // 根据 listen的端口 和 serverName 作为key
              let key = id + '_' + serverName;
              if (!ngConfig.servers[key]) {
                ngConfig.servers[key] = {
                  listen: {
                    ip: v.ip,
                    port: v.port,
                    default: false,
                    ssl: false,
                    ipv6: v.ipv6
                  },
                  serverName: serverName === '*' ? '' : serverName,
                  locations: {},
                  serverParam: {}
                };

                /** 初始化时定义，当router为/时，可覆盖，不影响自定义路由 */
                if (this.options.serverIndexs[serverName]) {
                  ngConfig.servers[key].locations['= /'] = {
                    redirect: this.options.serverIndexs[serverName]
                  };
                }
              }
              let tmp = ngConfig.servers[key];
              let router = v.router;

              if (v.ipv6) {
                tmp.listen.ipv6 = v.ipv6;
              }

              if (!app.noUpstream) {
                tmp.locations[router] = {
                  proxyPass: 'honeycomb_' + appName
                };
                if (v.param) {
                  _.merge(tmp.serverParam, v.param.server);
                  tmp.locations[router].locationParam = _.merge({}, v.param.location);
                }
              }
              if (app.static) {
                Object.keys(app.static).forEach((key) => {
                  if (app.static[key].dir) {
                    let obj = {
                      alias: app.static[key].dir,
                    };
                    if (app.static[key].gziped) {
                      obj.gzip = 'off';
                      obj.add_header = 'Content-Encoding gzip';
                    }
                    tmp.locations[path.join(router, '/',  key)] = obj;
                  }
                });
              }

              /** 解决路径不带/结尾访问时 301 的问题*/
              if (router !== '/') {
                tmp.locations['= ' + router.replace(/\/$/, '')] = {
                  rewrite: `^.*$ ${router} last`
                };
              }

              if (tmp.serverParam.ssl_certificate) {
                tmp.listen.ssl = 'ssl';
              }
            });
          });
          break;
      }
    });
    this.flushConfig(config);
    this.reload(done);
  }
  /**
   * reload nginx
   */
  reload(callback) {
    log.debug('start reload nginx');
    this.flagReload = true;
    let cmdCheck = this.binPath + ' -t -c ' + this.configPath +
      (this.prefixPath ? ' -p ' + this.prefixPath : '');
    let cmdReload = this.binPath + ' -s reload -c ' + this.configPath +
      (this.prefixPath ? ' -p ' + this.prefixPath : '');
    child.exec(cmdCheck, (err, stdout, stderr) => {
      if (err) {
        log.error(FLAG_NGINX, 'nginx_config_error ', stderr.toString());
        this.backupErrorConfig();
        this.rollback();
        return callback && callback(new Error('nginx reload failed, config error:' + err));
      }
      log.debug('check nginx config success', stdout.toString());
      /**
       * get old nginx process worker's pids
       *
      this.getNginxWorkerPids((err, ngWorkers) => {
        log.debug('get nginx old workers', ngWorkers);
        child.exec(cmdReload, (err, stdout, stderr) => {
          if (err) {
            err.message += ' ' + stderr.toString();
            if (!this.flagRollBack) {
              log.error(FLAG_NGINX, 'nginx_reload_error', err);
              this.flagRollBack = true;
              this.backupErrorConfig();
              return this.rollback(() => {
                callback && callback(err);
              });
            } else {
              log.error(FLAG_NGINX, 'nginx_config_error', err, 'rollback configs');
            }
          } else {
            this.flagRollBack = false;
          }
          log.debug('nginx reload success');
          /** check if all old ng worker are stoped *
          this.checkNginxProcess(ngWorkers, null, callback);
        });
      });
      */
      child.exec(cmdReload, (err, stdout, stderr) => {
        if (err) {
          err.message += ' ' + stderr.toString();
          log.error(FLAG_NGINX, 'nginx_reload_error', err, 'rollback configs');
          this.flagRollBack = true;
          this.backupErrorConfig();
          return this.rollback(() => {
            callback && callback(err);
          });
        } else {
          callback && callback();
        }
      });
    });
  }
  getNginxWorkerPids(cb) {
    child.exec('ps aux|grep nginx | grep "worker process" | grep -v grep', (err, stdout) => {
      if (err) {
        cb(null, []);
      } else {
        let lines = stdout.toString().trim().split(/\n/);
        let res = [];
        lines.forEach((line) => {
          let columns = line.trim().split(/\s+/);
          if (columns.length < 2) {
            return;
          }
          res.push(columns[1]);
        });
        cb(null, res);
      }
    });
  }
  checkNginxProcess(workers, count, done) {
    let a = 0;
    count = count || 300;
    log.debug('checking nginx old workers');
    function check() {
      if (!workers.length) {
        log.debug('nginx old workers all stoped');
        return done();
      }
      child.exec('ps -p ' + workers.join(','), (err) => {
        if (err || a >= count) {
          // 老进程全部退去，可以返回
          log.debug('nginx old workers force killed');
          return done && done();
        }
        a++;
        setTimeout(check, 100);
      });
    }
    check();
  }
  /**
   * write nginx config;
   * check if changed first
   * @return {Boolean} true 表示变化了，false表示没变化
   */
  flushConfig(config) {
    log.debug('flush config');
    this.cleanConfig();
    // gen http Config
    let httpConfig = config.http;
    let httpUpStreamsConfig = [];
    Object.keys(httpConfig.upStreams).forEach((key) => {
      let cfg = httpConfig.upStreams[key];
      httpUpStreamsConfig.push(this.genUpStreamConfig(key, cfg));
    });
    // save to file;
    this.saveConfigFile('http', 'all_upstream.conf', httpUpStreamsConfig.join('\n'));

    Object.keys(httpConfig.servers).forEach((key) => {
      let cfg = this.genHttpServerConfig(key, httpConfig.servers[key]);
      this.saveConfigFile('http', 'server_' + key + '.conf', cfg);
    });

    let streamConfig = config.stream;
    let streamUpStreamsConfig = [];
    Object.keys(streamConfig.upStreams).forEach((key) => {
      let cfg = streamConfig.upStreams[key];
      streamUpStreamsConfig.push(this.genUpStreamConfig(key, cfg));
    });
    // save to file;
    this.saveConfigFile('stream', 'all_upstream.conf', streamUpStreamsConfig.join('\n'));
    Object.keys(streamConfig.servers).forEach((key) => {
      let cfg = this.genStreamServerConfig(key, streamConfig.servers[key]);
      this.saveConfigFile('stream', 'server_' + key + '.conf', cfg);
    });
  }
  /**
   * 创建 upstream 配置段
   * @return {String} upstream config string
   */
  genUpStreamConfig(key, cfg) {
    /**
     let tengine = `
      check interval=3000 rise=2 fall=5 timeout=1000 type=http;
      check_keepalive_requests 100;
      check_http_send "HEAD / HTTP/1.1\r\nConnection: keep-alive\r\n\r\n";
      check_http_expect_alive http_2xx http_3xx;
    `;
     */
    let str = [`upstream ${key} {`];

    let upstreamCheck = this.options.upstreamCheck || {};
    switch  (upstreamCheck.type) {
      case 'upstream_check_module':
        cfg.main.forEach((v) => {
          if (typeof v === 'number') {
            str.push('\tserver localhost:' + v + ';');
          } else {
            str.push('\tserver unix:' + v + ';');
          }
        });
        cfg.backup && cfg.backup.forEach((v) => {
          if (typeof v === 'number') {
            str.push('\tserver localhost:' + v + ' backup;');
          } else {
            str.push('\tserver unix:' + v + ' backup;');
          }
        });
        str.push(`\tcheck ${upstreamCheck.check};`);
        str.push(`\tcheck_keepalive_requests ${upstreamCheck.check_keepalive_requests};`);
        str.push(`\tcheck_http_send ${upstreamCheck.check_http_send};`);
        str.push(`\tcheck_http_expect_alive ${upstreamCheck.check_http_expect_alive};`);
        break;
      default:
        cfg.main.forEach((v) => {
          if (typeof v === 'number') {
            str.push(`\tserver localhost:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout};`);
          } else {
            str.push(`\tserver unix:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout};`);
          }
        });
        cfg.backup && cfg.backup.forEach((v) => {
          if (typeof v === 'number') {
            str.push(`\tserver localhost:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout} backup;`);
          } else {
            str.push(`\tserver unix:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout} backup;`);
          }
        });
        break;
    }

    str.push('}');
    return str.join('\n');
  }
  /**
   *  server {
   *    listen $port $default $ssl;
   *    ssl_certificate     www.example.com.crt;
   *    ssl_certificate_key www.example.com.key;
   *    ssl_protocols       TLSv1 TLSv1.1 TLSv1.2;
   *    ssl_ciphers         HIGH:!aNULL:!MD5;
   *
   *    proxy_pass honeycomb_xxx;
   *  }
   */

  genStreamServerConfig(key, cfg) {
    let serverConfig = {
      listen: undefined,
      proxy_pass: undefined
    };
    if (cfg.listen.ipv6) {
      cfg.listen.ip = '[' + cfg.listen + ']';
    }
    /** prepare listen */
    let listen = `${cfg.listen.ip}:${cfg.listen.port} ${cfg.listen.default ? 'defalut' : ''} ${cfg.listen.ssl ? 'ssl' : ''} ${cfg.listen.ipv6 ? 'ipv6only=on' : ''}`;
    serverConfig.listen = listen;
    serverConfig.proxy_pass = cfg.proxyPass;

    if (cfg.serverParam) {
      Object.keys(cfg.serverParam).forEach((key) => {
        if (key === 'proxy_pass') {
          return;
        }
        serverConfig[key] = cfg.serverParam[key];
      });
    }

    let sconfig = this.stringifyServer(key, serverConfig);
    return sconfig;
  }

  genHttpServerConfig(key, cfg) {
    /**
     * nginx upstream
     *
     *  upstream $appId1 {
     *    server backend2.example.com max_fails=3 fail_timeout=30s;
     *  }
     *
     *  tengine check directive in upstream
     *
     *    check interval=3000 rise=2 fall=5 timeout=1000 type=http;
     *    check_keepalive_requests 100;
     *    check_http_send "HEAD / HTTP/1.1\r\nConnection: keep-alive\r\n\r\n";
     *    check_http_expect_alive http_2xx http_3xx;
     *
     *
     *  server {
     *    listen $port default;
     *    server_name $serverName;
     *
     *    keepalive_timeout   70;
     *
     *    ssl_certificate     www.example.com.crt;
     *    ssl_certificate_key www.example.com.key;
     *    ssl_protocols       TLSv1 TLSv1.1 TLSv1.2;
     *    ssl_ciphers         HIGH:!aNULL:!MD5;
     *
     *    location $prefix1 {
     *      proxy_pass http://$appId1;
     *    }
     *    location $prefix2 {
     *      proxy_pass http://$appId2;
     *    }
     *  }
     *
     *
     * serverConfig
     * @type {Object}
     *       listen: '',
     *       server_name: undefined,
     *       keepalive_timeout 30,
     *       locations: {
     *         'router': {
     *           proxy_pass: '',
     *           client_max_body_size:
     *           proxy_set_header: []
     *         }
     *       }
     */
    let serverConfig = {
      listen: undefined,
      server_name: undefined,
      keepalive_timeout: 30
    };
    if (cfg.listen.ipv6) {
      cfg.listen.ip = '[' + cfg.listen.ip + ']';
    }
    /** prepare listen */
    let listen = `${cfg.listen.ip}:${cfg.listen.port} ${cfg.listen.ssl ? 'ssl' : ''} ${cfg.listen.default ? 'default' : ''} ${cfg.listen.ipv6 ? 'ipv6only=on' : ''}`;
    serverConfig.listen = listen;
    /** prepare serverName */
    if (cfg.serverName) {
      if (Array.isArray(cfg.serverName)) {
        if (cfg.serverName.length) {
          serverConfig.server_name = cfg.serverName.join(' ');
        }
      } else {
        serverConfig.server_name = cfg.serverName;
      }
    }

    if (cfg.serverParam) {
      Object.keys(cfg.serverParam).forEach((key) => {
        serverConfig[key] = cfg.serverParam[key];
      });
    }
    /**
     * sort locations
     */
    let self = this;
    let appRules = [];
    let reservedRules = [];
    cfg.locations && Object.keys(cfg.locations).forEach((router) => {
      let v = cfg.locations[router];
      if (v.proxyPass) {
        let config = {
          proxy_http_version: '1.1',
          proxy_pass: /https?:\/\//.test(v.proxyPass) ? v.proxyPass : `http://${v.proxyPass}`,
          proxy_set_header: []
        };
        if (self.options.requestId) {
          config.proxy_set_header.push(`${self.options.requestId} $request_id`);
        }
        v.locationParam && Object.keys(v.locationParam).forEach((key) => {
          if (key == 'proxy_set_header') {
            let headers = v.locationParam[key];
            if (!Array.isArray(headers)) {
              headers = [headers];
            }
            config.proxy_set_header = config.proxy_set_header.concat(headers);
          } else {
            config[key] = v.locationParam[key];
          }
        });
        appRules.push([router, config]);
      } else if (v.file) {
        router = '= ' + router;
        reservedRules.push([router, {
          alias: v.file
        }]);
      } else if (v.redirect) {
        // router = '= ' + router;
        let redirect = v.redirect.startsWith('http') ? v.redirect : '$scheme://$http_host' + v.redirect;
        reservedRules.push([router, {
          return: `301 ${redirect}`
        }]);
      } else if (v.rewrite) {
        reservedRules.push([router, {
          rewrite: v.rewrite
        }]);
      } else if (v.alias) {
        appRules.push([router, v]);
      }
    });

    appRules.sort((a, b) => {
      if (a[0] > b[0]) {
        return -1;
      } else if (a[0] === b[0]) {
        return 0;
      } else {
        return 1;
      }
    });

    reservedRules.sort((a, b) => {
      if (a[0] > b[0]) {
        return -1;
      } else if (a[0] === b[0]) {
        return 0;
      } else {
        return 1;
      }
    });
    serverConfig.locations = [].concat(reservedRules, appRules);
    let ngConfig = this.stringifyServer(key, serverConfig);
    return ngConfig;
  }
  /**
   * 构建server段的配置
   *
   * cfg:
   *   listen
   *   server_name
   *   keepalive_timeout
   *   ssl_xxxxx
   *   locations: [
   *    [router, config],
   *    [router, config]
   *   ]
   *
   */
  stringifyServer(serverId, cfg) {
    let indent = 0;
    let info = [
      [indent, 'server {']
    ];
    /**
     * check value if block, if block config
     * nginx do not need semicolon
     */
    function wrapValue(value) {
      if (typeof value !== 'string') {
        return value + ';';
      }
      value = value.trim();
      if (value.startsWith('{') && value.endsWith('}')) {
        return value;
      } else {
        return value + ';';
      }
    }
    function checkValue(key, value) {
      if (typeof value !== 'string' && typeof value !== 'number') {
        let msg = 'nginx config error, do not support object config';
        msg += ` key:${key}, value: ${JSON.stringify(value)}, type: ${typeof value}`;
        return new Error(msg);
      }
    }
    Object.keys(cfg).forEach((key) => {
      let value;
      let err;
      switch (key) {
        case 'locations':
          break;
        default:
          value = cfg[key];
          if (!value) {
            if (key !== 'server_name') {
              log.warn('nginx_server_gen_config_warn', `value is empty at server:${serverId}, key: ${key}`);
            }
            return;
          } else if (Array.isArray(value)) {
            /**
             * e.g.
             * proxy_set_header xxx
             * proxy_set_header xxxx
             */
            value.forEach((eachValue) => {
              let err = checkValue(key, eachValue);
              if (err) {
                return log.error('app_ng_config_error', err);
              }
              info.push([indent + 2, `${key} ${wrapValue(eachValue)};`]);
            });
          } else {
            err = checkValue(key, value);
            if (err) {
              return log.error('app_ng_config_error', err);
            }
            info.push([indent + 2, `${key} ${wrapValue(value)}`]);
          }
      }
    });
    cfg.locations && cfg.locations.forEach((v)=>{
      let router = v[0];
      let config = v[1];
      info.push(this.stringifyLocation(router, config, indent));
    });
    info.push([indent, '}']);
    return utils.stringifyInfo(info);
  }
  stringifyLocation(router, obj, indent) {
    let info = [
      [indent + 2, `location ${router} {`],
    ];
    Object.keys(obj).forEach((key) =>{
      if (!obj[key]) {
        log.warn('nginx_location_config_warn', `value is empty at router:${router}, key: ${key}, config:${JSON.stringify(obj, null, 2)}`);
        return '';
      }
      let v = obj[key];
      if (key === 'proxy_set_header' && Array.isArray(v)) {
        v.forEach((value) => {
          info.push([indent + 4, `${key} ${value};`]);
        });
      } else {
        info.push([indent + 4, `${key} ${obj[key]};`]);
      }
    });
    info.push([indent + 2, '}']);
    return utils.stringifyInfo(info);
  }
  /**
   * save config to file
   */
  saveConfigFile(type, name, data) {
    let p = path.join(this.includePath, type, name);
    try {
      xfs.sync().save(p, data);
    } catch (e) {
      log.error('save nginx config file error', e.message);
    }
  }
  /**
   * rm all nginx configs in dir
   */
  cleanConfig() {
    let p;
    try {
      p = path.join(this.includePath, 'http');
      xfs.sync().rm(p);
      p = path.join(this.includePath, 'stream');
      xfs.sync().rm(p);
    } catch (e) {
      log.error('clean nginx config error', e.message);
    }
  }
  cleanErrorConfig() {
    /**
     * TODO
     */
  }
  backupErrorConfig() {
    let date = new Date();
    let d = date.toJSON();
    let errBackup = path.join(path.dirname(this.includePath), 'nginx_error_config');
    try {
      xfs.sync().mkdir(errBackup);
      xfs.renameSync(this.includePath, path.join(errBackup, d));
      xfs.sync().mkdir(this.includePath);
    } catch (e) {
      // 磁盘满等情况，会触发异常，得catch住
      log.error('nginx config backup faild', e.message);
    }
  }
}


module.exports = Nginx;
