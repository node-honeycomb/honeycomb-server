#!/bin/bash
# $1 install prefix
# $2 install admin token

BASE=$(cd "$(dirname "$0")"; pwd)
ROOT=/home/admin/honeycomb
if [ "$1" ]; then
  ROOT=$1;
fi

echo "========= ENV ========="
echo "source dir: $BASE"
echo "install dir: $ROOT"
echo '======================='

## create user if not exists
# test -d /home/$USER || adduser $USER
## init dir

test -d $ROOT || mkdir -p $ROOT
mkdir -p $ROOT/target
mkdir -p $ROOT/bin
mkdir -p $ROOT/conf
mkdir -p $ROOT/logs

## prepare code pkg
echo ">>>>>> move honeycomb.tgz to target"
cp $BASE/honeycomb.tgz $ROOT/target
cd $ROOT/target

## untar package for default_config init
echo ">>>>>> untar honeycomb.tgz"
tar xfz ./honeycomb.tgz
# ls -alh ./
# echo ">>>>>> server files: "
# ls -alh ./honeycomb

## init config file
if [ ! -f $ROOT/conf/config_default.js ]; then
  cp ./honeycomb/bin/assets/global_config_sample.js $ROOT/conf/config_default.js
  node ./honeycomb/bin/gen_config.js $ROOT/conf/config_default.js $2
fi

## init bin script
cp ./honeycomb/bin/assets/server_ctl $ROOT/bin/

cp ./honeycomb/bin/assets/install.md $ROOT/bin/

cp ./honeycomb/bin/assets/crontab_clear_logs $ROOT/bin/

cp ./honeycomb/bin/gen_pwd $ROOT/bin/

export PATH=$ROOT/target/honeycomb/node_modules/.bin/:$PATH

echo "=== SUCCESS ==="
echo "  if no nodejs installed in your system"
echo "  please export node to your path:"
echo "  >  export PATH=$ROOT/target/honeycomb/node_modules/.bin/:\\$PATH"
echo "==============="


# out/release/honeycomb
#   install.sh
#   honeycomb.tgz
#   readme.md


# /home/admin/honeycomb/
#   bin/
#     server_ctl restart|stop|....|upgrade
#   conf/
#     config.js
#   logs/

#   target/
#     honeycomb.tgz
#     honeycomb/
