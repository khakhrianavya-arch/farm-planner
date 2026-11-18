#!/bin/sh
# Copy the live app into beta/ so a new feature can be built and tried there first.
set -e
cd "$(dirname "$0")/.."
rm -rf beta && mkdir beta
cp -r index.html css js beta/
echo "beta/ now matches the live version"
