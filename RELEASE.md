#### v1.2.2_1

##### Feature
* 新增coredump文件的详细信息，方便调试

##### Fix
* 修复test冲突
* 修复lodash安全问题


#### v1.2.1_1

##### Feature
* 支持启动时自动解压app的tgz包

##### Fix
* 修复server proxy 默认配置bug

#### v1.2.0_1

##### Feature
* 支持ipv6监听 
* 支持nginx stream(>= nginx 1.9.0)代理, 默认socket服务代理改为nginx

##### Fix
* 修复service类型的app异常 retry无法访问的bug

#### v1.1.0_1

##### Feature:
* 支持端口监听模式的应用，类似sock文件，端口由服务端分配
