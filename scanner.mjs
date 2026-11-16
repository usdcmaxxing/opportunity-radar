// Opportunity Radar — scans for money-making opportunities across categories.
// Sources: Devpost (hackathons), HackerOne (bounties), Agentic.Market (agent work),
//          CoinGecko (new tokens), airdrop trackers, grant programs.
//
// Usage:
//   node scanner.mjs              # scan all sources, write data/opportunities.json
//   node scanner.mjs --brief      # scan + print markdown brief
//   node scanner.mjs --serve      # start the web dashboard on :7777

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Source: Devpost hackathons ───────────────────────────────────────────
export async function scanDevpost() {
  const out = [];
  // Multiple searches to catch everything
  const queries = [
    "https://devpost.com/api/hackathons?statuses[]=open&order_by=deadline&per_page=100",
    "https://devpost.com/api/hackathons?statuses[]=open&order_by=prize_amount&per_page=100",
  ];
  const seen = new Set();
  for (const url of queries) {
    try {
      const d = await fetchJson(url);
      for (const h of d.hackathons || []) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        const prize = parsePrize(h.prize_amount);
        out.push({
          id: `devpost-${h.id}`,
          title: h.title,
          source: "Devpost",
          category: "hackathon",
          url: h.url,
          prize_usd: prize,
          deadline: h.submission_period_dates || null,
          time_left: h.time_left_to_submission || null,
          location: h.displayed_location?.location || "Online",
          registrations: h.registrations_count || 0,
          org: h.organization_name || null,
          themes: (h.themes || []).map((t) => t.name),
          description: null,
          raw: h,
        });
      }
    } catch (e) {
      console.warn(`  devpost: ${e.message}`);
    }
  }
  return out;
}

