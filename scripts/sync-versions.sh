#!/bin/bash
# Sync version from root package.json to all packages

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(jq -r '.version' "$ROOT_DIR/package.json")

echo "Syncing version $VERSION to all packages..."

# Sync to extension package.json
jq --arg v "$VERSION" '.version = $v' "$ROOT_DIR/apps/extension/package.json" > tmp.json
mv tmp.json "$ROOT_DIR/apps/extension/package.json"

# Sync to wxt.config.ts (manifest version)
sed -i '' "s/version: '.*'/version: '$VERSION'/" "$ROOT_DIR/apps/extension/wxt.config.ts"

# Sync to server Cargo.toml
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT_DIR/apps/server/Cargo.toml"

echo "Done."
