#!/bin/sh
# After testing at /beta/, make the test version the live version.
set -e
cd "$(dirname "$0")/.."
[ -f beta/index.html ] || { echo "No beta/ version to promote"; exit 1; }
node tests/run.mjs
rm -rf css js
cp -r beta/index.html beta/css beta/js .
echo "Live version now matches beta/. Commit and push to publish."
