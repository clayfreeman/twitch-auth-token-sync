#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 ]]
then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

export VERSION="$1"

# Fetch the directory where this script is located.
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]
do
  DIR=$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
done
DIR=$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)

# Create an empty artifacts directory.
rm -rf "$DIR/artifacts"
mkdir -p "$DIR/artifacts"

for TARGET in chrome firefox
do
  # Copy the source code into a target-specific directory.
  cp -r "$DIR/src" "$DIR/artifacts/$TARGET"
  envsubst < "$DIR/manifest.$TARGET.json" > "$DIR/artifacts/$TARGET/manifest.json"

  # Update the modification time of all files for this target.
  find "$DIR/artifacts/$TARGET" -exec touch -d '@0' \{\} +

  # Package the target into a reproducible archive.
  cd "$DIR/artifacts/$TARGET"
  zip -X0qr "$DIR/artifacts/$TARGET.zip" background.js manifest.json popup.html popup.js
done
