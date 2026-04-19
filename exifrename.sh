#!/bin/sh
exiftool -d 'IMG-%Y%m%d-%H%M%%-03.c.%%e' '-filename<CreateDate' source/original/*.jpg
exiftool -d 'VID-%Y%m%d-%H%M%%-03.c.%%e' '-FileName<CreateDate' -ext MOV source/original/*.MOV
