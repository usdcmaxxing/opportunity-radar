// Threat intelligence — aggregate active attacks, exploits and breaches.
// Sources: CISA KEV (known exploited vulns), DefiLlama hacks, DataBreaches.net, NCSC UK.
// Legitimate defensive intelligence: who got hit, how, and what to patch.

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function daysAgo(ts, days) {
  return Date.now() - ts * 1000 < days * 86_400_000;
}

// ── CISA Known Exploited Vulnerabilities ─────────────────────────────────
export async function scanCISA(limit = 60) {
  const out = [];
  try {
    const d = await getJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
    const vulns = d.vulnerabilities || [];
    for (const v of vulns) {
      const added = new Date(v.dateAdded).getTime() / 1000;
      out.push({
        id: `cisa-${v.cveID}`,
        title: `${v.cveID} — ${v.vulnerabilityName}`,
        source: "CISA KEV",
        category: "vuln",
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
        cve: v.cveID,
        vendor: v.vendorProject,
        product: v.product,
        due_date: v.dueDate,
        rbp: v.requiredAction,
        date_added: v.dateAdded,
        fresh: daysAgo(added, 30),
        description: `${v.vulnerabilityName}. ${v.requiredAction || ""} (due ${v.dueDate || "n/a"})`,
        raw: v,
      });
    }
  } catch (e) {
    console.warn(`  cisa: ${e.message}`);
  }
  return out.sort((a, b) => (b.fresh - a.fresh)).slice(0, limit);
}

// ── DefiLlama crypto exploits ────────────────────────────────────────────
export async function scanCryptoHacks(limit = 60) {
  const out = [];
  try {
    const d = await getJson("https://api.llama.fi/hacks");
    const arr = Array.isArray(d) ? d : d.hacks || [];
    for (const h of arr) {
      const ts = h.date;
      if (!daysAgo(ts, 90)) continue; // recent only
      out.push({
        id: `hack-${h.defillamaId || h.name + ts}`,
        title: `${h.name} — ${h.classification || "Exploit"}`,
        source: "DefiLlama",
        category: "cryptohack",
        url: "https://defillama.com/hacks",
        amount_usd: h.amount,
        chain: (h.chain || []).join(", "),
        technique: h.technique,
        target_type: h.targetType,
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        description: `${h.name} exploited via ${h.technique || h.classification}. Loss $${(h.amount || 0).toLocaleString()}.`,
        raw: h,
      });
    }
  } catch (e) {
    console.warn(`  defillama: ${e.message}`);
  }
  return out.sort((a, b) => (b.amount_usd || 0) - (a.amount_usd || 0)).slice(0, limit);
}

// ── DataBreaches.net RSS ─────────────────────────────────────────────────
export async function scanDataBreaches(limit = 40) {
  const out = [];
  try {
    const xml = await getText("https://www.databreaches.net/feed/");
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const it of items.slice(0, limit)) {
      const title = (it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
      const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
      const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      const desc = ((it.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || "").replace(/<[^>]+>/g, "").slice(0, 300);
      out.push({
        id: `breach-${link || title}`,
        title: title.trim().slice(0, 120),
        source: "DataBreaches.net",
        category: "breach",
        url: link.trim(),
        date: pub,
        description: desc,
        raw: { title, link, pub },
      });
    }
  } catch (e) {
    console.warn(`  databreaches: ${e.message}`);
  }
  return out;
}

// ── NCSC UK reports ──────────────────────────────────────────────────────
export async function scanNCSC(limit = 30) {
  const out = [];
  try {
    const xml = await getText("https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml");
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const it of items.slice(0, limit)) {
      const title = (it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
      const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
      out.push({
        id: `ncsc-${link || title}`,
        title: title.trim().slice(0, 120),
        source: "NCSC UK",
        category: "advisory",
        url: link.trim(),
        description: "",
        raw: { title, link },
      });
    }
  } catch (e) {
    console.warn(`  ncsc: ${e.message}`);
  }
  return out;
}

export async function scanThreatIntel() {
  const [cisa, hacks, breaches, ncsc] = await Promise.all([
    scanCISA(), scanCryptoHacks(), scanDataBreaches(), scanNCSC(),
  ]);
  return { cisa, hacks, breaches, ncsc };
}