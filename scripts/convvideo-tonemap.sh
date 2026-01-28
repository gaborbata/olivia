#!/bin/sh

input=${1:-'input.mp4'}
ss=${2:-'00:00:00'}
to=${3:-'00:00:30'}
scale=${4:-'720'}
crf=${5:-'31'}

echo Convert video to webm with tone mapping...
echo convvideo-tonemap.sh input ss to scale crf
echo convvideo-tonemap.sh $input $ss $to $scale $crf
rm ffmpeg2pass*.log
ffmpeg -hide_banner -i "$input" -pass 1 -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 1080k -minrate 540k -maxrate 1566k -crf $crf -vf scale=$scale:-2,zscale=transfer=linear,tonemap=bt.2390,zscale=transfer=bt709,format=yuv420p -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.webm" && \
ffmpeg -hide_banner -i "$input" -pass 2 -y -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 1080k -minrate 540k -maxrate 1566k -crf $crf -vf scale=$scale:-2,zscale=transfer=linear,tonemap=bt.2390,zscale=transfer=bt709,format=yuv420p -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.webm" && \
rm ffmpeg2pass*.log
