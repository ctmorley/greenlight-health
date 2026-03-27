#!/usr/bin/env bash
# Comprehensive database setup script.
# Tries to ensure PostgreSQL is available via multiple methods:
#   1. Check if PostgreSQL is already running at DATABASE_URL
#   2. Try to start via Homebrew (macOS)
#   3. Try to start via systemctl (Linux)
#   4. Try to start via Docker Compose
#   5. Print manual setup instructions if all fail
#
# After PostgreSQL is running, creates the database if needed and applies the Prisma schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/greenlight}"
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-greenlight}"
DB_USER="${DB_USER:-postgres}"

check_postgres_reachable() {
  if command -v pg_isready > /dev/null 2>&1; then
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -q > /dev/null 2>&1 && return 0
  fi
  if command -v nc > /dev/null 2>&1; then
    nc -z "$DB_HOST" "$DB_PORT" > /dev/null 2>&1 && return 0
  fi
  (echo > "/dev/tcp/$DB_HOST/$DB_PORT") > /dev/null 2>&1 && return 0
  return 1
}

ensure_database_exists() {
  # Try to create the database if it doesn't exist
  if command -v createdb > /dev/null 2>&1; then
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true
  elif command -v psql > /dev/null 2>&1; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | grep -q 1 || \
      psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME" 2>/dev/null || true
  fi
}

PG_READY=false

# ── Method 1: Already running? ──
echo "🔍 Checking if PostgreSQL is already running at $DB_HOST:$DB_PORT..."
if check_postgres_reachable; then
  echo "✅ PostgreSQL is already running."
  PG_READY=true
fi

# ── Method 2: macOS Homebrew ──
if [ "$PG_READY" = false ] && [ "$(uname)" = "Darwin" ]; then
  if command -v brew > /dev/null 2>&1; then
    # Check for any Homebrew-installed PostgreSQL
    PG_FORMULA=""
    for formula in postgresql@16 postgresql@15 postgresql@14 postgresql; do
      if brew list "$formula" > /dev/null 2>&1; then
        PG_FORMULA="$formula"
        break
      fi
    done

    if [ -n "$PG_FORMULA" ]; then
      echo "🐘 Found Homebrew PostgreSQL ($PG_FORMULA). Starting..."
      brew services start "$PG_FORMULA" 2>/dev/null || true
      sleep 2
      # Wait for it
      RETRIES=10
      while ! check_postgres_reachable && [ "$RETRIES" -gt 0 ]; do
        RETRIES=$((RETRIES - 1))
        sleep 1
      done
      if check_postgres_reachable; then
        echo "✅ PostgreSQL started via Homebrew."
        PG_READY=true
      fi
    fi
  fi
fi

# ── Method 3: Linux systemctl ──
if [ "$PG_READY" = false ] && [ "$(uname)" = "Linux" ]; then
  if command -v systemctl > /dev/null 2>&1; then
    if systemctl list-unit-files | grep -q postgresql; then
      echo "🐘 Found systemd PostgreSQL service. Starting..."
      sudo systemctl start postgresql 2>/dev/null || true
      sleep 2
      RETRIES=10
      while ! check_postgres_reachable && [ "$RETRIES" -gt 0 ]; do
        RETRIES=$((RETRIES - 1))
        sleep 1
      done
      if check_postgres_reachable; then
        echo "✅ PostgreSQL started via systemctl."
        PG_READY=true
      fi
    fi
  fi
fi

# ── Method 4: Docker Compose ──
if [ "$PG_READY" = false ]; then
  if command -v docker > /dev/null 2>&1; then
    echo "🐘 Starting PostgreSQL via Docker Compose..."
    docker compose up -d db 2>/dev/null || docker-compose up -d db 2>/dev/null || true
    RETRIES=30
    while ! check_postgres_reachable && [ "$RETRIES" -gt 0 ]; do
      RETRIES=$((RETRIES - 1))
      sleep 1
    done
    if check_postgres_reachable; then
      echo "✅ PostgreSQL started via Docker."
      PG_READY=true
    fi
  fi
fi

# ── All methods failed ──
if [ "$PG_READY" = false ]; then
  echo ""
  echo "❌ Could not start PostgreSQL. Please install and start it manually:"
  echo ""
  echo "  macOS:   brew install postgresql@16 && brew services start postgresql@16"
  echo "  Ubuntu:  sudo apt install postgresql && sudo systemctl start postgresql"
  echo "  Docker:  Install Docker, then run: docker compose up -d db"
  echo ""
  echo "  Ensure DATABASE_URL in .env is correct:"
  echo "    DATABASE_URL=\"$DB_URL\""
  echo ""
  exit 1
fi

# ── Ensure database exists ──
echo "🔄 Ensuring database '$DB_NAME' exists..."
ensure_database_exists

# ── Apply Prisma migrations ──
echo "🔄 Running Prisma migrate deploy..."
npx prisma migrate deploy

echo "✅ Database setup complete. All migrations applied and tables created."
