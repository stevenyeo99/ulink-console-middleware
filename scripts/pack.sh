#!/usr/bin/env bash
# Package the middleware for the AWS server: release/ulink-console-middleware-<timestamp>.tar.gz
# Leaves out node_modules (installed on the server), .env (the server keeps its own), .git, docs, downloads.
#
# On the server:
#   tar -xvzf ulink-console-middleware-<timestamp>.tar.gz
#   cd ulink-console-middleware && cp /path/to/existing/.env .   # first time: cp .env.example .env and fill it in
#   npm ci --only=production
#   pm2 start ecosystem.config.js     # or: pm2 restart ulink-console-middleware
set -euo pipefail

cd "$(dirname "$0")/.."
name=ulink-console-middleware
out="release/${name}-$(date +%Y%m%d-%H%M).tar.gz"
mkdir -p release

# --transform puts every file under ulink-console-middleware/ inside the archive.
tar -czf "$out" --transform "s,^,${name}/," \
  src package.json package-lock.json ecosystem.config.js .nvmrc .env.example README.md

echo "Created $out"
tar -tzf "$out"
