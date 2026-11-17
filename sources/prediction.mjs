// Prediction-market edge scanner — Polymarket + Kalshi.
// Finds: cross-venue mispricings on the same event, in-market arbitrage
// (sum of outcomes ≠ 1), and the highest-volume markets.
//
// This is a genuinely different asset class from the rest of the radar:
// event derivatives trade 24/7, are cash-settled, and are API-tradeable.

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return []; }
}

// ── Polymarket ───────────────────────────────────────────────────────────
export async function scanPolymarket(limit = 100) {
  const out = [];
  try {
    const d = await getJson(
      `https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=${limit}&order=volume24hr&ascending=false`
    );
    for (const m of d) {
      // outcomePrices may be a JSON string or an array
      let pricesRaw = m.outcomePrices;
      if (typeof pricesRaw === "string") {
        try { pricesRaw = JSON.parse(pricesRaw); } catch { pricesRaw = []; }
      }
      const prices = (Array.isArray(pricesRaw) ? pricesRaw : []).map(Number).filter((n) => Number.isFinite(n));
      const outcomes = Array.isArray(m.outcomes) ? m.outcomes
        : typeof m.outcomes === "string" ? safeParse(m.outcomes)
        : [];
      const sum = prices.reduce((a, b) => a + b, 0);
      out.push({
        id: `poly-${m.id}`,
        title: m.question,
        source: "Polymarket",
        category: "prediction",
        url: `https://polymarket.com/market/${m.slug}`,
        outcomes,
        prices,
        price_sum: Math.round(sum * 1000) / 1000,
        volume_24h: m.volume24hr || m.volume || 0,
        liquidity: m.liquidity || 0,
        best_bid: m.bestBid,
        best_ask: m.bestAsk,
        spread: m.spread,
        close: m.endDate,
        raw: m,
      });
    }
  } catch (e) {
    console.warn(`  polymarket: ${e.message}`);
  }
  return out;
}

// ── Kalshi ───────────────────────────────────────────────────────────────
export async function scanKalshi(limit = 100) {
  const out = [];
  try {
    // Paginate a couple of times to reach `limit`
    let cursor = null;
    while (out.length < limit) {
      const url = `https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&order=volume_24h&ascending=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const d = await getJson(url);
      for (const m of d.markets || []) {
        const yesBid = m.yes_bid_dollars != null ? Number(m.yes_bid_dollars) : null;
        const yesAsk = m.yes_ask_dollars != null ? Number(m.yes_ask_dollars) : null;
        if (yesBid == null && yesAsk == null) continue;
        out.push({
          id: `kalshi-${m.ticker}`,
          title: m.title,
          source: "Kalshi",
          category: "prediction",
          url: `https://kalshi.com/markets/${m.event_ticker}#${m.ticker}`,
          event_ticker: m.event_ticker,
          ticker: m.ticker,
          yes_bid: yesBid,
          yes_ask: yesAsk,
          yes_mid: yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : (yesBid ?? yesAsk),
          volume_24h: Number(m.volume_24h_fp ?? m.volume_fp ?? 0) || 0,
          close: m.close_time,
          raw: m,
        });
      }
      if (!d.cursor || (d.markets || []).length === 0) break;
      cursor = d.cursor;
    }
  } catch (e) {
    console.warn(`  kalshi: ${e.message}`);
  }
  return out.slice(0, limit);
}

// ── Edge detection ───────────────────────────────────────────────────────
// Normalize a sports/event string for cross-venue matching.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(vs|versus|at|@|and|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Token overlap score between two event names.
function similarity(a, b) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

export function findEdges(poly = [], kalshi = []) {
  const edges = [];

  // 1. In-market arbitrage: mutually-exclusive outcomes summing far from 1
  for (const m of poly) {
    if (m.price_sum > 0 && Math.abs(m.price_sum - 1) > 0.02 && m.outcomes.length >= 2) {
      edges.push({
        kind: "in-market",
        title: m.title,
        detail: `outcomes sum to ${m.price_sum.toFixed(3)} (should be ~1.000)`,
        edge_pct: Math.round(Math.abs(m.price_sum - 1) * 1000) / 10,
        venue: "Polymarket",
        url: m.url,
        volume_24h: m.volume_24h,
      });
    }
  }

  // 2. Cross-venue mispricing on the same event
  const polySports = poly.filter((m) => m.outcomes.length === 2 && m.volume_24h > 1000);
  const kalshiSports = kalshi.filter((m) => m.yes_mid != null && m.volume_24h > 1000);

  for (const p of polySports) {
    let best = null;
    for (const k of kalshiSports) {
      const s = similarity(p.title, k.title);
      if (s >= 0.6 && (!best || s > best.s)) best = { k, s };
    }
    if (!best) continue;
    // Compare the YES-like side: Polymarket outcome[0] price vs Kalshi yes_mid
    const pPrice = p.prices[0];
    if (pPrice == null || best.k.yes_mid == null) continue;
    const diff = Math.abs(pPrice - best.k.yes_mid);
    if (diff < 0.05) continue; // ignore trivial gaps
    edges.push({
      kind: "cross-venue",
      title: p.title,
      detail: `Polymarket ${Math.round(pPrice * 100)}% vs Kalshi ${Math.round(best.k.yes_mid * 100)}% (${Math.round(best.s * 100)}% name match)`,
      edge_pct: Math.round(diff * 1000) / 10,
      venue: "Polymarket ↔ Kalshi",
      url: p.url,
      volume_24h: p.volume_24h + best.k.volume_24h,
    });
  }

  return edges.sort((a, b) => b.edge_pct - a.edge_pct);
}

// ── Combined scan ────────────────────────────────────────────────────────
export async function scanPrediction() {
  const [poly, kalshi] = await Promise.all([scanPolymarket(80), scanKalshi(80)]);
  const edges = findEdges(poly, kalshi);

  // Also surface the highest-volume markets as "opportunities" (tradeable, liquid)
  const markets = [...poly, ...kalshi]
    .filter((m) => (m.volume_24h || 0) > 5000)
    .sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))
    .slice(0, 40)
    .map((m) => {
      const price = m.prices ? m.prices[0] : m.yes_mid;
      return {
        id: m.id,
        title: m.title.length > 80 ? m.title.slice(0, 77) + "…" : m.title,
        source: m.source,
        category: "prediction",
        url: m.url,
        prize_usd: 0,
        volume_24h: m.volume_24h,
        price,
        close: m.close,
        description: `${m.source} event market. 24h volume $${Math.round(m.volume_24h || 0).toLocaleString()}. Price ${price != null ? Math.round(price * 100) + "¢" : "n/a"}.`,
        raw: { source: m.source, price, volume_24h: m.volume_24h },
      };
    });

  return { markets, edges, polyCount: poly.length, kalshiCount: kalshi.length };
}