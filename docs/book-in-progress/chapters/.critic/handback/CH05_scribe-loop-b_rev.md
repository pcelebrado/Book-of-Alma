# Handback: CH05 Revision 03

**Chapter**: CH05 - Vanna and Speed Profiles  
**Delegate**: scribe-loop-b  
**Critique Source**: OP3NF1XER/nate-alma/book-in-progress/chapters/.critic/CH05_CRITIQUE_20260306_02.md  
**Date**: 2026-03-06

---

## Changes Applied

### 1. Fixed Vanna Sign Convention (Section 5.3)
**Removed overgeneralized statements:**
- ❌ "Long OTM calls and short OTM puts carry positive vanna"
- ❌ "Long OTM puts and short OTM calls carry negative vanna"

**Replaced with:**
- Clean sign convention definitions without option-type heuristics
- Added clarifying sentence: "The sign of 'dealer net vanna' is an output of a positioning aggregation tool (surface-weighted across all strikes and tenors) and cannot be safely inferred from a single-contract cartoon."

### 2. Rewrote 2×2 Hedge-Flow Mapping Table
**Previous (incorrect):**
| Dealer Net Vanna | IV Rising | IV Falling |
|-----------------|-----------|------------|
| **Positive** | Dealers get longer delta → Buy futures into strength (supportive) | Dealers get shorter delta → Sell futures into weakness (suppressive) |
| **Negative** | Dealers get shorter delta → Sell futures into strength (suppressive) | Dealers get longer delta → Buy futures into weakness (supportive) |

**Revised (Bible-consistent):**
| Dealer Net Vanna | IV Rising | IV Falling |
|-----------------|-----------|------------|
| **Positive** | Dealers get longer delta → Sell futures to re-hedge | Dealers get shorter delta → Buy futures to re-hedge |
| **Negative** | Dealers get shorter delta → Buy futures to re-hedge | Dealers get longer delta → Sell futures to re-hedge |

**Anchor added:** Direct quote from Alma's Sept 18 post: "If vol is sold, negative vanna would make the dealer longer delta, making him sell futures, and vice versa."

**Key distinction:** Table now explicitly shows:
1. How dealer delta exposure changes as IV changes
2. What hedge trade that implies (buy/sell futures) to re-hedge

### 3. Normalized Bible Citation Paths
Changed all citations from `dev/memory/alma-teachings/bible/corpus/substack/...` to `bible/corpus/substack/...` (9 occurrences):

| Line | Before | After |
|------|--------|-------|
| 26 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-liquidity-structure... | bible/corpus/substack/unknown-date-liquidity-structure... |
| 38 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-opex-flows... | bible/corpus/substack/unknown-date-opex-flows... |
| 69 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-opex-flows... | bible/corpus/substack/unknown-date-opex-flows... |
| 102 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-opex-flows... | bible/corpus/substack/unknown-date-opex-flows... |
| 159 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-the-risk-of-vanna... | bible/corpus/substack/unknown-date-the-risk-of-vanna... |
| 185 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-opex-flows... | bible/corpus/substack/unknown-date-opex-flows... |
| 220 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-vomma-supply... | bible/corpus/substack/unknown-date-vomma-supply... |
| 236 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-theta-decay... | bible/corpus/substack/unknown-date-theta-decay... |
| 240 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-weekly-post-24-28... | bible/corpus/substack/unknown-date-weekly-post-24-28... |
| 282 | dev/memory/alma-teachings/bible/corpus/substack/unknown-date-vomma-supply... | bible/corpus/substack/unknown-date-vomma-supply... |

---

## Unresolved Blockers

None. All critical issues from CRITIQUE_20260306_02.md have been resolved.

---

## Bible References Used

- `bible/corpus/substack/unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md` — Primary anchor for vanna sign convention and hedge-flow mapping (Sept 18 OpEx flows post)
- `bible/corpus/substack/unknown-date-liquidity-structure-let-s-put-speed-profile-into-context.md`
- `bible/corpus/substack/unknown-date-the-risk-of-vanna-regime-shift-trades-tariffs-deadline-intra.md`
- `bible/corpus/substack/unknown-date-theta-decay-when-will-vol-come-back-intraday-post-30-june-wi.md`
- `bible/corpus/substack/unknown-date-weekly-post-24-28-march.md`
- `bible/corpus/substack/unknown-date-vomma-supply-short-vanna-risk-intraday-post-29-aug.md`

---

## Measured Word Count

- **Previous**: 5,206 words
- **Current**: ~5,230 words (+24 words from clarifying sentence and anchor quote)

---

## Archive Location

Revision archived at: `OP3NF1XER/nate-alma/book-in-progress/chapters/.archive/CH05_rev03.md`
