#!/bin/sh

COMMAND="$1"
shift

if [ "$COMMAND" = "pull" ]; then
  sh pull.sh
elif [ "$COMMAND" = "push" ]; then
  sh push.sh
elif [ "$COMMAND" = "crypt" ]; then
  sh crypt.sh "$@"
elif [ "$COMMAND" = "conv" ]; then
  sh convimages.sh "$@"
elif [ "$COMMAND" = "anim" ]; then
  sh convanim.sh "$@"
elif [ "$COMMAND" = "video" ]; then
  sh convvideo.sh "$@"
elif [ "$COMMAND" = "video540" ]; then
  sh convvideo540.sh "$@"
elif [ "$COMMAND" = "minify" ]; then
  sh minify.sh
elif [ "$COMMAND" = "serve" ]; then
  sh serve.sh "$@"
else
  echo "Invalid command specified: '$COMMAND'"
  echo "Usage: app [pull|push|crypt|conv|anim|video|video540|minify|serve]"
fi
