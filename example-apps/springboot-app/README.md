### 工程简介
支持发布在honeycomb-server上的 springboot工程demo

springboot版本 ‎2.1.1.release

### 工程配置
1. 添加honeycomb里netty-starter的maven依赖
```xml
   <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.honeycomb.tools</groupId>
                <artifactId>netty-starter</artifactId>
                <version>1.0-SNAPSHOT</version>
            </dependency>
        </dependencies>
    </dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.honeycomb.tools</groupId>
            <artifactId>netty-starter</artifactId>
        </dependency>
    </dependencies>
```

2. 添加 `scanBasePackages`在springboot启动项里添加需要配置扫描包，配置规则如下:

```java
@SpringBootApplication(scanBasePackages = {"com.honeycomb.tools","your.package.name"})
@EnableScheduling
public class SampleSimpleApplication extends SpringBootServletInitializer {

	public SampleSimpleApplication() {
	}

	protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
		return application.sources(new Class[]{SampleSimpleApplication.class});
	}

	public static void main(String[] args) {
		SpringApplication.run(SampleSimpleApplication.class, args);
	}

}
```

3. 本地运行需要配置application.properties里的监听端口号，并设置端口号监听enable。
注意事项hc-server上此配置需要禁用
```text
server.port.enable=true
server.port=9091
```


### 打包发布

   示例见 deploy里的netty-demo_0.0.1_6

1、配置package.json
```json
{
  "name":"netty-demo",                      //应用名
  "version":"0.0.1",                        //版本号
  "build": 6,                               //构建号
  "main": "./netty-http-server.jar",        //入口jar包
  "honeycomb": {
    "processorNum": 1,
    "service": {
      "router":"/netty-demo",               //全局路由，如果设置，需要在application.properties里设置
      "exec": "java",
      "argv": ["-jar", "${main}"],
      "serverName": "localhost",
      "type": "http",
      "bind": "9091"                        //服务端口号
    }
  }
}
```
2、本地打包

  首先将jar包和package.json放在name_version_build目录下，例如 netty-demo_0.0.1_6

  并将name_version_build目录打包成name_version_build.tgz，例如 netty-demo_0.0.1_6

3、发布
  在honeycomb-console手动发布tgz包即可




