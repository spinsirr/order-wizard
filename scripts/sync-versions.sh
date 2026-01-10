#!/bin/bash
# Sync version from root package.json to all packages

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(jq -r '.version' "$ROOT_DIR/package.json")

echo "Syncing version $VERSION to all packages..."

# Sync to extension package.json
jq --arg v "$VERSION" '.version = $v' "$ROOT_DIR/apps/extension/package.json" > tmp.json
mv tmp.json "$ROOT_DIR/apps/extension/package.json"

# Sync to extension manifest.json
jq --arg v "$VERSION" '.version = $v' "$ROOT_DIR/apps/extension/public/manifest.json" > tmp.json
mv tmp.json "$ROOT_DIR/apps/extension/public/manifest.json"

# Sync to server Cargo.toml
sed -i "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT_DIR/apps/server/Cargo.toml"

echo "Done."
