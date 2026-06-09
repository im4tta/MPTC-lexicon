#!/bin/bash
# push-as-claude.sh
# Usage: ./push-as-claude.sh "your commit message" [branch]
#
# Run this locally to commit your Claude-generated files
# with Claude shown as the Git author.

set -e

COMMIT_MSG="${1:-feat: add Claude-generated code}"
BRANCH="${2:-main}"

echo "📦 Committing as claude[bot] → branch: $BRANCH"

git config user.name "claude[bot]"
git config user.email "claude[bot]@users.noreply.github.com"

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit — working tree clean."
  exit 0
fi

git commit -m "$COMMIT_MSG"
git push origin "$BRANCH"

echo "✅ Done! Check your repo — claude[bot] should appear as a contributor."

# Reset identity back to your own after pushing
git config --unset user.name  || true
git config --unset user.email || true
echo "↩️  Git identity reset to global config."
