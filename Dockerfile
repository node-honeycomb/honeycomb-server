FROM centos:7
RUN yum install perl -y && curl --location https://raw.githubusercontent.com/node-honeycomb/honeycomb-server-rpm/master/SCRIPTS/setup_stable.sh |  bash -
CMD [ "cd /home/admin/honeycomb && su admin -c \"./bin/server_ctl start\"" ]