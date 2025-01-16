#!/bin/sh
# $ python -m http.server $port
# $ busybox httpd -f -p $port
# ruby -run -ehttpd . -p$port
port=${1:-'8000'}
echo Server listening on $port
busybox httpd -f -v -p $port
