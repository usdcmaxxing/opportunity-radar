// Scrape JS-rendered opportunity sources with Playwright.
// Immunefi + HackerOne are SPAs — plain HTTP returns HTML shells.
import { chromium } from "playwright";

// Playwright browsers live in the macOS cache, not the hermes tools dir.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${process.env.HOME}/Library/Caches/ms-playwright`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Parse "$242.3k" / "$3M" / "$250,000" into USD
export function money(s) {
  if (!s) return 0;
  const t = String(s).trim();
  const m = t.match(/\$?\s*([0-9][0-9,.]*)\s*([kKmM])?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, ""));
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k") n *= 1_000;
  if (suffix === "m") n *= 1_000_000;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// ── Immunefi ─────────────────────────────────────────────────────────────
// Table rows: "Project  Triaged by Immunefi  $paid  $max  Private  date  View bounty"
export async function scanImmunefi(browser) {
  const out = [];
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto("https://immunefi.com/explore/?view=grid", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);

    const rows = await page.$$eval("table tr", (trs) => trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td, th")).map((c) => (c.textContent || "").replace(/\s+/g, " ").trim());
      const link = tr.querySelector("a")?.href || null;
      return { cells, link };
    }));

    for (const r of rows) {
      const c = r.cells;
      if (c.length < 3) continue;
      // Skip date-like cells ("13/9/2026") before parsing money
      const moneyCells = c
        .filter((x) => !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x.trim()))
        .map(money)
        .filter((n) => n > 0);
      if (moneyCells.length === 0) continue;
      const name = c[0];
      if (!name || name.length > 80) continue;
      // Highest money value is the max bounty; the next is paid-out
      const sorted = [...moneyCells].sort((a, b) => b - a);
      const max = sorted[0];
      const paid = sorted[1] ?? 0;
      const date = c.find((x) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(x)) || null;
      out.push({
        id: `immunefi-${name.replace(/\W+/g, "-").toLowerCase()}`,
        title: name.replace(/Triaged by Immunefi/i, "").trim(),
        source: "Immunefi",
        category: "bugbounty",
        url: r.link || "https://immunefi.com/explore/",
        prize_usd: max,
        paid_usd: paid,
        deadline: date,
        description: `Immunefi bug bounty. Paid out: $${paid.toLocaleString()}. Max bounty: $${max.toLocaleString()}.`,
        raw: { cells: c },
      });
    }
  } catch (e) {
    console.warn(`  immunefi: ${e.message}`);
  } finally {
    await page.close();
  }
  return out;
}

// ── HackerOne hacktivity ────────────────────────────────────────────────
export async function scanHackerOne(browser) {
  const out = [];
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto("https://hackerone.com/hacktivity?sort_type=latest_disclosable_activity_at&filter=type%3Apublic", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);

    const rows = await page.$$eval('a[href*="/hacktivity/"]', (as) => as.map((a) => ({
      text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
      href: a.href,
    })));

    for (const r of rows) {
      const m = r.text.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
      if (!m) continue;
      out.push({
        id: `h1-${r.href}`,
        title: r.text.slice(0, 80),
        source: "HackerOne",
        category: "bugbounty",
        url: r.href,
        prize_usd: money(m[0]),
        description: r.text.slice(0, 200),
        raw: { text: r.text },
      });
    }
  } catch (e) {
    console.warn(`  hackerone: ${e.message}`);
  } finally {
    await page.close();
  }
  return out;
}

// ── Gitcoin grants ───────────────────────────────────────────────────────
export async function scanGitcoin() {
  const out = [];
  try {
    const res = await fetch("https://grants-stack-indexer.gitcoin.co/data/1/rounds.json", {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const d = await res.json();
      const rounds = Array.isArray(d) ? d : d.rounds || [];
      for (const r of rounds.slice(0, 30)) {
        out.push({
          id: `gitcoin-${r.id || r.roundId}`,
          title: r.name || "Gitcoin round",
          source: "Gitcoin",
          category: "grant",
          url: `https://explorer.gitcoin.co/#/round/${r.network || 1}/${r.id || ""}`,
          prize_usd: r.matchAmountInUsd || r.totalPot || 0,
          description: r.description || null,
          raw: r,
        });
      }
    }
  } catch (e) {
    console.warn(`  gitcoin: ${e.message}`);
  }
  return out;
}

export async function runBrowserScrapers() {
  const browser = await chromium.launch({ headless: true });
  const all = [];
  const imm = await scanImmunefi(browser);
  console.log(`  Immunefi bounties... ${imm.length}`);
  all.push(...imm);
  const h1 = await scanHackerOne(browser);
  console.log(`  HackerOne bounties... ${h1.length}`);
  all.push(...h1);
  await browser.close();
  const gc = await scanGitcoin();
  console.log(`  Gitcoin grants... ${gc.length}`);
  all.push(...gc);
  return all;
}