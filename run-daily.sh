#!/bin/bash
# Daily Money Radar — scan + registries + brief
# Runs via launchd (com.opportunityradar.daily) at 7:00 America/Chicago
set -e
cd /Users/asa/opportunity-radar

export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

DATE=$(date +%Y-%m-%d)
BRIEF="briefs/$DATE.md"
mkdir -p briefs

echo "=== Scanning opportunities ==="
node scanner.mjs --brief > "$BRIEF" 2> "briefs/$DATE.log"
cp "$BRIEF" briefs/LATEST.md

echo "=== Building registries (DefiLlama + CoinGecko) ==="
node scripts/build-registries.mjs >> "briefs/$DATE.log" 2>&1

echo "=== Syncing datasets to USDC Gate ==="
cp data/defi-protocol-registry.json data/chain-registry.json data/exchange-registry.json \
   /Users/asa/usdc-gate/data/ 2>> "briefs/$DATE.log" || true

# Regenerate the money-opportunity dataset for USDC Gate
node --input-type=module -e "
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('data/opportunities.json','utf8'));
const opp = d.opportunities.filter(o => ['hackathon','bugbounty','bounty','grant'].includes(o.category));
const out = {
  name: 'Money Opportunity Registry',
  description: 'Live money-making opportunities: hackathons, bug bounties, grants, and paid bounties. Ranked by expected value. Updated daily.',
  version: new Date().toISOString().slice(0,10),
  updated_at: d.scanned_at,
  source: 'Opportunity Radar (Devpost, Immunefi, GitHub, Gitcoin)',
  total: opp.length,
  records: opp.map(o => ({
    id: o.id, title: o.title, category: o.category, source: o.source, url: o.url,
    prize_usd: o.prize_usd, paid_usd: o.paid_usd, expected_value_usd: o.expected_value,
    deadline: o.deadline, description: o.description,
  })),
};
fs.writeFileSync('/Users/asa/usdc-gate/data/money-opportunity-registry.json', JSON.stringify(out, null, 2));
console.log('  money-opportunity-registry:', opp.length, 'records');

// Prediction-market dataset
const pred = d.opportunities.filter(o => o.category === 'prediction');
fs.writeFileSync('/Users/asa/usdc-gate/data/prediction-market-registry.json', JSON.stringify({
  name: 'Prediction Market Registry',
  description: 'Live event-derivative markets from Polymarket and Kalshi: odds, 24h volume, and close times.',
  version: new Date().toISOString().slice(0,10),
  updated_at: d.scanned_at,
  source: 'Polymarket Gamma API + Kalshi API',
  total: pred.length,
  records: pred,
  edges: d.prediction_edges || [],
}, null, 2));
console.log('  prediction-market-registry:', pred.length, 'records');
" >> "briefs/$DATE.log" 2>&1

echo "Radar updated: $DATE"
