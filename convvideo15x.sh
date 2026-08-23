#!/bin/sh

input=${1:-'input.mp4'}
ss=${2:-'00:00:00'}
to=${3:-'00:01:00'}
scale=${4:-'720'}
crf=${5:-'32'}

echo Convert video to webm...
echo convvideo.sh input ss to scale crf
echo convvideo.sh $input $ss $to $scale $crf
rm ffmpeg2pass*.log
ffmpeg -hide_banner -i "$input" -pass 1 -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 1620k -minrate 810k -maxrate 2430k -crf $crf -vf scale=$scale:-2 -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.hd15x.webm" && \
ffmpeg -hide_banner -i "$input" -pass 2 -y -vcodec libvpx-vp9 -deadline good -cpu-used 0 -pix_fmt yuv420p -b:v 1620k -minrate 810k -maxrate 2430k -crf $crf -vf scale=$scale:-2 -ac 1 -acodec libopus -b:a 32k -sn -ss $ss -to $to "$input.hd15x.webm" && \
rm ffmpeg2pass*.log
