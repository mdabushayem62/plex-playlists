#!/bin/bash
# Quick Docker smoke tests - validates build and basic functionality
# Fast enough to run frequently during development
set -e

IMAGE_NAME="plex-playlists:test"
TEST_CONTAINER="plex-playlists-test-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🐳 Docker Quick Smoke Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cleanup function
cleanup() {
  echo ""
  echo "🧹 Cleaning up test container..."
  docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

# Test 1: Build succeeds
echo ""
echo "📦 Test 1: Building Docker image..."
if docker build -t "$IMAGE_NAME" . > /tmp/docker-build.log 2>&1; then
  echo -e "${GREEN}✓${NC} Build succeeded"

  # Check for warnings
  if grep -i "warning" /tmp/docker-build.log > /dev/null; then
    echo -e "${YELLOW}⚠${NC} Build produced warnings:"
    grep -i "warning" /tmp/docker-build.log | head -3
  fi
else
  echo -e "${RED}✗${NC} Build failed"
  cat /tmp/docker-build.log
  exit 1
fi

# Test 2: Image contains required files
echo ""
echo "📂 Test 2: Checking required files in image..."

check_file() {
  local file="$1"
  if docker run --rm "$IMAGE_NAME" test -e "$file"; then
    echo -e "  ${GREEN}✓${NC} $file"
    return 0
  else
    echo -e "  ${RED}✗${NC} $file (MISSING)"
    return 1
  fi
}

MISSING_FILES=0

# Core files
check_file "/app/dist/cli.js" || ((MISSING_FILES++))
check_file "/app/dist/index.js" || ((MISSING_FILES++))
check_file "/app/drizzle/0003_quiet_lethal_legion.sql" || ((MISSING_FILES++))

# Web UI files (critical for this release)
check_file "/app/src/web/views/dashboard.tsx" || ((MISSING_FILES++))
check_file "/app/src/web/views/layout.tsx" || ((MISSING_FILES++))
check_file "/app/src/web/public/js/actions.js" || ((MISSING_FILES++))
check_file "/app/src/web/server.ts" || ((MISSING_FILES++))

# Config files
check_file "/app/package.json" || ((MISSING_FILES++))

if [ $MISSING_FILES -gt 0 ]; then
  echo -e "${RED}✗${NC} $MISSING_FILES required files missing"
  exit 1
fi

# Test 3: Node modules installed correctly
echo ""
echo "📚 Test 3: Checking production dependencies..."
if docker run --rm "$IMAGE_NAME" test -d "/app/node_modules/express"; then
  echo -e "  ${GREEN}✓${NC} express installed"
else
  echo -e "  ${RED}✗${NC} express missing (web UI will fail)"
  exit 1
fi

if docker run --rm "$IMAGE_NAME" test -d "/app/node_modules/drizzle-orm"; then
  echo -e "  ${GREEN}✓${NC} drizzle-orm installed"
else
  echo -e "  ${RED}✗${NC} drizzle-orm missing (database will fail)"
  exit 1
fi

# Test 4: CLI commands work
echo ""
echo "🔧 Test 4: Testing CLI commands..."

# Help command (needs dummy env vars even for --help due to envalid)
# Note: CLI returns exit code 1 when no valid command provided (normal behavior)
docker run --rm \
  -e PLEX_BASE_URL=http://test:32400 \
  -e PLEX_AUTH_TOKEN=test \
  "$IMAGE_NAME" node dist/cli.js --help > /tmp/cli-help.txt 2>&1 || true

if grep -q "plex-playlists start" /tmp/cli-help.txt; then
  echo -e "  ${GREEN}✓${NC} --help works"
else
  echo -e "  ${RED}✗${NC} --help output unexpected"
  cat /tmp/cli-help.txt
  exit 1
fi

# Test 5: Database initialization works
echo ""
echo "🗄️  Test 5: Testing database initialization..."

# Create a test container with volume
docker run -d --name "$TEST_CONTAINER" \
  -e PLEX_BASE_URL=http://test-server:32400 \
  -e PLEX_AUTH_TOKEN=test-token \
  "$IMAGE_NAME" sleep 30

# Run cache stats (this triggers migrations)
if docker exec "$TEST_CONTAINER" node dist/cli.js cache stats > /tmp/cache-stats.txt 2>&1; then
  if grep -q "Genre Cache Statistics" /tmp/cache-stats.txt; then
    echo -e "  ${GREEN}✓${NC} Database migrations completed"
    echo -e "  ${GREEN}✓${NC} CLI command executed successfully"
  else
    echo -e "  ${RED}✗${NC} Unexpected output"
    cat /tmp/cache-stats.txt
    exit 1
  fi
else
  echo -e "  ${RED}✗${NC} Database initialization failed"
  cat /tmp/cache-stats.txt
  exit 1
fi

# Test 6: Check tables were created
echo ""
echo "📋 Test 6: Verifying database schema..."

TABLES=$(docker exec "$TEST_CONTAINER" sqlite3 /data/plex-playlists.db ".tables" 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}✗${NC} Failed to query database"
  echo "$TABLES"
  exit 1
fi

check_table() {
  local table="$1"
  if echo "$TABLES" | grep -q "$table"; then
    echo -e "  ${GREEN}✓${NC} $table"
    return 0
  else
    echo -e "  ${RED}✗${NC} $table (MISSING)"
    return 1
  fi
}

MISSING_TABLES=0
check_table "playlists" || ((MISSING_TABLES++))
check_table "job_runs" || ((MISSING_TABLES++))
check_table "genre_cache" || ((MISSING_TABLES++))
check_table "album_genre_cache" || ((MISSING_TABLES++))
check_table "settings" || ((MISSING_TABLES++))
check_table "setup_state" || ((MISSING_TABLES++))

if [ $MISSING_TABLES -gt 0 ]; then
  echo -e "${RED}✗${NC} $MISSING_TABLES tables missing"
  echo "Available tables: $TABLES"
  exit 1
fi

# Verify progress tracking columns in job_runs
echo ""
echo "📊 Test 6b: Verifying migration 0007 (progress tracking)..."
SCHEMA=$(docker exec "$TEST_CONTAINER" sqlite3 /data/plex-playlists.db "PRAGMA table_info(job_runs);" 2>&1)

if echo "$SCHEMA" | grep -q "progress_current"; then
  echo -e "  ${GREEN}✓${NC} progress_current column exists"
else
  echo -e "  ${RED}✗${NC} progress_current column missing"
  exit 1
fi

if echo "$SCHEMA" | grep -q "progress_total"; then
  echo -e "  ${GREEN}✓${NC} progress_total column exists"
else
  echo -e "  ${RED}✗${NC} progress_total column missing"
  exit 1
fi

# Test 7: Image size check
echo ""
echo "💾 Test 7: Checking image size..."
IMAGE_SIZE=$(docker images "$IMAGE_NAME" --format "{{.Size}}")
echo -e "  ${GREEN}ℹ${NC} Image size: $IMAGE_SIZE"

# Extract numeric value (remove MB/GB suffix) for comparison
SIZE_NUM=$(echo "$IMAGE_SIZE" | grep -oE '[0-9]+' | head -1)
SIZE_UNIT=$(echo "$IMAGE_SIZE" | grep -oE '[A-Z]+' | head -1)

if [ "$SIZE_UNIT" = "GB" ] && [ "$SIZE_NUM" -gt 1 ]; then
  echo -e "  ${YELLOW}⚠${NC} Warning: Image is larger than 1GB"
elif [ "$SIZE_UNIT" = "MB" ] && [ "$SIZE_NUM" -gt 800 ]; then
  echo -e "  ${YELLOW}⚠${NC} Warning: Image is larger than 800MB"
else
  echo -e "  ${GREEN}✓${NC} Image size is reasonable"
fi

# Success!
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ All Docker smoke tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  • Run full integration tests with real Plex"
echo "  • Test web UI at http://localhost:8687"
echo "  • Verify scheduler with: docker-compose up -d"
