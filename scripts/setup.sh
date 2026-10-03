#!/usr/bin/env bash
# One-command local setup for Distil.
#
#   npm run setup
#
# Takes a fresh clone to a running local stack: checks Node and Docker, installs
# dependencies, writes .env.local from .env.local.example with generated auth
# secrets, starts the Docker PostgreSQL and provisions it. Safe to re-run: an
# existing .env.local is kept and only empty values are filled in.
#
# Non-interactive use (CI, agents): set DISTIL_LOCAL_PASSWORD and GEMINI_API_KEY in
# the environment and pass --yes. Nothing you type or export is written anywhere
# except .env.local, which is gitignored.
#
#   --yes        never prompt; fail if a required value is missing
#   --skip-db    do not touch Docker or the database
#   --reset-db   wipe and re-provision the local database even if .env.local existed
#   --help       print this text
set -euo pipefail

cd "$(dirname "$0")/.."

YES=0
SKIP_DB=0
RESET_DB=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --reset-db) RESET_DB=1 ;;
    --help | -h)
      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
info() { printf '  · %s\n' "$1"; }
fail() {
  printf '  \033[31m✗\033[0m %s\n' "$1" >&2
  exit 1
}

echo "Setting up Distil for local development"
echo

# ── 1. Toolchain ─────────────────────────────────────────────────────────────
command -v node > /dev/null 2>&1 || fail "Node.js is not installed. Install Node $(cat .nvmrc) (https://nodejs.org or nvm) and re-run."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
want_major="$(cut -d. -f1 .nvmrc)"
if [ "$node_major" -lt "$want_major" ]; then
  fail "Node $(node -v) found, but Distil needs Node $want_major+. Run 'nvm use' (reads .nvmrc) or install Node $want_major, then re-run."
fi
ok "Node $(node -v), npm $(npm -v)"

if [ "$SKIP_DB" -eq 0 ]; then
  command -v docker > /dev/null 2>&1 || fail "Docker is not installed. Install Docker Desktop (https://docs.docker.com/desktop/) and re-run, or pass --skip-db to point at your own PostgreSQL."
  docker info > /dev/null 2>&1 || fail "Docker is installed but not running. Start Docker Desktop and re-run."
  docker compose version > /dev/null 2>&1 || fail "'docker compose' is unavailable. Update Docker Desktop and re-run."
  ok "Docker $(docker version --format '{{.Server.Version}}' 2> /dev/null || echo 'running')"
fi

