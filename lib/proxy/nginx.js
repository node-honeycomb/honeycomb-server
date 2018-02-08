'use strict';

const fs = require('xfs');
const _ = require('lodash');
const child = require('child_process');
const path = require('path');
const xfs = require('xfs');
const log = require('../../common/log');
const utils = require('../../common/utils');
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
  max_fails: 2,
  fail_timeout: '10s',
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
   *
   */
  constructor(options) {
    super();
    this.init(options);
  }
  init(options) {
    this.options = options;
    this.binPath = options.nginxBin;
    this.configPath = options.nginxConfig;
    this.prefixPath = options.nginxPrefix;
    this.includePath = options.nginxIncludePath;

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
    this.configWatcher = fs.watch(this.configPath, (event) => {
      if (event === 'change') {
        log.warn('nginx_config_changed, re-init config file');
        this.initConfig();
      }
    });
    this.initConfig();
  }
  exit() {
    super.exit();
    fs.unwatchFile(this.configPath);
    this.configWatcher.close();
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
      log.error('nginx_config_parse_error, please report nginx config by creating a issue', e);
      return;
    }
    let httpInsertNodeOffset = null;
    // let streamInsertNodeOffset = 0;
    let flagHttpWSConfig = false;
    let flagHttpInclude = false;
    // let flagStreamInclude = false;
    let httpIncludePath = path.join(this.includePath, 'http/*.conf');
    // let streamIncludePath = path.join(this.includePath, 'stream/*.conf')

    ast.statements.forEach((node) => {
      // check http block
      if (node.key === 'http') {
        let stms = node.block.statements;
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
        log.error('nginx not yet support stream proxy');
      }
    });

    if (!httpInsertNodeOffset) {
      log.error('nginx_inject_flag_miss', 'please inset nginx.conf single line comment `# @honeycomb` at http section');
      return;
    }
    let indent = httpInsertNodeOffset.loc.start.column;
    let injectHttp = [];
    if (!flagHttpWSConfig) {
      injectHttp.push([indent, 'map $http_upgrade $connection_upgrade {default upgrade;"" close;}']);
      injectHttp.push([indent, 'proxy_set_header Upgrade $http_upgrade;']);
      injectHttp.push([indent, 'proxy_set_header Connection $connection_upgrade;']);
    }

    if (!flagHttpInclude) {
      injectHttp.push([indent, `include ${httpIncludePath};`]);
    }

    // do inject
    if (injectHttp.length) {
      injectHttp.unshift('');
      let d = httpInsertNodeOffset.loc.end.offset;
      let cfgHead = code.substr(0, d);
      let cfgEnd = code.substr(d);
      code = cfgHead + utils.stringifyInfo(injectHttp) + cfgEnd;
      fs.writeFileSync(this.configPath, code, 'utf8');
    }


    process.nextTick(() => {
      this.emit('ready');
    });
  }
  /**
   * 更新路由
   * @public
   */
  updateRouter(callback) {
    super.updateRouter();
    this.updateConfig(callback);
  }
  updateConfig(done) {
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
        backupSockList: []
      }
      */
      let app = map[appName];

      let binds = this.prepareBind(app, this.options);
      let ngConfig;
      let defaultKey;

      switch (app.type) {
        case 'socket':
        case 'stream':
          // ngConfig = config.stream;
          // TODO stream config
          log.error(FLAG_NGINX, 'nginx not yet support stream proxy');
          break;
        default:
          ngConfig = config.http;
          ngConfig.upStreams['honeycomb_' + appName] = {
            main: app.sockList,
            backup: app.backupSockList
          };
          defaultKey = this.options.ip + ':' + this.options.port + '_*';
          binds.forEach((v) => {
            /**
             * v
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
                let defaultServer = key === defaultKey;
                ngConfig.servers[key] = {
                  listen: {
                    ip: v.ip || '*',
                    port: v.port,
                    default: defaultServer ? 'default' : ''
                  },
                  serverName: serverName === '*' ? '' : serverName,
                  locations: {},
                  param: v.param || {}
                };
                if (defaultServer) {
                  ngConfig.servers[key].locations[this.options.healthCheck.router] = {
                    file: this.options.healthCheck.file
                  };
                  if (this.options.index) {
                    ngConfig.servers[key].locations['/'] = {
                      redirect: this.options.index
                    };
                  }
                }
              }
              if (v.param && v.param.server && v.param.server.ssl_certificate) {
                ngConfig.servers[key].listen.ssl = 'ssl';
              } else {
                ngConfig.servers[key].listen.ssl = '';
              }

              let tmp = ngConfig.servers[key];
              if (v.param) {
                tmp.param = _.merge(tmp.param, v.param);
              }

              let router = v.router;
              tmp.locations[router] = {
                proxyPass: 'honeycomb_' + appName
              };
            });
          });

          if (!ngConfig.servers[defaultKey]) {
            let defaultServerCfg = {
              listen: {
                ip: this.options.ip,
                port: this.options.port,
                default: 'default',
                ssl: ''
              },
              serverName: [],
              locations: {}
            };
            defaultServerCfg.locations[this.options.healthCheck.router] = {
              file: this.options.healthCheck.file
            };
            ngConfig.servers[defaultKey] = defaultServerCfg;
            if (this.options.index) {
              ngConfig.servers[defaultKey].locations['/'] = {
                redirect: this.options.index
              };
            }
          }
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
    this.flagReload = true;
    let cmdCheck = this.binPath + ' -t -c ' + this.configPath;
    let cmdReload = this.binPath + ' -s reload -c ' + this.configPath +
      (this.prefixPath ? ' -p ' + this.prefixPath : '');
    child.exec(cmdCheck, (err, stdout, stderr) => {
      if (err) {
        log.error(FLAG_NGINX, 'nginx_config_error ', stderr.toString());

        if (!this.flagRollBack) {
          this.flagRollBack = true;
          this.backupErrorConfig();
          this.rollback();
        }
        return callback && callback(new Error('nginx reload failed, config error:' + err));
      }
      child.exec(cmdReload, (err, stdout, stderr) => {
        if (err) {
          err.message += ' ' + stderr.toString();
          if (!this.flagRollBack) {
            log.error(FLAG_NGINX, 'nginx_reload_error', err);
            this.flagRollBack = true;
            this.backupErrorConfig();
            return this.rollback(() => {
              callback(err);
            });
          } else {
            log.error(FLAG_NGINX, 'nginx_rollback_config_failed', err);
          }
        } else {
          this.flagRollBack = false;
        }
        callback && callback(err);
      });
    });
  }
  /**
   * write nginx config;
   */
  flushConfig(config) {
    this.cleanConfig();
    // gen http Config
    let httpConfig = config.http;
    let upStreamsConfig = [];
    Object.keys(httpConfig.upStreams).forEach((key) => {
      let cfg = httpConfig.upStreams[key];
      upStreamsConfig.push(this.genUpStreamConfig(key, cfg));
    });
    // save to file;
    this.saveConfigFile('http', 'all_upstream.conf', upStreamsConfig.join('\n'));

    Object.keys(httpConfig.servers).forEach((key) => {
      let cfg = httpConfig.servers[key];
      this.saveConfigFile('http', 'server_' + key + '.conf', this.genServerConfig(key, cfg));
    });
  }
  /**
   * 创建 upstream 配置段
   * @return {[type]} [description]
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
          str.push('\tserver unix:' + v + ';');
        });
        cfg.backup && cfg.backup.forEach((v) => {
          str.push('\tserver unix:' + v + ' backup;');
        });
        str.push(`\tcheck ${upstreamCheck.check};`);
        str.push(`\tcheck_keepalive_requests ${upstreamCheck.check_keepalive_requests};`);
        str.push(`\tcheck_http_send ${upstreamCheck.check_http_send};`);
        str.push(`\tcheck_http_expect_alive ${upstreamCheck.check_http_expect_alive};`);
        break;
      default:
        cfg.main.forEach((v) => {
          str.push(`\tserver unix:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout};`);
        });
        cfg.backup && cfg.backup.forEach((v) => {
          str.push(`\tserver unix:${v} max_fails=${upstreamCheck.max_fails} fail_timeout=${upstreamCheck.fail_timeout} backup;`);
        });
        break;
    }

    str.push('}');
    return str.join('\n');
  }

  genServerConfig(key, cfg) {
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
    /** prepare listen */
    let listen = `${cfg.listen.ip}:${cfg.listen.port} ${cfg.listen.ssl} ${cfg.listen.default}`;
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

    if (cfg.param) {
      if (cfg.param.server) {
        Object.keys(cfg.param.server).forEach((key) => {
          serverConfig[key] = cfg.param.server[key];
        });
      }
    }
    /**
     * sort locations
     */
    let appRules = [];
    let reservedRules = [];
    Object.keys(cfg.locations).forEach((router) => {
      let v = cfg.locations[router];
      if (v.proxyPass) {
        let config = {
          proxy_http_version: '1.1',
          proxy_pass: `http://${v.proxyPass}`
        };
        if (cfg.param && cfg.param.location) {
          Object.keys(cfg.param.location).forEach((key) => {
            // TODO
            if (key === undefined) {
              return;
            }
            config[key] = cfg.param.location[key];
          });
        }
        appRules.push([router, config]);
      } else if (v.file) {
        router = '= ' + router;
        reservedRules.push([router, {
          alias: v.file
        }]);
      } else if (v.redirect) {
        router = '= ' + router;
        let redirect = v.redirect.startsWith('http') ? v.redirect : '$scheme://$http_host' + v.redirect;
        reservedRules.push([router, {
          return: `301 ${redirect}`
        }]);
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
    cfg.locations.forEach((v)=>{
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
        return;
      }
      info.push([indent + 4, `${key} ${obj[key]};`]);
    });
    info.push([indent + 2, '}']);
    return utils.stringifyInfo(info);
  }
  /**
   * save config to file
   */
  saveConfigFile(type, name, data) {
    let p = path.join(this.includePath, type, name);
    xfs.sync().save(p, data);
  }
  /**
   * rm all nginx configs in dir
   */
  cleanConfig() {
    let p;
    p = path.join(this.includePath, 'http');
    xfs.sync().rm(p);
    p = path.join(this.includePath, 'stream');
    xfs.sync().rm(p);
  }
  cleanErrorConfig() {
    /**
     * TODO
     */
  }
  backupErrorConfig() {
    let date = new Date();
    let d = date.toLocaleString().replace(/ /g, '_') + '_' + date.getMilliseconds();
    let errBackup = path.join(path.dirname(this.includePath), 'nginx_error_config');
    xfs.sync().mkdir(errBackup);
    xfs.renameSync(this.includePath, path.join(errBackup, d));
    xfs.sync().mkdir(this.includePath);
  }
}


module.exports = Nginx;
