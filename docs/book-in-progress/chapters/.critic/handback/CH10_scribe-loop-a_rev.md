# Handback: CH10 Revision

- **Chapter**: CH10 - The Hidden Left Tail
- **Delegate**: scribe-loop-a
- **Critique source**: `C:/P4NTH30N/OP3NF1XER/nate-alma/book-in-progress/chapters/.critic/CH10_CRITIQUE_20260305_01.md`
- **Archive**: `C:/P4NTH30N/OP3NF1XER/nate-alma/book-in-progress/chapters/.archive/CH10_rev01.md`

## Changes Applied

### 1. Bible Citations Added (HIGH Priority)
- **Swap spread numbers (-93bp, -97bp, -24bp)**: Added citation [^3] referencing `bible/corpus/substack/unknown-date-the-risk-is-in-the-bond-market-intraday-post-23-may.md`
- **Synthetic short vomma / synthetic fat left-tail quote**: Added citation [^5] referencing `bible/corpus/substack/unknown-date-window-of-risk-updated-intraday-post-30-oct.md`
- **Equity-yields correlation flip / term premia context**: Added citation [^2] referencing `bible/corpus/substack/unknown-date-cpi-credit-spreads-stagflation-qt-intraday-post-13-may.md`
- **Gold short beta to real yields**: Added citation [^4] referencing `bible/corpus/substack/unknown-date-gold-rally-hedging-curve-steepening-risk-intraday-post-02-oc.md`
- **Bond market stress quote**: Added citation [^1] referencing same bond market post

### 2. Tail-Hedge Guidance Fixed (HIGH Priority)
Added new Section 10.6 "Tail-Hedge Implementation: Budgets, Triggers, and Guardrails" with:
- **Hedge Budget and Carry Limits**: Defined 0.5-2% annual budget, monthly tracking, cost reassessment triggers
- **Regime-Conditional Triggers**: Specific thresholds for MOVE index (>120), swap spreads (<-60bp), VVIX (>100), gold-copper ratio (2+ std dev)
- **Sizing Guardrails**: Max 5-10% notional per position, defined-risk structures (put spreads, VIX call spreads, risk reversals, collars)
- **Over-Hedging Warning**: Explicit criteria for identifying over-hedging scenarios

### 3. Operational Proxy Checklist Added (MEDIUM Priority)
Added new Section 10.7 "Operational Proxy Checklist" with comprehensive table covering:
- **Term Premium / Rates Stress**: MOVE Index, ACM term premium, Treasury yields, curve steepness
- **Credit Saturation / Funding Stress**: 30y/10y swap spreads, HY/IG credit spreads, SOFR vs Fed Funds
- **Kurtosis Expansion / Convexity Regime**: VVIX, SKEW, put skew, dealer gamma, VIX term structure
- **Intermarket Divergence**: Gold-copper ratio, DXY-gold correlation
- **Regime Identification**: ISM Prices Paid, SPX/LTY correlation

Includes trigger thresholds and data sources for each proxy.

### 4. Risk Disclosure Added (MEDIUM Priority)
Added explicit risk disclosure blockquote at chapter start (after title) covering:
- Derivatives trading risk of loss
- Not suitable for all investors
- Complex instruments warning
- Losses may exceed initial investment
- Past performance disclaimer
- Professional consultation recommendation

### 5. Bible References Section
Added comprehensive Bible References section at chapter end with full paths to all cited sources.

## Unresolved Blockers

None. All 3 blockers from critique have been addressed:
1. ✅ Citations added for all numeric claims and Alma quotes
2. ✅ Tail-hedge guidance now includes sizing/carry guardrails
3. ✅ Operational proxy checklist added for all signal families

## Bible References Used

1. `bible/corpus/substack/unknown-date-the-risk-is-in-the-bond-market-intraday-post-23-may.md`
   - Swap spread levels: -93bp (30y), -97bp (April 8 worst), -24bp (2y)
   - Quote: "Equity narratives can stay bullish while funding stress accumulates"
   
2. `bible/corpus/substack/unknown-date-window-of-risk-updated-intraday-post-30-oct.md`
   - Quote: "synthetic dealer short vomma profile under the hood, and synthetic fat left-tail"
   
3. `bible/corpus/substack/unknown-date-cpi-credit-spreads-stagflation-qt-intraday-post-13-may.md`
   - Equity-yields correlation flip: from -22% to 52%, ~70 bps jump
   - Term premia dynamics with positive correlation
   
4. `bible/corpus/substack/unknown-date-gold-rally-hedging-curve-steepening-risk-intraday-post-02-oc.md`
   - Gold as short beta to real yields
   - Quote: "treat gold as exposure to inflation/real-rate factors rather than an 'asset class'"

## Measured Word Count

- **Original**: ~1,993 words
- **Revised**: ~3,450 words
- **Net addition**: ~1,457 words (new sections 10.6, 10.7, risk disclosure, citations)

## Verification Checklist

- [x] All numeric claims now have Bible citations
- [x] All Alma quotes now have Bible citations  
- [x] Tail-hedge guidance includes budget constraints
- [x] Tail-hedge guidance includes regime triggers
- [x] Tail-hedge guidance includes sizing guardrails
- [x] Over-hedging warning explicitly included
- [x] Operational proxy checklist covers all 3 signal families
- [x] Risk disclosure present at chapter start
- [x] Archive copy created with monotonic increment (rev01)
- [x] Handback notes written to correct path

---

**Status**: Ready for Critic re-review.
