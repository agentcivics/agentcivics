#!/usr/bin/env bash
# Locally preview the full site layout (landing + app + docs + deployments).
# Mirrors what .github/workflows/pages.yml produces on GitHub Pages.
#
# Usage:
#   ./scripts/preview-site.sh             # serves on http://localhost:8081
#   ./scripts/preview-site.sh 9000        # serves on http://localhost:9000
#   ./scripts/preview-site.sh --skip-docs # don't build docs (faster)

set -e
cd "$(dirname "$0")/.."

PORT="8080"
SKIP_DOCS=""
for arg in "$@"; do
  case "$arg" in
    --skip-docs) SKIP_DOCS=1 ;;
    [0-9]*) PORT="$arg" ;;
  esac
done

SITE_DIR="_site"

echo ">>> Cleaning _site/"
rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR"

# 1. Landing page at root
if [ -d landing ]; then
  echo ">>> Staging landing/ → _site/"
  cp -r landing/. "$SITE_DIR/"
fi

# 2. Dapp at /app/
echo ">>> Staging frontend/ → _site/app/"
mkdir -p "$SITE_DIR/app"
cp -r frontend/. "$SITE_DIR/app/"

# 3. Docs at /docs/
if [ "$SKIP_DOCS" = "1" ]; then
  echo ">>> Skipping docs build (--skip-docs)"
elif [ -f docs/package.json ] && [ -d docs/.vitepress ]; then
  echo ">>> Building VitePress docs..."
  pushd docs > /dev/null
  if [ ! -d node_modules ]; then
    echo "    Installing dependencies (first run, may take ~30s)..."
    npm install --no-audit --no-fund || {
      echo "    npm install failed — falling back to raw markdown copy"
      popd > /dev/null
      mkdir -p "$SITE_DIR/docs"
      cp -r docs/. "$SITE_DIR/docs/"
      SKIP_DOCS_COPY=1
    }
  fi
  if [ -z "$SKIP_DOCS_COPY" ]; then
    npm run build || {
      echo "    VitePress build failed — falling back to raw markdown copy"
      popd > /dev/null
      mkdir -p "$SITE_DIR/docs"
      cp -r docs/. "$SITE_DIR/docs/"
      SKIP_DOCS_COPY=1
    }
  fi
  if [ -z "$SKIP_DOCS_COPY" ]; then
    popd > /dev/null
    mkdir -p "$SITE_DIR/docs"
    cp -r docs/.vitepress/dist/. "$SITE_DIR/docs/"
  fi
elif [ -d docs ]; then
  echo ">>> Copying docs/ as raw markdown (VitePress not configured)"
  mkdir -p "$SITE_DIR/docs"
  cp -r docs/. "$SITE_DIR/docs/"
fi

# 4. deployments.json at both root and /app/
if [ -f deployments.json ]; then
  cp deployments.json "$SITE_DIR/deployments.json"
  cp deployments.json "$SITE_DIR/app/deployments.json"
fi

echo ""
echo ">>> Staged tree:"
find "$SITE_DIR" -maxdepth 2 -type f 2>/dev/null | head -15
echo ""
echo ">>> Serving on http://localhost:$PORT"
echo "    Root (landing)   http://localhost:$PORT/"
echo "    App              http://localhost:$PORT/app/"
echo "    Docs             http://localhost:$PORT/docs/"
echo "    Ctrl-C to stop"
echo ""

python3 -m http.server "$PORT" --directory "$SITE_DIR"
