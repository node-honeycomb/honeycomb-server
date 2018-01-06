TESTS          	= $(shell find test -type f -name *.test.js)

RELEASE_DIR     = out/release/

RELEASE_COPY    = bin lib config common

BIN_NYC         = ./node_modules/.bin/nyc
BIN_MOCHA       = ./node_modules/.bin/_mocha


TESTS_ENV       = test/env.js

VERSION = $(shell cat package.json | awk -F '"' '/version" *: *"/{print $$4}')
BUILD_NO = $(shell cat package.json | awk -F '"' '/build" *: *"/{print $$4}')

default: install

clean:
	@echo 'clean ./out'
	@rm -rf ./out

parser:
	@./node_modules/.bin/pegjs -o common/nginx_config_parser.js common/nginx_config_parser.pegjs

install: clean
	@mkdir -p ./logs
	@mkdir -p ./run
	@npm install --registry=https://registry.npm.taobao.org
	@./node_modules/.bin/nodeinstall .
	@cp nginx_sample.conf nginx.conf

prepare-test: parser
	@cd example-apps && tar cfz simple-app.tgz simple-app/
	@cd example-apps && tar cfz simple-app_1.0.0_1.tgz simple-app_1.0.0_1/
	@cd example-apps && tar cfz simple-app_1.1.0_1.tgz simple-app_1.1.0_1/
	@cd example-apps && tar cfz timeout-app.tgz timeout-app/
	@cd example-apps && tar cfz benchmark-app.tgz benchmark-app/
	@cd example-apps && tar cfz notarget-app.tgz notarget-app/
	@cd example-apps && tar cfz old-app.tgz old-app/
	@cd example-apps && tar cfz illegal-app.tgz illegal-app/
	@cd example-apps && tar cfz cant-found-module.tgz cant-found-module/
	@cd example-apps && tar cfz socket-app.tgz socket-app/
	@cd example-apps && tar cfz websocket-app.tgz websocket-app/
	@cd example-apps && tar cfz socket-app_1.0.0_1.tgz socket-app_1.0.0_1/
	@cd example-apps && tar cfz socket-app_1.0.0_2.tgz socket-app_1.0.0_2/
	@cd example-apps && tar cfz https-app.tgz https-app/

test: eslint prepare-test
	@$(BIN_MOCHA) \
		--recursive \
		-t 30000 \
		-R spec \
		-r $(TESTS_ENV) \
		$(TESTS)

test2: prepare-test
	@$(BIN_MOCHA) \
		--recursive \
		-t 30000 \
		-R spec \
		-r $(TESTS_ENV) \
		$(TESTS)

test-cov:
	@rm -rf coverage
	@$(BIN_NYC) --reporter=lcov make test2
	@$(BIN_NYC) report --reporter=text-summary

codecov: install eslint prepare-test
	@rm -rf coverage
	@$(BIN_NYC) --reporter=lcovonly make test2

release-prepare:
	@echo 'Copy files'
	@mkdir -p $(RELEASE_DIR)
	@if [ `echo $$OSTYPE | grep -c 'darwin'` -eq 1 ]; then \
		cp -r $(RELEASE_COPY) $(RELEASE_DIR); \
	else \
		cp -rL $(RELEASE_COPY) $(RELEASE_DIR); \
	fi

	@cp package.json $(RELEASE_DIR)
	@cp dispatch.js $(RELEASE_DIR)

	@cd $(RELEASE_DIR) && npm install --production --registry=https://registry.npm.taobao.org
	@npm install nodeinstall --registry=https://registry.npm.taobao.org
	@cd $(RELEASE_DIR) && ../../node_modules/.bin/nodeinstall .
	@rm -rf $(RELEASE_DIR)/tests
	@rm -rf $(RELEASE_DIR)/example-apps
	@echo "all codes in \"$(RELEASE_DIR)\""

release: clean release-prepare
	@cp config/config_production.js $(RELEASE_DIR)/config/config.js
	@rm -f out/release/*.release
	@mv out/release out/honeycomb
	@cd out && tar czf honeycomb.tgz honeycomb
	@rm -rf out/honeycomb

	@mkdir out/release
	@cp bin/honeycomb_install.sh out/release
	@cp bin/honeycomb_install_admin.sh out/release
	@cp bin/assets/global_config_sample.js out/release/config.js
	@cp bin/assets/install.md out/release/
	@mv out/honeycomb.tgz out/release/

package: release

eslint:
	@rm -rf coverage
	@./node_modules/.bin/eslint .

.PHONY: install default test test2 test-cov release package eslint parser codecov
