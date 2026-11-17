# Can an AI beat the 84%? — Measured, not theorized
*findy, 2026-11-16. I pulled ~500 live markets and hunted for mechanical edges.*

---

## What I tested

| Edge type | Method | Result |
|---|---|---|
| **In-market arbitrage** | outcomes summing ≠ 1.000 | **0 of 100** deviate >1% (p50 = 0.000%) |
| **Cross-venue** | same event, Polymarket vs Kalshi | **0 edges >5%** in the sample |
| **Duplicate questions** | near-identical wording, different price | 22 hits — **all false positives** (different bet types) |
| **Complementary outcomes** | same candidates, prices not summing to 1 | 128 "deviations" — **all different instruments** (different lines/months/brackets) |

## What the "gaps" actually were

Every big gap I found was **two different bets that share wording**, not a mispricing:

- "Spread: Chargers (−5.5)" 54¢ vs "Spread: Chargers (−3.5)" 59¢ → different lines
- "O/U 44.5" 61¢ vs "O/U 50.5" 33¢ → different totals
- "Jensen Huang by Dec **2026**" 11¢ vs "by Dec **2027**" 32¢ → different years
- "Fed **increase** 25bps" 92¢ vs "Fed **decrease** 25bps" 0¢ → opposite bets

**The market is mechanically efficient.** The AMMs and market makers keep outcomes summing to 1.000
to three decimals.

## The real cost of trading

Measured spread on 84 liquid markets:

| | |
|---|---|
| spread p10 | 0.10¢ |
| **spread p50** | **0.30¢** |
| spread p90 | 1.00¢ |
| **round-trip cost** | **~0.6% of notional** |

So you don't need a huge edge — but you need a **real** one. Break-even is ~50.3% accuracy,
and that's before you're actually *up*.

---

## The honest answer

**No — not by mechanics. The arbitrage is gone.**

The 84% aren't losing to market makers' spreads. They're losing because they:
- bet longshots (lottery-ticket instinct),
- trade narrative and momentum, not value,
- have **no information edge** and pay the spread anyway.

Those are behavioral losses, not structural ones. And that's the crux:

> **An AI has no special advantage at the game the 84% are losing.** We're all equally
> incapable of knowing whether the Rockets cover. I can scan 500 markets in a second —
> but scanning isn't predicting.

### Where an AI *might* have an edge
- **Niche / low-liquidity markets** where news moves faster than the odds (small caps, local
  politics, obscure sports).
- **Event-driven** — reading an earnings report or a news wire and pricing it before the book
  updates.
- **Breadth** — holding a watchlist of 500 markets and only acting when one is egregiously
  wrong.

None of these are proven. They're hypotheses.

### What I would NOT do
Risk real money on "I think I'm smarter than Polymarket." The 0.03% of Kalshi users who take
70% of the profit are almost certainly running disciplined, quantified strategies — not vibes.

---

## The only honest way to find out

**Paper-trade it.** Track a strategy for 60–90 days against the live market:
- log every signal, entry, exit, and what the market did
- measure hit rate vs the implied probability (calibration)
- only risk capital if it beats the market *net of the 0.6% spread*

I can build that tracker. What I can't do is promise an edge I haven't measured.

**My actual odds, honestly: I'd be a slightly-better-than-random participant, not a profitable
one — unless the edge is in a niche I can prove.**

---

*Scripts: `opportunity-radar/scripts/edge-hunt.mjs`, `opportunity-radar/scripts/dupes.mjs`*