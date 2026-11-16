# 🌙 Overnight Build — 2026-11-16

*Built by findy while you slept. Two new products, one critical bug fix, and a daily money radar that actually delivers.*

---

## 1. 💰 Money Radar — new product

**Live:** https://opportunity-radar-usdcmaxxing.vercel.app
**Repo:** https://github.com/usdcmaxxing/opportunity-radar
**Delivers:** daily brief to Telegram at **08:00** (findy Hermes cron `money-radar-daily`)

Scans 7 sources and ranks everything by **expected value** (`prize × win_prob / effort`):

| Source | Category | Yield |
|---|---|---|
| Devpost | hackathons | 53 |
| Immunefi | bug bounties | 10 |
| GitHub | paid issues | 60 |
| Agentic.Market | agent services | 100 |
| CoinGecko | new tokens | 50 |
| HackerOne | disclosed bounties | 0 (SPA, needs work) |
| Gitcoin | grants | 0 (indexer down) |

**Total: ~273 opportunities/day.** Top finds right now:

| Opportunity | Prize | EV |
|---|---|---|
| Ethena bug bounty | $3,000,000 | $225,000 |
| The Graph bug bounty | $1,600,000 | $120,000 |
| Lombard Finance | $500,000 | $37,500 |
| DeXe Protocol | $500,000 | $37,500 |
| SSV Network | $250,000 | $18,750 |
| ENS | $250,000 | $18,750 |
| Meta VR Developer Competition | $1,000,000 | $16,667 |
| HackWithAditya | $500,000 | $8,333 |
| Codegeist 2026 | $120,000 | $2,000 |
| Kiroween 2026 | $100,000 | $1,667 |

**Files:** `scanner.mjs`, `sources/browser.mjs` (Playwright), `scripts/build-registries.mjs`, `server.mjs`, `run-daily.sh`, `public/index.html`, `api/opportunities.js`.

**Automation:**
- launchd `com.opportunityradar.daily` → 07:00 scan + registries + brief
- Hermes cron `money-radar-daily` → 08:00 Telegram brief

---

## 2. 🔧 USDC Gate — expanded

**Live:** https://usdc-gate-live.vercel.app

| Metric | Before | After |
|---|---|---|
| Paid endpoints | 12 | **16** |
| Records | 7,248 | **8,828** |
| Datasets | 9 | **13** |

### New datasets
| Endpoint | Records | Price | Source |
|---|---|---|---|
| `/v1/dataset/opportunities` | 124 | $0.03 | Money Radar (hackathons, bounties, grants) |
| `/v1/dataset/defi-protocols` | 250 | $0.02 | DefiLlama |
| `/v1/dataset/chains` | 100 | $0.02 | DefiLlama |
| `/v1/dataset/exchanges` | 100 | $0.02 | CoinGecko |

### 🐛 Critical bug fixed
`check.js` used `__dirname` without defining it (ESM has no `__dirname`). The `try/catch` swallowed the ReferenceError, so **the OFAC sanctions check was silently returning APPROVE for every address** — including SDN-listed ones. The test suite caught it (1 failing test), the fix was one line, and all 18 tests now pass. **This was a live production bug.**

---

## 3. 📊 What this means for revenue

The radar is a **free acquisition tool** and a **paid dataset**. The same data feeds both:
- Free dashboard → traffic + discovery
- `/v1/dataset/opportunities` → $0.03/call from agents

---

## 4. Still blocked (needs you)

1. **Circle Agent Marketplace form** — requires Google sign-in. Details in `publish/submission-package.md`.
2. **Base mainnet migration** — needs USDC + ETH (KYC). Unlocks Circle Marketplace + real agents.
3. **AgenticTrade listing** — https://agentictrade.io/providers

---

## 5. Ideas I did NOT build (next session)

- Airdrop tracker (no good free API found)
- Token unlock calendar (needs a paid source)
- HackerOne proper scraping (SPA, low yield)
- Gitcoin indexer is down
- Email delivery of the brief (Telegram works)

---

*All code is MIT and pushed to GitHub. Nothing here cost money to run.*