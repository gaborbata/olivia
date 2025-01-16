#!/bin/sh
git pull
sh crypt.sh dec
cp -v ./source/decrypted/images.json ./source/images.json
cp -v ./source/decrypted/app.json ./source/app.json
