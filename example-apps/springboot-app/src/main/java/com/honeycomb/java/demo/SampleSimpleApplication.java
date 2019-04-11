package com.honeycomb.java.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 需要配置扫描包
 * 配置规则如下
 * @SpringBootApplication(scanBasePackages = {"com.honeycomb.tools", "your.package.name"})
 */
@SpringBootApplication(scanBasePackages = {"com.honeycomb.tools","com.honeycomb.java.demo"})
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
