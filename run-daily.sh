#!/bin/bash
# Daily Money Radar — scan + brief
# Runs via launchd (com.opportunityradar.daily) at 7:00 America/Chicago
set -e
cd /Users/asa/opportunity-radar

export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

DATE=$(date +%Y-%m-%d)
BRIEF="briefs/$DATE.md"
mkdir -p briefs

node scanner.mjs --brief > "$BRIEF" 2> "briefs/$DATE.log"

# Also keep a latest copy
cp "$BRIEF" briefs/LATEST.md

echo "Radar updated: $DATE ($(grep -c '^|' "$BRIEF" || echo 0) lines)"
