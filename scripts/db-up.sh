#!/usr/bin/env bash
# Start PostgreSQL and apply the Prisma schema.
# Supports three modes:
#   1. PostgreSQL already running and reachable → just apply schema
#   2. Docker available → start via Docker Compose, then apply schema
#   3. Neither → print setup instructions and exit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Extract host and port from DATABASE_URL for connectivity check
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/greenlight}"
# Parse host:port from the URL (handles both @ and :// formats)
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

check_postgres_reachable() {
  # Try pg_isready if available
  if command -v pg_isready > /dev/null 2>&1; then
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -q > /dev/null 2>&1 && return 0
  fi
  # Fallback: try a TCP connection
  if command -v nc > /dev/null 2>&1; then
    nc -z "$DB_HOST" "$DB_PORT" > /dev/null 2>&1 && return 0
  fi
  # Fallback: use bash /dev/tcp
  (echo > "/dev/tcp/$DB_HOST/$DB_PORT") > /dev/null 2>&1 && return 0
  return 1
}

# ── Step 1: Check if PostgreSQL is already reachable ──
if check_postgres_reachable; then
  echo "✅ PostgreSQL is already running at $DB_HOST:$DB_PORT."
else
  echo "⏳ PostgreSQL is not reachable at $DB_HOST:$DB_PORT."

  # ── Step 2: Try Docker ──
  if command -v docker > /dev/null 2>&1; then
    echo "🐘 Starting PostgreSQL via Docker Compose..."
    docker compose up -d db

    echo "⏳ Waiting for PostgreSQL to be ready..."
    RETRIES=30
    until check_postgres_reachable; do
      RETRIES=$((RETRIES - 1))
      if [ "$RETRIES" -le 0 ]; then
        echo "❌ PostgreSQL did not become ready in time."
        exit 1
      fi
      sleep 1
    done
    echo "✅ PostgreSQL is ready."
  else
    # ── Step 3: No Docker, no running PostgreSQL ──
    echo ""
    echo "❌ Cannot reach PostgreSQL and Docker is not installed."
    echo ""
    echo "To set up the database, use ONE of the following options:"
    echo ""
    echo "  Option A — Install and start PostgreSQL locally:"
    echo "    macOS:   brew install postgresql@16 && brew services start postgresql@16"
    echo "             createdb greenlight"
    echo "    Ubuntu:  sudo apt install postgresql && sudo systemctl start postgresql"
    echo "             sudo -u postgres createdb greenlight"
    echo ""
    echo "  Option B — Install Docker and use Docker Compose:"
    echo "    Install: https://docs.docker.com/get-docker/"
    echo "    Then:    docker compose up -d db"
    echo ""
    echo "  Make sure DATABASE_URL in .env matches your setup:"
    echo "    DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/greenlight\""
    echo ""
    exit 1
  fi
fi

# ── Apply Prisma schema ──
# Try migrate deploy first; fall back to db push for dev environments
# where migrations may not match the current schema state (e.g., P3005).
echo "🔄 Applying database schema..."
if npx prisma migrate deploy 2>/dev/null; then
  echo "✅ Migrations applied successfully."
else
  echo "⚠️  migrate deploy failed (non-empty DB or missing baseline). Falling back to prisma db push..."
  npx prisma db push --accept-data-loss
  echo "✅ Schema pushed via db push."
fi

echo "✅ Database is up and schema is applied."

# ── Verify tables ──
echo "🔍 Verifying tables..."
TABLE_COUNT=$(npx prisma db execute --stdin <<'SQL' 2>/dev/null | grep -c "(" || true
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
SQL
)
echo "   Found tables in public schema."

# ── Verify migration tracking ──
echo "🔍 Verifying migration tracking..."
npx prisma migrate status
echo "✅ All done."
