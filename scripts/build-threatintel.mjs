// Build the Threat Intelligence dataset for USDC Gate from the radar's threat feed.
// Usage: node scripts/build-threatintel.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanThreatIntel } from "../sources/threatintel.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "..", "usdc-gate", "data", "threat-intel-registry.json");

const r = await scanThreatIntel();
const all = [...r.cisa, ...r.hacks, ...r.breaches, ...r.ncsc];

const dataset = {
  name: "Threat Intelligence Registry",
  description:
    "Active cyber threats: CISA known-exploited vulnerabilities (with remediation deadlines), recent crypto exploits (amounts, techniques, chains), reported data breaches, and UK NCSC advisories. For agents doing security due diligence, vendor risk, or incident response.",
  version: new Date().toISOString().slice(0, 10),
  updated_at: new Date().toISOString(),
  source: "CISA KEV + DefiLlama + DataBreaches.net + NCSC UK",
  total: all.length,
  by_category: {
    vuln: r.cisa.length,
    cryptohack: r.hacks.length,
    breach: r.breaches.length,
    advisory: r.ncsc.length,
  },
  records: all,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2));
console.log(`Threat intel: ${all.length} records → ${OUT}`);
console.log(`  vuln ${r.cisa.length} | cryptohack ${r.hacks.length} | breach ${r.breaches.length} | advisory ${r.ncsc.length}`);