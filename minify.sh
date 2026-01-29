#!/bin/sh

# minify js
node vendor/uglifyjs/bin/uglifyjs asset/js/cache/lsc.js asset/js/arc/arc.es5.js asset/js/crypto/crypto-js.js asset/js/zlib/pako_inflate.es5.js asset/js/app/app.js -c -m --ie -o asset/js/app.bundle.min.js
# cat asset/js/cache/lsc.js asset/js/arc/arc.es5.js asset/js/crypto/crypto-js.js asset/js/zlib/pako_inflate.es5.js asset/js/app/app.js > asset/js/app.bundle.min.js

# minify jxl
node vendor/uglifyjs/bin/uglifyjs asset/js/jxl/jxl_dec.js -c -m --ie -o asset/js/jxl/jxl_dec.min.js

# minify css
#ruby -e "puts File.read('./asset/css/app.css').gsub(/[\n|\r]/,' ').gsub(/\s+/,' ').gsub(/(;|:|,|{|}|>) /,'\1').gsub(/(;| )({|}|>)/,'\2').strip" > ./asset/css/app.min.css
node minifycss.js ./asset/css/app.css ./asset/css/app.min.css
