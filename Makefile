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

travis-install: clean
	@mkdir -p ./logs
	@mkdir -p ./run
	@npm install
	@npm install node@8.9.4
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
	@cd example-apps && tar cfz noenter-app.tgz noenter-app/
	@cd example-apps && tar cfz norun-app.tgz norun-app/
	@cd example-apps && tar cfz cant-found-module.tgz cant-found-module/
	@cd example-apps && tar cfz socket-app.tgz socket-app/
	@cd example-apps && tar cfz websocket-app.tgz websocket-app/
	@cd example-apps && tar cfz socket-app_1.0.0_1.tgz socket-app_1.0.0_1/
	@cd example-apps && tar cfz socket-app_1.0.0_2.tgz socket-app_1.0.0_2/
	@cd example-apps && tar cfz https-app.tgz https-app/
	@cd example-apps && tar cfz exception-retry-app.tgz exception-retry-app/
	@cd example-apps && tar cfz reload-app_1.0.0_1.tgz reload-app_1.0.0_1/
	@cd example-apps && tar cfz java-app.tgz java-app/

test: eslint prepare-test
	@$(BIN_MOCHA) \
		--recursive \
		--exit \
		-t 30000 \
		-R spec \
		-r $(TESTS_ENV) \
		$(TESTS)
	@rm -rf ./config/config.js

test2: prepare-test
	@$(BIN_MOCHA) \
		--recursive \
		--exit \
		-t 30000 \
		-R spec \
		-r $(TESTS_ENV) \
		$(TESTS)
	@rm -rf ./config/config.js

test-cov:
	@rm -rf coverage
	@./node_modules/.bin/istanbul cover \
	  -x 'config/config.js' \
	  -x 'common/nginx_config_parser.js' \
	  --include-pid \
		--reporter=lcov \
		./node_modules/mocha/bin/_mocha --\
		--recursive \
		--exit \
		-t 30000 \
		-R spec \
		-r ./test/env.js \
		$(TESTS)
	@./node_modules/.bin/istanbul report --reporter=lcovonly
	@rm -rf ./config/config.js

codecov:travis-install eslint prepare-test test-cov

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

tag:
	@git tag v${VERSION}_${BUILD_NO}

eslint:
	@rm -rf coverage
	@./node_modules/.bin/eslint .

.PHONY: tag install default test test2 test-cov release package eslint parser codecov travis-install
