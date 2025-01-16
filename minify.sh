#!/bin/sh

# minify js
node vendor/uglifyjs/bin/uglifyjs asset/js/lsc.js asset/js/crypto-js.js asset/js/app.js -c -m --ie -o asset/js/app.bundle.min.js
# cat asset/js/lsc.js asset/js/crypto-js.js asset/js/app.js > asset/js/app.bundle.min.js

# minify jxl
node vendor/uglifyjs/bin/uglifyjs asset/js/jxl/jxl_dec.js -c -m --ie -o asset/js/jxl/jxl_dec.min.js

# minify css
ruby -e "puts File.read('./asset/css/app.css').gsub(/[\n|\r]/,' ').gsub(/\s+/,' ').gsub(/(;|:|,|{|}|>) /,'\1').gsub(/(;| )({|}|>)/,'\2').strip" > ./asset/css/app.min.css
