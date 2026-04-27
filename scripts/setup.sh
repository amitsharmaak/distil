#!/usr/bin/env bash
set -e

echo "Setting up Distil..."

# Create data directory (gitignored, but needed at runtime)
mkdir -p data
echo "  ✓ data/ directory ready"

# Copy .env.example → .env.local if it doesn't exist yet
if [ -f ".env.local" ]; then
  echo "  ✓ .env.local already exists (skipping)"
else
  cp .env.example .env.local
  echo "  ✓ Created .env.local from .env.example"
fi

echo ""
echo "Next steps:"
echo "  1. Edit .env.local and set at least one AI provider key:"
echo "       GEMINI_API_KEY   (recommended — free tier available)"
echo "       OPENAI_API_KEY   or"
echo "       ANTHROPIC_API_KEY"
echo ""
echo "  2. Run the dev server:"
echo "       npm run dev"
echo ""
echo "  The database (data/distil.db) is created automatically on first run."
echo "  No migrations needed."
