mvn clean package -Dmaven.test.skip=true
scp target/netty-http-server.jar APP-META/netty-demo_0.0.1_6/
cd APP-META
tar cfz netty-demo_0.0.1_6.tgz netty-demo_0.0.1_6
