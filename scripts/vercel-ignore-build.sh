#!/usr/bin/env bash
# Vercel Ignored Build Step (wired through "ignoreCommand" in vercel.json).
#
# Vercel's exit-code convention is inverted from the shell's: exit 0 SKIPS the
# build, exit 1 BUILDS. Skip only when nothing deployable changed since the last
# successful deployment of this branch, that is when every changed file is under
# docs/, is a Markdown file, or is under .github/. Anything uncertain builds.
set -u

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$previous" ]; then
  echo "No previous successful deployment for this branch; building."
  exit 1
fi

if ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  echo "Previous deployment ${previous} is not in the shallow clone; building."
  exit 1
fi

# Pathspecs: without the glob magic, "*" also matches "/", so ":(exclude)*.md"
# covers Markdown files in every directory.
if git diff --quiet "$previous" HEAD -- . ':(exclude)docs' ':(exclude)*.md' ':(exclude).github'; then
  echo "Only docs, Markdown or GitHub workflow files changed since ${previous}; skipping the build."
  exit 0
fi

echo "Deployable files changed since ${previous}; building."
exit 1