function parsePrize(s) {
  if (!s) return 0;
  const m = String(s).replace(/<[^>]+>/g, "").replace(/[^0-9,]/g, "");
  const n = parseInt(m.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ── Source: HackerOne public bug bounties ────────────────────────────────
export async function scanHackerOne() {
  const out = [];
  try {
    // Public hacktivity feed (disclosed reports with bounties)
    const d = await fetchJson("https://hackerone.com/hacktivity.json?sort_type=latest_disclosable_activity_at&filter=type%3Apublic&page=1");
    for (const item of d?.activities || []) {
      const bounty = item.bounty?.amount || item.bounty_amount || null;
      if (!bounty) continue;
      out.push({
        id: `h1-${item.id || item.url}`,
        title: item.title || item.team_name || "HackerOne report",
        source: "HackerOne",
        category: "bugbounty",
        url: item.url || `https://hackerone.com${item.path || ""}`,
        prize_usd: parseBounty(bounty),
        deadline: null,
        program: item.team_name || null,
        severity: item.severity || null,
        description: item.description || null,
        raw: item,
      });
    }
  } catch (e) {
    console.warn(`  hackerone: ${e.message}`);
  }
  return out;
}

function parseBounty(s) {
  const m = String(s).match(/\$([0-9,]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
}

// ── Source: Agentic.Market (agent services & paid APIs) ──────────────────
export async function scanAgenticMarket() {
  const out = [];
  try {
    const d = await fetchJson("https://api.agentic.market/v1/services?limit=100&offset=0");
    for (const s of d.services || []) {
      const endpoints = s.endpoints || [];
      const prices = endpoints.map((e) => parseBounty(e.price)).filter((n) => n > 0);
      out.push({
        id: `agentic-${s.id}`,
        title: s.name || s.domain,
        source: "Agentic.Market",
        category: "agent-market",
        url: s.domain ? `https://${s.domain}` : null,
        prize_usd: Math.max(...prices, 0),
        endpoint_count: endpoints.length,
        networks: s.networks || [],
        provider: s.provider,
        description: s.description || null,
        raw: s,
      });
    }
  } catch (e) {
    console.warn(`  agentic.market: ${e.message}`);
  }
  return out;
}

// ── Source: CoinGecko (newly listed / trending tokens) ───────────────────
export async function scanCoinGecko() {
  const out = [];
  try {
    // New listings (via /coins/list is huge; use the markets endpoint sorted by id for newest)
    const d = await fetchJson("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=id_asc&per_page=50&page=1");
    for (const c of d) {
      out.push({
        id: `gecko-${c.id}`,
        title: `${c.name} ($${String(c.symbol).toUpperCase()})`,
        source: "CoinGecko",
        category: "token",
        url: `https://www.coingecko.com/en/coins/${c.id}`,
        price_usd: c.current_price,
        market_cap: c.market_cap,
        change_24h: c.price_change_percentage_24h,
        ath_change: c.ath_change_percentage,
        description: `Newly-listed token. 24h ${c.price_change_percentage_24h?.toFixed(2)}%`,
        raw: c,
      });
    }
  } catch (e) {
    console.warn(`  coingecko: ${e.message}`);
  }
  return out;
}

// ── Source: GitHub good-first-issues with bounties (via search) ──────────
export async function scanGitHubBounties() {
  const out = [];
  try {
    const queries = ["bounty", "reward", "paid issue"];
    for (const q of queries) {
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q + " is:issue is:open")}&sort=updated&order=desc&per_page=20`;
      const d = await fetchJson(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "opportunity-radar" } });
      for (const i of d.items || []) {
        out.push({
          id: `gh-${i.id}`,
          title: i.title,
          source: "GitHub",
          category: "bounty",
          url: i.html_url,
          prize_usd: 0,
          repo: i.repository_url?.split("/").slice(-2).join("/"),
          comments: i.comments,
          created: i.created_at,
          description: i.body?.slice(0, 200) || null,
          raw: i,
        });
      }
    }
  } catch (e) {
    console.warn(`  github: ${e.message}`);
  }
  return out;
}

// ── Ranking ──────────────────────────────────────────────────────────────
// Expected value = prize × win probability / effort, tuned per category.
const EFFORT = {
  hackathon: 3,      // days of work
  bugbounty: 2,
  bounty: 1,
  grant: 2,
  "agent-market": 0,
  token: 0,
};

const WIN_P = {
  hackathon: 0.05,   // ~5% win rate typical
  bugbounty: 0.15,
  bounty: 0.2,
  grant: 0.1,
  "agent-market": 0.5,
  token: 0.1,
};

export function rank(items) {
  return items
    .map((it) => {
      const effort = EFFORT[it.category] ?? 2;
      const winP = WIN_P[it.category] ?? 0.1;
      const prize = it.prize_usd || 0;
      // Expected value per hour-ish unit
      const ev = prize * winP / Math.max(effort, 0.5);
      return { ...it, expected_value: Math.round(ev), effort, win_probability: winP };
    })
    .sort((a, b) => b.expected_value - a.expected_value);
}

// ── Main ─────────────────────────────────────────────────────────────────
export async function scanAll() {
  console.log("Scanning opportunity sources...\n");
  const sources = [
    ["Devpost hackathons", scanDevpost],
    ["HackerOne bounties", scanHackerOne],
    ["Agentic.Market", scanAgenticMarket],
    ["CoinGecko tokens", scanCoinGecko],
    ["GitHub bounties", scanGitHubBounties],
  ];
  const all = [];
  for (const [name, fn] of sources) {
    process.stdout.write(`  ${name}... `);
    try {
      const items = await fn();
      console.log(`${items.length}`);
      all.push(...items);
    } catch (e) {
      console.log(`FAILED (${e.message})`);
    }
  }
  // Browser-rendered sources (Immunefi, HackerOne, Gitcoin)
  try {
    const { runBrowserScrapers } = await import("./sources/browser.mjs");
    const browserItems = await runBrowserScrapers();
    all.push(...browserItems);
  } catch (e) {
    console.warn(`  browser scrapers: ${e.message}`);
  }
  const ranked = rank(all);
  const result = {
    scanned_at: new Date().toISOString(),
    total: all.length,
    by_category: groupBy(all, "category"),
    opportunities: ranked,
  };
  writeFileSync(path.join(DATA_DIR, "opportunities.json"), JSON.stringify(result, null, 2));
  console.log(`\n✅ ${all.length} opportunities → data/opportunities.json`);
  return result;
}

function groupBy(arr, key) {
  return arr.reduce((acc, x) => {
    acc[x[key]] = (acc[x[key]] || 0) + 1;
    return acc;
  }, {});
}

// ── Brief ────────────────────────────────────────────────────────────────
export function renderBrief(result, limit = 30) {
  const lines = [];
  lines.push(`# 💰 Daily Money Radar`);
  lines.push(`_${new Date(result.scanned_at).toISOString().slice(0, 10)} — ${result.total} opportunities found_`);
  lines.push("");
  lines.push(`## Categories`);
  for (const [cat, n] of Object.entries(result.by_category).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${cat}**: ${n}`);
  }
  lines.push("");
  lines.push(`## Top ${limit} by expected value`);
  lines.push("");
  lines.push(`| # | Opportunity | Source | Prize | EV | Deadline |`);
  lines.push(`|---|---|---|---|---|---|`);
  result.opportunities.slice(0, limit).forEach((o, i) => {
    const prize = o.prize_usd ? `$${o.prize_usd.toLocaleString()}` : "—";
    const ev = o.expected_value ? `$${o.expected_value.toLocaleString()}` : "—";
    const dl = o.deadline || o.time_left || "—";
    const title = o.title.length > 45 ? o.title.slice(0, 42) + "…" : o.title;
    const link = o.url ? `[${title}](${o.url})` : title;
    lines.push(`| ${i + 1} | ${link} | ${o.source} | ${prize} | ${ev} | ${dl} |`);
  });
  lines.push("");
  lines.push(`---`);
  lines.push(`_Full data: ~/opportunity-radar/data/opportunities.json_`);
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--serve")) {
  const { startServer } = await import("./server.mjs");
  startServer();
} else {
  const result = await scanAll();
  if (args.includes("--brief")) {
    console.log("\n" + renderBrief(result));
  }
}