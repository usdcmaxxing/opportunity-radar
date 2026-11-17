// Edge hunt — quantify REAL mispricings in live prediction markets.
// Tests four structural edge types:
//   1. In-market arbitrage: mutually-exclusive outcomes summing far from 1.0
//   2. Cross-venue: same event on Polymarket vs Kalshi with a real gap
//   3. Parlay vs legs: a Kalshi multi-leg market vs its component markets
//   4. Correlated markets: over/under or related lines that disagree
import { scanPolymarket, scanKalshi, findEdges } from "../sources/prediction.mjs";

const poly = await scanPolymarket(400);
const kalshi = await scanKalshi(400);

console.log(`\nSample: ${poly.length} Polymarket, ${kalshi.length} Kalshi\n`);

// ── 1. In-market arbitrage ───────────────────────────────────────────────
console.log("═══ 1. IN-MARKET ARBITRAGE (outcome sum ≠ 1) ═══");
const arb = poly
  .filter((m) => m.outcomes.length >= 2 && m.price_sum > 0)
  .map((m) => ({ ...m, dev: Math.abs(m.price_sum - 1) }))
  .filter((m) => m.dev > 0.01)
  .sort((a, b) => b.dev - a.dev);
console.log(`markets with >1% deviation: ${arb.length} of ${poly.filter(m=>m.outcomes.length>=2).length}`);
for (const m of arb.slice(0, 10)) {
  console.log(`  ${(m.dev*100).toFixed(2)}%  ${m.title.slice(0,55)}  sum=${m.price_sum.toFixed(3)}  outcomes=${m.outcomes.length}  vol=$${Math.round(m.volume_24h||0).toLocaleString()}`);
}

// Distribution of deviations (is the market generally efficient?)
const devs = poly.filter(m=>m.outcomes.length>=2 && m.price_sum>0).map(m=>Math.abs(m.price_sum-1));
if (devs.length) {
  devs.sort((a,b)=>a-b);
  const q = (p)=>devs[Math.floor(p*(devs.length-1))];
  console.log(`\n  deviation distribution: p50=${(q(0.5)*100).toFixed(3)}%  p90=${(q(0.9)*100).toFixed(3)}%  p99=${(q(0.99)*100).toFixed(3)}%  max=${(devs[devs.length-1]*100).toFixed(2)}%`);
}

// ── 2. Cross-venue ───────────────────────────────────────────────────────
console.log("\n═══ 2. CROSS-VENUE (Polymarket vs Kalshi, same event) ═══");
const edges = findEdges(poly, kalshi);
console.log(`edges >5% found: ${edges.filter(e=>e.edge_pct>=5).length}`);
for (const e of edges.slice(0, 10)) {
  console.log(`  ${e.edge_pct}%  ${e.title.slice(0,50)}`);
  console.log(`      ${e.detail}`);
}

// ── 3. Kalshi parlay vs legs ─────────────────────────────────────────────
console.log("\n═══ 3. KALSHI PARLAY vs LEGS ═══");
// Multi-leg markets (title has multiple "yes X" clauses) vs single-leg titles
const multi = kalshi.filter((m) => (m.title || "").split(/,(?:yes|no) /).length > 2);
const single = kalshi.filter((m) => (m.title || "").split(/,(?:yes|no) /).length <= 2);
console.log(`multi-leg markets: ${multi.length} | single-leg: ${single.length}`);
// For each multi-leg, try to find its legs among single-leg markets by keyword
let parlayChecks = 0, parlayEdges = 0;
for (const p of multi.slice(0, 25)) {
  const legs = p.title.split(",").map(s=>s.trim()).filter(Boolean);
  const found = [];
  for (const leg of legs) {
    const key = leg.replace(/^(yes|no)\s+/i, "").trim();
    const hit = single.find((s) => key && s.title && normOverlap(key, s.title) > 0.6);
    if (hit) found.push({ key, price: hit.yes_mid });
  }
  if (found.length >= 2) {
    parlayChecks++;
    const product = found.reduce((a,f)=>a*(f.price ?? 0.5), 1);
    const parlayPrice = p.yes_mid;
    if (parlayPrice != null && product > 0) {
      const gap = Math.abs(parlayPrice - product);
      if (gap > 0.05) {
        parlayEdges++;
        console.log(`  ${(gap*100).toFixed(1)}% gap: ${p.title.slice(0,45)}`);
        console.log(`      parlay ${Math.round(parlayPrice*100)}¢ vs legs-product ${Math.round(product*100)}¢`);
      }
    }
  }
}
console.log(`checked ${parlayChecks} parlays with ≥2 matched legs, found ${parlayEdges} gaps >5%`);

// ── 4. Correlated markets (over/under style) ─────────────────────────────
console.log("\n═══ 4. CORRELATED / RELATED LINES ═══");
// Look for Polymarket markets sharing an event with complementary outcomes
const byEvent = new Map();
for (const m of poly) {
  const k = (m.raw?.events?.[0]?.slug) || m.title.split(/ vs | \| /)[0];
  if (!k) continue;
  if (!byEvent.has(k)) byEvent.set(k, []);
  byEvent.get(k).push(m);
}
let corrChecks = 0, corrEdges = 0;
for (const [k, ms] of byEvent) {
  if (ms.length < 2) continue;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      if (!a.prices.length || !b.prices.length) continue;
      const d = Math.abs(a.prices[0] - b.prices[0]);
      if (d > 0.15 && a.volume_24h > 5000 && b.volume_24h > 5000) {
        corrEdges++;
        console.log(`  ${(d*100).toFixed(1)}% apart: "${a.title.slice(0,40)}" ${Math.round(a.prices[0]*100)}¢ vs "${b.title.slice(0,40)}" ${Math.round(b.prices[0]*100)}¢`);
      }
      corrChecks++;
    }
  }
}
console.log(`checked ${corrChecks} related pairs, ${corrEdges} gaps >15%`);

function normOverlap(a, b) {
  const A = new Set(String(a).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const B = new Set(String(b).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let n = 0; for (const t of A) if (B.has(t)) n++;
  return n / Math.max(A.size, B.size, 1);
}