# Scribe Loop A Handback: CH05 Revision

**Chapter:** CH05 - Vanna and Speed Profiles  
**Delegate:** scribe-loop-a  
**Critique source:** `OP3NF1XER/nate-alma/book-in-progress/chapters/.critic/CH05_CRITIQUE_20260306_01.md`  
**Date:** 2026-03-06  

---

## Changes Applied

### 1. Chapter Expansion (+3316 words)
- **Original word count:** ~1890 words
- **Revised word count:** 5206 words
- **Expansion:** +3316 words (within target +3000 to +4500)
- **Status:** COMPLETE

New sections added:
- 5.2 The Danger of Schematic Oversimplification (new section on why skew-contract modeling is limited)
- 5.3 Sign and Scope: A Technical Box (sign conventions, 2×2 scenario table, conditioning checklist)
- 5.4 Vanna Reversal Dynamics (expanded with Vanna-Volga Interaction subsection)
- 5.5 Case Study: Vanna Regime Shift Risk (July 1, 2025) (Bible-anchored case study)
- 5.6 Case Study: Supportive vs. Suppressive OpEx Flows (September 18, 2025) (Bible-anchored case study)
- 5.7 Volatility Impact on Delta Exposure (expanded)
- 5.8 The JPM Collar: Context, Not Causation (replaced citation)
- 5.9 Speed Profile in Practice (expanded with Speed and Gamma Acceleration Trap subsection)
- 5.10 Worked Example: August 29 Vomma Supply and Short Vanna Risk (expanded with risk management specifics)

### 2. JPM Collar Case Study Integrity Fix
- **Removed:** Citation to `unknown-date-bottom-jpm-collar-opex-systematics-intraday-post-14-march.md` (header-only, no substantive content)
- **Replaced with:** 
  - `unknown-date-theta-decay-when-will-vol-come-back-intraday-post-30-june-wi.md` (contains actual collar warning text)
  - `unknown-date-weekly-post-24-28-march.md` (contains collar mechanics explanation)
- **Status:** COMPLETE

### 3. Alma Attribution Discipline
All "Alma warns/frames/teaches" statements now have adjacent Bible citations:
- Section 5.0: Citation to `unknown-date-liquidity-structure-let-s-put-speed-profile-into-context.md`
- Section 5.1: Citation to `unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md`
- Section 5.2: Direct quote with citation to Sept 18 post
- Section 5.5: Full case study anchored to July 1 post
- Section 5.6: Full case study anchored to Sept 18 post
- Section 5.7: Citation to Aug 29 post
- Section 5.8: Citations to June 30 and March 24-28 posts
- **Status:** COMPLETE

### 4. Sign Convention and Conditioning Box (Section 5.3)
Added comprehensive technical box including:
- **Vanna sign convention:** ∂Δ/∂σ definition, positive vs negative vanna
- **Speed sign convention:** ∂Γ/∂S definition, positive vs negative speed
- **2×2 scenario table:** (IV up/down) × (dealer net vanna positive/negative) with qualitative hedge-flow direction
- **Critical conditioning note:** Explicit statement that flow depends on dealer net vanna sign in relevant zone/tenor + IV direction
- **Conditioning checklist:** 5-point verification list before executing vanna/speed-based trades
- **Status:** COMPLETE

### 5. Risk-Budget Guardrails
Every Trading Implication block now includes sizing/risk-budget guidance:
- "Size small, define your invalidation level before entry..."
- "Size positions so that a speed-driven gamma acceleration cannot damage your account..."
- "Never risk more than you can afford to lose in a single vanna-driven reversal..."
- "Size for vol expansion, not vol compression..."
- "Reduce position size until you have flow confirmation..."
- **Status:** COMPLETE

### 6. Schematic Labeling
Where CH05 discusses negative speed profile (MM long OTM puts / short OTM calls):
- Now explicitly labeled as "Alma's schematic example"
- Citation to `unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md` adjacent to the claim
- Repeated warnings that schematic modeling oversimplifies reality
- **Status:** COMPLETE

---

## Unresolved Blockers

None. All 4 blockers from the critique have been addressed:
1. ✅ Chapter expansion (+3000 to +4500 words) - ACHIEVED (+3316 words)
2. ✅ JPM collar case-study citation integrity - FIXED
3. ✅ Alma attribution discipline - NORMALIZED
4. ✅ Sign conventions / conditioning for vanna and speed - ADDED

---

## Bible References Used

### Primary Citations (in-text):
1. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-liquidity-structure-let-s-put-speed-profile-into-context.md` - anti-furu framing, Greek theater warning
2. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md` - schematic example, conditioning language, Sept 18 case study
3. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-the-risk-of-vanna-regime-shift-trades-tariffs-deadline-intra.md` - July 1 vanna regime shift case study
4. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-vomma-supply-short-vanna-risk-intraday-post-29-aug.md` - Aug 29 worked example, numeric data
5. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-theta-decay-when-will-vol-come-back-intraday-post-30-june-wi.md` - JPM collar warning (replacement citation)
6. `dev/memory/alma-teachings/bible/corpus/substack/unknown-date-weekly-post-24-28-march.md` - collar mechanics explanation

### Removed References:
- `unknown-date-bottom-jpm-collar-opex-systematics-intraday-post-14-march.md` - file contained only header, no substantive content to support quoted lesson

---

## Measured Word Count

- **Final word count:** 5206 words
- **Original word count:** ~1890 words
- **Net expansion:** +3316 words
- **Target:** 5000-6000 words
- **Status:** ✅ WITHIN TARGET

---

## Chapter Structure Summary

| Section | Content | Bible Anchor |
|---------|---------|--------------|
| 5.0 | Why Second-Order Greeks Matter | Liquidity structure post |
| 5.1 | Understanding Speed | Sept 18 OpEx flows post |
| 5.2 | Danger of Schematic Oversimplification | Sept 18 OpEx flows post |
| 5.3 | Sign and Scope: Technical Box | Author synthesis (conventions) |
| 5.4 | Vanna Reversal Dynamics | Author synthesis + mechanics |
| 5.5 | Case Study: Vanna Regime Shift | July 1 regime shift post |
| 5.6 | Case Study: OpEx Flows | Sept 18 OpEx flows post |
| 5.7 | Volatility Impact on Delta | Aug 29 vomma supply post |
| 5.8 | JPM Collar Context | June 30 + March 24-28 posts |
| 5.9 | Speed Profile in Practice | Author synthesis |
| 5.10 | Worked Example: Aug 29 | Aug 29 vomma supply post |

---

## Verification Checklist

- [x] Chapter expanded to 5k-6k word target
- [x] March 14 JPM collar citation removed
- [x] Replacement collar citations added (June 30, March 24-28)
- [x] All Alma claims have adjacent Bible citations
- [x] Sign convention box added (∂Δ/∂σ, ∂Γ/∂S)
- [x] 2×2 scenario table included
- [x] Flow mapping conditioning explicitly stated
- [x] Schematic speed profile labeled as Alma's example
- [x] Risk-budget guardrails in every Trading Implication
- [x] Two Bible-anchored case studies added (July 1, Sept 18)
- [x] Anti-furu citation preserved (liquidity structure post)

---

## Next Steps

Revision complete. CH05 is ready for next review cycle or integration into manuscript.
