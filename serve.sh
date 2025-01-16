#!/bin/sh
# $ python -m http.server 8000
# $ busybox httpd -f -p 8000
port=${1:-'8000'}
echo Server listening on $port
ruby -run -ehttpd . -p$port
