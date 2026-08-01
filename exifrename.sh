#!/bin/sh
exiftool -d 'IMG_%Y%m%d_%H%M%%-03.c.%%e' '-filename<CreateDate' source/original/exif/*.jpg
exiftool -d 'IMG_%Y%m%d_%H%M%%-03.c.%%e' '-filename<CreateDate' source/original/exif/*.heic
exiftool -d 'IMG_%Y%m%d_%H%M%%-03.c.%%e' '-filename<CreateDate' source/original/exif/*.jpeg
exiftool -d 'VID_%Y%m%d_%H%M%%-03.c.%%e' '-FileName<CreateDate' -ext MOV source/original/exif/*.MOV
