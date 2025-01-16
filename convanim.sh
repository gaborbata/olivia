#!/bin/sh
input=${1:-'input.mp4'}
ss=${2:-'00:00:00'}
to=${3:-'00:00:08'}
scale=${4:-'360'}
quality=${5:-'50'}
fps=${6:-'30'}

echo Convert video to animated webp...
echo convanim.sh input ss to scale quality fps
echo convanim.sh $input $ss $to $scale $quality $fps
ffmpeg -hide_banner -i "$input" -vcodec libwebp -loop 0 -an -quality $quality -compression_level 6 -vf fps=fps=$fps,scale=$scale:-1 -ss $ss -to $to "$input.webp"
