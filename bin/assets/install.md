# Honeycomb Server

简单可靠的node.js 微应用托管服务.

## 安装部署

### 1. 环境要求
* 系统
  - CentOS 7
  - 管理员账户(admin)

其他linux发型版本亦可，能运行Node.js 即可并无太多限制

### 2. 获取安装包

安装包文件名： `honeycomb-server_${version}_${buildNumber}.tgz`

- 如： `honeycomb-server_2.2.1_2.tgz`

### 3. 上传至服务器后解压

- `tar zxf honeycomb-server_${version}_${buildNumber}.tgz`

得到`honeycomb-server`文件夹，包含如下文件列表:

```
cd honeycomb-server
ls
config.js honeycomb_install_admin.sh  honeycomb_install.sh  honeycomb.tgz  install.md
```

#### 3. 安装honeycomb-server
- 在`honeycomb-server`目录下执行 `./honeycomb_install.sh`
- 命令完成后会在`/home/admin`目录下生成`honeycomb`目录
```
cd /home/admin/honeycomb
ls
bin    conf   logs   run    target
```

如果需要指定目录安装，请使用：
```
./honeycomb_install.sh /home/$your_path  $linux_username
```

如果有系统的root权限，可以使用一键安装并启动服务, 默认使用admin账号：
```
./honeycomb_install_admin.sh
```


推荐使用 honeycomb_install_admin.sh 部署运行在admin账号下

#### 4. 修改全局配置文件
- 第三步安装成功后，`/home/admin/honeycomb/conf` 目录下会有个文件： `config_default.js` 

config_default.js 为系统默认配置，请不要修改。
*** 注意：定制配置，可复制default配置文件为 config.js, 修改config.js即可 ***



#### 5. 启动/停止/重启 honeycomb-server
```
cd /home/admin/honeycomb
./bin/server_ctl start|stop|restart
```

#### 6. 安装控制台

默认启动的服务，是不带控制台的app的。但是带有一个简单的控制台
访问 http://$server_ip:9999/, 可以看到安装界面。

发布界面上的用户名密码，在 config.js 中 admin 配置段中。

从这个界面可以简单的完成本机的控制台app安装。
通过这个控制台，你就可以搭建集群了。

*** 注意：安装完成console之后，强烈建议根据提示关闭9999这个发布界面 ***

#### 6. 应用发布，管理

- 访问 `http://slb_ip:9999/` honeycomb 后台管理系统

#### 日志文件目录
```
/home/admin/honeycomb/logs
```
- server.YYYY-MM-DD.log 正常日志，排查server是否启动成功，app是否发布成功.
- nodejs_stdout.log 异常日志.
- ${app_name}/sys.YYYY-MM-DD.log  app的业务日志.和framework的日志.