# ── 2. Dependencies ──────────────────────────────────────────────────────────
if [ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  ok "node_modules is up to date"
else
  info "Installing dependencies (npm ci)..."
  npm ci --no-audit --no-fund
  ok "Dependencies installed"
fi

# ── 3. .env.local ────────────────────────────────────────────────────────────
ENV_EXISTED=0
if [ -f .env.local ]; then
  ENV_EXISTED=1
  ok ".env.local already exists; keeping it and filling only empty values"
else
  cp .env.local.example .env.local
  ok "Created .env.local from .env.local.example"
  if [ -n "${DISTIL_LOCAL_DB_PORT:-}" ] && [ "$DISTIL_LOCAL_DB_PORT" != "5433" ]; then
    # A side-by-side instance (see docker-compose.yml): point the URLs at its port.
    SET_DATABASE_URL="postgresql://distil_app:distil_app@localhost:${DISTIL_LOCAL_DB_PORT}/distil_local" \
      SET_DATABASE_MIGRATION_URL="postgresql://distil:distil@localhost:${DISTIL_LOCAL_DB_PORT}/distil_local" \
      SET_DATABASE_CONTROL_PLANE_URL="postgresql://distil:distil@localhost:${DISTIL_LOCAL_DB_PORT}/distil_local" \
      node scripts/setup-env.mjs
    ok "Database URLs point at port ${DISTIL_LOCAL_DB_PORT}"
  fi
fi

# Read a value from .env.local (empty if unset).
env_get() {
  grep -E "^$1=" .env.local | head -n 1 | cut -d= -f2- || true
}

# Prompt helpers. With --yes we never read from the terminal.
prompt_secret() { # var-name, prompt
  local value
  if [ "$YES" -eq 1 ]; then
    fail "$1 is not set. Export it in the environment when using --yes."
  fi
  while true; do
    printf '  %s: ' "$2"
    read -rs value
    echo
    [ -n "$value" ] && break
    echo "  (a value is required)"
  done
  printf '%s' "$value"
}

PASSWORD="${DISTIL_LOCAL_PASSWORD:-}"
if [ -z "$(env_get DISTIL_WEB_PASSWORD_HASH)" ]; then
  if [ -z "$PASSWORD" ]; then
    echo
    echo "  Choose a password for signing in to your local Distil at http://localhost:3000/login."
    echo "  It is only ever used on this machine."
    PASSWORD="$(prompt_secret DISTIL_LOCAL_PASSWORD "Local password")"
  fi
  # local-secrets prints DISTIL_LEGACY_USER_ID, DISTIL_SESSION_SECRET and
  # DISTIL_WEB_PASSWORD_HASH, one per line, ready for .env.local.
  SECRETS="$(npx --no-install tsx scripts/local-secrets.ts "$PASSWORD")"
  NEW_USER_ID="$(printf '%s\n' "$SECRETS" | sed -n 's/^DISTIL_LEGACY_USER_ID=//p')"
  NEW_SESSION_SECRET="$(printf '%s\n' "$SECRETS" | sed -n 's/^DISTIL_SESSION_SECRET=//p')"
  NEW_PASSWORD_HASH="$(printf '%s\n' "$SECRETS" | sed -n 's/^DISTIL_WEB_PASSWORD_HASH=//p')"
  # Keep an existing user id or session secret if one was already filled in.
  USER_ID="$(env_get DISTIL_LEGACY_USER_ID)"
  [ -n "$USER_ID" ] || USER_ID="$NEW_USER_ID"
  SESSION_SECRET="$(env_get DISTIL_SESSION_SECRET)"
  [ -n "$SESSION_SECRET" ] || SESSION_SECRET="$NEW_SESSION_SECRET"
  ADMIN_IDS="$(env_get DISTIL_ADMIN_USER_IDS)"
  [ -n "$ADMIN_IDS" ] || ADMIN_IDS="$USER_ID"
  SET_DISTIL_LEGACY_USER_ID="$USER_ID" \
    SET_DISTIL_ADMIN_USER_IDS="$ADMIN_IDS" \
    SET_DISTIL_SESSION_SECRET="$SESSION_SECRET" \
    SET_DISTIL_WEB_PASSWORD_HASH="$NEW_PASSWORD_HASH" \
    node scripts/setup-env.mjs
  ok "Generated local auth secrets (user id, session secret, password hash)"
else
  ok "Auth secrets already present"
fi

if [ -z "$(env_get GEMINI_API_KEY)" ] && [ -z "$(env_get ANTHROPIC_API_KEY)" ] && [ -z "$(env_get OPENAI_API_KEY)" ]; then
  KEY="${GEMINI_API_KEY:-}"
  if [ -z "$KEY" ] && [ "$YES" -eq 0 ]; then
    echo
    echo "  Distil needs one AI provider key to summarize what you save. Gemini is the default:"
    echo "  create a free key at https://aistudio.google.com/apikey. Press Enter to skip for now"
    echo "  and add GEMINI_API_KEY to .env.local later."
    printf '  Gemini API key: '
    read -rs KEY
    echo
  fi
  if [ -n "$KEY" ]; then
    SET_GEMINI_API_KEY="$KEY" node scripts/setup-env.mjs
    ok "Saved GEMINI_API_KEY"
  else
    info "No AI key yet. Captures will save but not summarize until GEMINI_API_KEY is set in .env.local."
  fi
else
  ok "AI provider key present"
fi

# ── 4. Database ──────────────────────────────────────────────────────────────
if [ "$SKIP_DB" -eq 1 ]; then
  info "Skipping Docker and the database (--skip-db). Point DATABASE_URL and DATABASE_MIGRATION_URL"
  info "in .env.local at your PostgreSQL, then run: npm run db:migrate && npm run db:tenant:migrate"
else
  info "Starting local PostgreSQL (docker compose)..."
  docker compose up -d --wait postgres > /dev/null
  ok "PostgreSQL is up on port ${DISTIL_LOCAL_DB_PORT:-5433}"

  DO_RESET=1
  if [ "$ENV_EXISTED" -eq 1 ] && [ "$RESET_DB" -eq 0 ]; then
    # A second run on an existing setup: do not silently wipe local captures.
    if [ "$YES" -eq 1 ]; then
      DO_RESET=0
      info "Keeping the existing database (pass --reset-db to wipe and re-provision it)."
    else
      printf '  .env.local existed before this run, so the database may already hold your captures.\n'
      printf '  Wipe and re-provision it now? [y/N] '
      read -r answer
      case "$answer" in
        y | Y | yes | YES) DO_RESET=1 ;;
        *) DO_RESET=0 ;;
      esac
    fi
  fi
  if [ "$DO_RESET" -eq 1 ]; then
    info "Provisioning the database (migrations, tenant schema, runtime role, owner user)..."
    npx --no-install tsx --env-file=.env.local scripts/local-db-reset.ts > /dev/null
    ok "Database provisioned"
  fi
fi

# ── 5. Done ──────────────────────────────────────────────────────────────────
DEV_COMMAND="npm run dev:local"
[ "$SKIP_DB" -eq 0 ] || DEV_COMMAND="npm run dev      "
cat <<EOF

Distil is ready.

  Start the app:      $DEV_COMMAND
  Sign in:            http://localhost:3000/login  (the password you just chose)
  Save your first URL: http://localhost:3000/save

  Browser extension:  load browser-extension/ unpacked in Chrome, set the origin to
                      http://localhost:3000 and paste a capture token from Settings → Capture.

  Before a PR:        npm run check
  Everything else:    CONTRIBUTING.md
EOF
