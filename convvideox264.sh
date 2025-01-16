#!/bin/sh

input=${1:-'input.mp4'}
ss=${2:-'00:00:00'}
to=${3:-'00:00:30'}
scale=${4:-'720'}
crf=${5:-'21'}

echo Convert video to mp4...
echo convvideox264.sh input ss to scale crf
echo convvideox264.sh $input $ss $to $scale $crf
ffmpeg -hide_banner -i "$input" -vcodec libx264 -crf $crf -vf scale=$scale:-2 -preset slow -pix_fmt yuv420p -acodec copy -sn -ss $ss -to $to "$input.mp4"
