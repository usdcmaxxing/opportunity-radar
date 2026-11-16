// Web dashboard for the Opportunity Radar
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "opportunities.json");
const PORT = Number(process.env.PORT || 7777);

function loadData() {
  if (!existsSync(DATA)) return { opportunities: [], total: 0, by_category: {}, scanned_at: null };
  return JSON.parse(readFileSync(DATA, "utf8"));
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Money Radar — Daily Opportunities</title>
<style>
:root{--bg:#0b0e11;--card:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#f78166;--accent2:#58a6ff;--green:#3fb950;--orange:#d29922;--purple:#a371f7}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{padding:1.5rem 2rem;border-bottom:1px solid var(--border);background:linear-gradient(135deg,#0d1117,#161b22)}
header h1{font-size:1.6rem;background:linear-gradient(135deg,var(--accent),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
header .meta{color:var(--muted);font-size:.85rem;margin-top:.25rem}
.container{max-width:1300px;margin:0 auto;padding:1.5rem}
.stats{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:.75rem 1.25rem;text-align:center;flex:1;min-width:120px}
.stat .num{font-size:1.6rem;font-weight:700;color:var(--accent2)}
.stat .label{font-size:.75rem;color:var(--muted)}
.filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}
.filters button{background:var(--card);border:1px solid var(--border);color:var(--muted);padding:.4rem .9rem;border-radius:20px;cursor:pointer;font-size:.85rem}
.filters button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.filters button:hover{border-color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:.88rem;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
th{text-align:left;padding:.7rem .8rem;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);background:#0d1117;position:sticky;top:0}
td{padding:.6rem .8rem;border-bottom:1px solid var(--border)}
tr:hover{background:#1c2128}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
.prize{color:var(--green);font-weight:600}
.ev{color:var(--accent);font-weight:700}
.tag{display:inline-block;padding:.1rem .45rem;border-radius:4px;font-size:.7rem;font-weight:600}
.tag-hackathon{background:#8957e533;color:var(--purple);border:1px solid #8957e555}
.tag-bugbounty{background:#f8514933;color:#f85149;border:1px solid #f8514955}
.tag-bounty{background:#d2992233;color:var(--orange);border:1px solid #d2992255}
.tag-token{background:#23863633;color:var(--green);border:1px solid #23863655}
.tag-agent-market{background:#1f6feb33;color:var(--accent2);border:1px solid #1f6feb55}
.muted{color:var(--muted)}
footer{text-align:center;padding:1.5rem;color:var(--muted);font-size:.8rem;border-top:1px solid var(--border);margin-top:2rem}
</style>
</head>
<body>
<header>
  <h1>💰 Money Radar</h1>
  <div class="meta" id="meta">Loading…</div>
</header>
<div class="container">
  <div class="stats" id="stats"></div>
  <div class="filters" id="filters"></div>
  <table id="table">
    <thead><tr><th>#</th><th>Opportunity</th><th>Category</th><th>Source</th><th>Prize</th><th>EV</th><th>Deadline</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>
<footer>Automated daily scan · data: ~/opportunity-radar/data/opportunities.json</footer>
<script>
let data = { opportunities: [], by_category: {} };
let activeFilter = 'all';

async function load() {
  const res = await fetch('/api/opportunities');
  data = await res.json();
  render();
}

function render() {
  document.getElementById('meta').textContent =
    (data.total || 0) + ' opportunities · scanned ' + ((data.scanned_at || '').slice(0,16).replace('T',' ') || 'never');

  const cats = data.by_category || {};
  const stats = [
    { num: data.total || 0, label: 'Total' },
    ...Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v]) => ({ num: v, label: k })),
  ];
  document.getElementById('stats').innerHTML = stats.map(s =>
    \`<div class="stat"><div class="num">\${s.num}</div><div class="label">\${s.label}</div></div>\`).join('');

  const filterCats = ['all', ...Object.keys(cats).sort()];
  document.getElementById('filters').innerHTML = filterCats.map(c =>
    \`<button class="\${c===activeFilter?'active':''}" onclick="setFilter('\${c}')\">\${c}</button>\`).join('');

  const items = (data.opportunities || []).filter(o => activeFilter === 'all' || o.category === activeFilter);
  document.getElementById('tbody').innerHTML = items.slice(0, 200).map((o, i) => {
    const title = (o.title || '').slice(0, 60);
    const link = o.url ? \`<a href="\${o.url}" target="_blank" rel="noopener">\${title}</a>\` : title;
    const prize = o.prize_usd ? '$' + o.prize_usd.toLocaleString() : '<span class="muted">—</span>';
    const ev = o.expected_value ? '$' + o.expected_value.toLocaleString() : '<span class="muted">—</span>';
    const dl = o.deadline || o.time_left || '<span class="muted">—</span>';
    return \`<tr>
      <td class="muted">\${i+1}</td>
      <td>\${link}</td>
      <td><span class="tag tag-\${o.category}">\${o.category}</span></td>
      <td class="muted">\${o.source}</td>
      <td class="prize">\${prize}</td>
      <td class="ev">\${ev}</td>
      <td class="muted">\${dl}</td>
    </tr>\`;
  }).join('');
}

function setFilter(c) { activeFilter = c; render(); }
load();
setInterval(load, 30000);
</script>
</body>
</html>`;

export function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/opportunities") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(loadData()));
      return;
    }
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, total: loadData().total }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  server.listen(PORT, () => console.log(`💰 Money Radar → http://localhost:${PORT}`));
}

if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  startServer();
}