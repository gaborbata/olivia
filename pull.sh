#!/bin/sh
git pull
sh r2sync.sh download
sh crypt.sh dec
cp -v ./source/archive/images.json ./source/images.json
cp -v ./source/archive/app.json ./source/app.json
