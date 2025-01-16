#!/bin/sh

confirm() {
  local prompt="${1:-Continue?} [y/N]: "
  local input
  while true; do
    printf "%s" "$prompt"
    read input
    case "$input" in
      [yY]*)
        return 0
        ;;
      [nN]*|'')
        return 1
        ;;
      *)
        echo "Invalid input. Please answer 'y' or 'n'." >&2
        ;;
    esac
  done
}

if [ "$1" = "download" ]; then
  echo "*** download files"
  rclone copy -v -c r2:livike asset/content
  echo "*** decrypt files"
  sh crypt.sh dec
  cp -v ./source/decrypted/images.json ./source/images.json
  cp -v ./source/decrypted/app.json ./source/app.json
elif [ "$1" = "sync" ]; then
  if confirm "Are you sure you want to sync all files?"; then
    echo "*** sync files"
    rclone sync -v -c asset/content r2:livike
  else
    echo "*** sync cancelled"
  fi
elif [ "$1" = "dryrun" ]; then
  echo "*** dry run sync files"
  rclone sync -v -c --dry-run asset/content r2:livike
else
  echo "Invalid command specified: '$1'"
  echo "Usage: r2sync.sh [download|sync|dryrun]"
fi
