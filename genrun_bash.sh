#!/usr/bin/env bash

TARGET_DIR="source/original"
OUTPUT_FILE="run_convvideo.sh"

shopt -s nullglob

files=( "$TARGET_DIR"/*.mp4 "$TARGET_DIR"/*.mkv "$TARGET_DIR"/*.MOV )

> "$OUTPUT_FILE"

for file in "${files[@]}"; do
    echo "Add $file..."
    echo "convvideo.sh \"$file\" 00:00:00 00:01:00" >> "$OUTPUT_FILE"
done

echo "Generated commands written to $OUTPUT_FILE"
