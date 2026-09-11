#!/usr/bin/env bash
set -e

echo "Setting up Distil..."

# Create .env.local from a commented template if it doesn't exist yet.
# No real values are written here — fill them in yourself.
if [ -f ".env.local" ]; then
  echo "  ✓ .env.local already exists (skipping)"
else
  cat > .env.local <<'EOF'
# Distil local environment — fill in real values below.

# PostgreSQL runtime connection string (restricted role)
DATABASE_URL=

# PostgreSQL migration connection string (owner role; falls back to DATABASE_URL if unset)
DATABASE_MIGRATION_URL=

# Session signing secret
DISTIL_SESSION_SECRET=

# Comma-separated list of allowed CORS origins
DISTIL_ALLOWED_ORIGINS=

# Base URL used by client-side API calls
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# At least one AI provider key (Gemini shown; OpenAI/Anthropic keys also supported)
GEMINI_API_KEY=
EOF
  echo "  ✓ Created .env.local (edit it and fill in real values)"
fi

echo ""
echo "Required environment variables:"
echo "  DATABASE_URL              PostgreSQL runtime connection string"
echo "  DATABASE_MIGRATION_URL    PostgreSQL migration connection string"
echo "  DISTIL_SESSION_SECRET     Session signing secret"
echo "  DISTIL_ALLOWED_ORIGINS    Comma-separated allowed CORS origins"
echo "  NEXT_PUBLIC_API_BASE_URL  Base URL for client-side API calls"
echo "  GEMINI_API_KEY            (or another AI provider key)"
echo ""
echo "Next steps:"
echo "  1. Edit .env.local and fill in the values above (point DATABASE_URL /"
echo "     DATABASE_MIGRATION_URL at a local or test PostgreSQL instance)."
echo ""
echo "  2. Run migrations:"
echo "       npm run db:migrate"
echo "       npm run db:tenant:migrate"
echo ""
echo "  3. Start the dev server:"
echo "       npm run dev"
