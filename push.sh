#!/bin/sh
git add .
git commit -m "feat: update $(date -I)"
git push
sh r2sync.sh sync
