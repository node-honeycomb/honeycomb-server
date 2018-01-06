# honeycomb-server

honeycomb-server is a micro web-app container for Node.js app.


## 简介

honeycomb-server是一个Node.js web应用的运行容器，每个应用以独立进程运行。

* app发布、下线、reload、版本切换
* 支持路径级别的路由，为微应用模式提供便利
* 配置管理，方便环境适配和线上切换
* 监控集成：app级别的简单监控，更可以集成alinode
* 日志查看：方便日常运维，集群、单机、时序、高亮、搜索
* 可编程：http api，方便编程实现自动化
* 高性能、高可用：与nginx紧密配合

honeycomb-server默认使用

详细文档: http://node-honeycomb.github.io/

### 参与贡献代码

* clone代码之后, 工程代码由Makefile管理

```sh
> make install  # init dev env
> make test # run test case
```

更多命名请查看Makefile

* honeycomb-server的代码结构说明：

```
server/
      |- bin # 工具
      |- config # 配置目录
      |- common # 一些公共方法
      |- example-apps # 测试用的app
      |- lib/
            |- admin   # ADMIN进程代码，所有的API在此通过9999端口提供
            |- proxy   # 代理层的代码， nginx操作以及node实现的代理
            |- child   # app管理器，负责fork进程
            |- master  # 主服务
            |- message # 消息类，进程间的IPC调用封装
            |- run     # app代码引导器，child fork执行，app由这个脚本引导启动
            |- session # 运行状态持久化用
      |- test  # 测试代码
      |- dispatch.js # 服务主入口
      |- nginx_sample.conf # 测试用的nginx配置 
      |- Makefile # 构建命令
```



## License

MIT