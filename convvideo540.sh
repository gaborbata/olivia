#!/bin/sh

input=${1:-'input.mp4'}
ss=${2:-'00:00:00'}
to=${3:-'00:02:00'}
scale=${4:-'540'}
crf=${5:-'34'}

echo Convert video to webm...
echo convvideo.sh input ss to scale crf
echo convvideo.sh $input $ss $to $scale $crf
rm ffmpeg2pass*.log
ffmpeg -hide_banner -i "$input" -pass 1 -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 640k -minrate 320k -maxrate 928k -crf $crf -vf scale=$scale:-2 -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.sd.webm" && \
ffmpeg -hide_banner -i "$input" -pass 2 -y -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 640k -minrate 320k -maxrate 928k -crf $crf -vf scale=$scale:-2 -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.sd.webm" && \
rm ffmpeg2pass*.log
