// Duplicate / near-duplicate question detector.
// If two markets ask the SAME question but trade at different prices, that's a real arb.
import { scanPolymarket } from "../sources/prediction.mjs";

const poly = await scanPolymarket(800);
console.log(`\nPolymarket markets sampled: ${poly.length}\n`);

function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(will|the|by|in|on|at|of|to|a|an|be|is|are|was|were)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
function toks(s) { return norm(s).split(" ").filter(Boolean); }
function jac(a, b) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const t of A) if (B.has(t)) n++;
  return n / (A.size + B.size - n);
}

// Bucket markets by their event so we only compare related questions
const groups = new Map();
for (const m of poly) {
  const ev = m.raw?.events?.[0]?.slug || m.raw?.events?.[0]?.title || "";
  if (!ev) continue;
  if (!groups.has(ev)) groups.set(ev, []);
  groups.get(ev).push(m);
}

console.log("═══ DUPLICATE-QUESTION SCAN (same event, similar wording, different price) ═══");
let pairs = 0, dupes = 0;
const hits = [];
for (const [ev, ms] of groups) {
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      if (!a.prices.length || !b.prices.length) continue;
      const s = jac(a.title, b.title);
      pairs++;
      if (s >= 0.75) {
        const d = Math.abs(a.prices[0] - b.prices[0]);
        if (d > 0.03) {
          dupes++;
          hits.push({ ev, a, b, s, d });
        }
      }
    }
  }
}
console.log(`compared ${pairs} within-event pairs; ${dupes} near-duplicate questions with >3% price gap`);
for (const h of hits.slice(0, 15)) {
  console.log(`  gap ${(h.d*100).toFixed(1)}% (sim ${(h.s*100).toFixed(0)}%)`);
  console.log(`     A: "${h.a.title.slice(0,60)}" = ${Math.round(h.a.prices[0]*100)}¢  vol=$${Math.round(h.a.volume_24h||0).toLocaleString()}`);
  console.log(`     B: "${h.b.title.slice(0,60)}" = ${Math.round(h.b.prices[0]*100)}¢  vol=$${Math.round(h.b.volume_24h||0).toLocaleString()}`);
}

// ── Also: same event, complementary outcomes that don't sum to 1 ─────────
console.log("\n═══ COMPLEMENTARY OUTCOME CHECK ═══");
// e.g. "X wins" vs "Y wins" in the same 2-candidate race
let comp = 0, compDev = 0;
for (const [ev, ms] of groups) {
  const two = ms.filter((m) => m.prices.length === 2 && (m.volume_24h || 0) > 3000);
  if (two.length < 2) continue;
  for (let i = 0; i < two.length; i++) {
    for (let j = i + 1; j < two.length; j++) {
      // same two candidate names, reversed
      const A = two[i].outcomes.map((x) => x.toLowerCase()).sort().join("|");
      const B = two[j].outcomes.map((x) => x.toLowerCase()).sort().join("|");
      if (A === B) {
        comp++;
        const sum = two[i].prices[0] + two[j].prices[0];
        const dev = Math.abs(sum - 1);
        if (dev > 0.03) {
          compDev++;
          console.log(`  dev ${(dev*100).toFixed(1)}%: "${two[i].title.slice(0,40)}" ${Math.round(two[i].prices[0]*100)}¢ + "${two[j].title.slice(0,40)}" ${Math.round(two[j].prices[0]*100)}¢ = ${(sum*100).toFixed(1)}¢`);
        }
      }
    }
  }
}
console.log(`checked ${comp} same-candidate pairs; ${compDev} deviate >3% from 1.0`);

// ── How wide are the spreads? (the real cost of trading) ─────────────────
console.log("\n═══ SPREAD COST ═══");
const liq = poly.filter((m) => (m.volume_24h || 0) > 20000 && m.best_bid != null && m.best_ask != null);
if (liq.length) {
  const spreads = liq.map((m) => m.best_ask - m.best_bid).sort((a, b) => a - b);
  const q = (p) => spreads[Math.floor(p * (spreads.length - 1))];
  console.log(`liquid markets: ${liq.length}`);
  console.log(`spread p10=${(q(0.1)*100).toFixed(2)}¢  p50=${(q(0.5)*100).toFixed(2)}¢  p90=${(q(0.9)*100).toFixed(2)}¢`);
  console.log(`→ a round-trip costs ~${(q(0.5)*200).toFixed(1)}¢ (${(q(0.5)*2).toFixed(1)}% of notional)`);
}