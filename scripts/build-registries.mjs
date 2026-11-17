// Build DeFi / chain / exchange registries from DefiLlama + CoinGecko.
// Writes data/defi-protocol-registry.json, data/chain-registry.json, data/exchange-registry.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, attempts = 4) {
  // CoinGecko rate-limits (429) are transient — back off and retry.
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (r.ok) return r.json();
      lastErr = new Error(`HTTP ${r.status}`);
      if (r.status !== 429 && r.status < 500) throw lastErr;
    } catch (e) {
      lastErr = e;
    }
    await sleep(2000 * (i + 1));
  }
  throw lastErr;
}

const now = new Date().toISOString();

// ── DeFi protocols (DefiLlama) ───────────────────────────────────────────
async function defiProtocols() {
  const d = await j("https://api.llama.fi/protocols");
  const rows = d
    .filter((p) => p.name && (p.tvl != null))
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, 250)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      category: p.category,
      chains: p.chains || [],
      tvl_usd: Math.round(p.tvl || 0),
      tvl_change_24h: p["change_1d"],
      tvl_change_7d: p["change_7d"],
      mcap_usd: p.mcap || null,
      url: p.url || null,
      logo: p.logo || null,
    }));
  return {
    name: "DeFi Protocol Registry",
    description: "Top 250 DeFi protocols by TVL, with chains, 24h/7d TVL change, and market cap. For agents assessing protocol risk and DeFi activity.",
    version: now.slice(0, 10),
    updated_at: now,
    source: "DefiLlama",
    total: rows.length,
    records: rows,
  };
}

// ── Chains (DefiLlama) ───────────────────────────────────────────────────
async function chains() {
  const d = await j("https://api.llama.fi/chains");
  const rows = d
    .filter((c) => c.name)
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, 100)
    .map((c) => ({
      name: c.name,
      chain_id: c.chainId,
      token_symbol: c.tokenSymbol,
      tvl_usd: Math.round(c.tvl || 0),
      gecko_id: c.gecko_id,
    }));
  return {
    name: "Blockchain Chain Registry",
    description: "Top 100 blockchains by TVL with chain IDs and native token symbols. For agents checking chain identity and DeFi activity.",
    version: now.slice(0, 10),
    updated_at: now,
    source: "DefiLlama",
    total: rows.length,
    records: rows,
  };
}

// ── Exchanges (CoinGecko) ────────────────────────────────────────────────
async function exchanges() {
  const d = await j("https://api.coingecko.com/api/v3/exchanges?per_page=100");
  const rows = d.map((e) => ({
    name: e.name,
    id: e.id,
    year_established: e.year_established,
    country: e.country,
    url: e.url,
    trust_score: e.trust_score,
    trust_score_rank: e.trust_score_rank,
    trade_volume_24h_btc: e.trade_volume_24h_btc,
    description: (e.description || "").slice(0, 200),
  }));
  return {
    name: "Crypto Exchange Registry",
    description: "Top 100 crypto exchanges with trust scores, country, and 24h BTC volume. For agents checking exchange risk and liquidity.",
    version: now.slice(0, 10),
    updated_at: now,
    source: "CoinGecko",
    total: rows.length,
    records: rows,
  };
}

console.log("Building registries...");
const out = [
  ["defi-protocol-registry", await defiProtocols()],
  ["chain-registry", await chains()],
  ["exchange-registry", await exchanges()],
];
for (const [name, data] of out) {
  const p = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  ${name}: ${data.records.length} records → ${p}`);
}
console.log("Done.");