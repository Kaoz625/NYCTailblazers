#!/bin/bash
set -e
echo "→ Pulling latest changes..."
git -C "$(dirname "$0")/.." pull origin claude/hermes-3d-build-bfb7F

echo "→ Cleaning stale node_modules..."
rm -rf "$(dirname "$0")/node_modules"

echo "→ Installing dependencies..."
cd "$(dirname "$0")" && npm install

echo ""
echo "✅ Setup complete. Now run:"
echo "   npm run demo-gateway &"
echo "   npm run dev"
