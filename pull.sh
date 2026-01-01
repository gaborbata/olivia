#!/bin/sh
git pull
sh r2sync.sh download
sh crypt.sh dec
cp -v ./source/decrypted/images.json ./source/images.json
cp -v ./source/decrypted/app.json ./source/app.json
