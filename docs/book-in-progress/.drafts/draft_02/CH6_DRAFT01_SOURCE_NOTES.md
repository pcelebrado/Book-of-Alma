# CH6_DRAFT01_SOURCE_NOTES

## Chapter 6: Charm, Color and Dealer Hedging

### Primary Sources Used

#### 1. OpEx Flows, Supportive or Suppressive Vanna/Charm (Sept 18, 2025)
**File:** `unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md`
**Key Concepts:**
- Supportive/suppressive flows from passive mechanics
- Passive flows can be overwritten by shadow Greek-generated flows
- Net exposure on speed profiles not straight indicator of vanna/charm impacts
- Weights differ across chain and tenors, generating different impacts
- Negative speed profile example: MM long OTM puts, short OTM calls
- Result: net positive charm (OTM put has positive charm, short OTM call also positive)
- As time passes, long charm makes dealer longer delta, adding layer to sell futures
- Schematic positioning could be called "right-tailish"
- Generates liquidity to downside, prevents downside vol squeezes
- Opens gate for upward gamma squeezes
- Centroid of setup determines which scenario activates

#### 2. Theta Decay, "When Will Vol Come Back?" (June 30, 2025)
**File:** `unknown-date-theta-decay-when-will-vol-come-back-intraday-post-30-june-wi.md`
**Key Concepts:**
- Theta decay suppressing volatility expectations
- Vol not returning immediately but from next Tuesday/Wednesday window
- Not a vol squeeze, but trigger of a grind up
- At these points: cash out of positions (short vol, long delta)
- Roll up only small percentage
- Don't open new longs
- Buy cheap July/August OTM put spreads (30/10 deltas)
- Reversion model says 80%+
- Want to hedge this out
- Other conditions not given yet for net short bias
- Risk target remains August as pivot
- JPM collar reset has more local impact, minor in broader context

#### 3. OpEx Flows Pt. 2 (Sept 19, 2025)
**File:** `unknown-date-opex-flows-pt-2-intraday-post-19-sept.md`
**Key Concepts:**
- Repetition of Sept 18 concepts
- Context-dependent nature of supportive/suppressive
- Shadow Greek interference with passive flows
- Speed profile complexity across tenors

#### 4. OpEx + Intraday Post (June 20, 2025)
**File:** `unknown-date-opex-intraday-post-20-june.md`
**Key Concepts:**
- Vol of vol supply
- OpEx Greeks dynamics
- FOMC expectations
- Geopolitical noise outweighs Fed easing expectations

#### 5. Important Trading Advice (June 16, 2025)
**File:** `unknown-date-important-trading-advice-intraday-post-16-june.md`
**Key Concepts:**
- Intraday edge opportunities: one, two at max
- Usually during AM and after 2 PM
- First 20-30 minutes: high intraday vol from 0DTE positioning
- Better to watch first 30-40 minutes
- Wait for market to decide direction
- Build structure: retested support/resistance zones
- Show net drift, unveil influential effects
- Cannot beat HF algos: speed and emotionlessness
- Decide daily budget, loss limit, profit limit
- Decide which side you "feel", which you can read
- Based on intraday setup, decide entry point, conditions, size
- Determine conditions that disprove trade = take loss
- Wait until market gives it to you
- If doesn't give it, don't FOMO into other side
- Wait for next one or leave desk for tomorrow
- Not obligated to give money to market makers
- Key is careful and conscious planning

#### 6. FOMC Preview, Trading Advises (June 17, 2025)
**File:** `unknown-date-fomc-preview-trading-advises-intraday-post-17-june.md`
**Key Concepts:**
- Vanna model signals
- Spot/vol beta: 0.095062 avg, 0.043498 median, closed 1.007296
- 478% increase during day
- Vvol realized to downside as predicted
- Hormuz threat monitoring
- Skew direction important for vol profile reversal

#### 7. Post-CPI, SPX to Yields Beta Flip (June 12, 2025)
**File:** `unknown-date-post-cpi-spx-to-yields-beta-flip-intraday-post-12-june.md`
**Key Concepts:**
- Reversion model signals
- Momentum and sentiment thresholds
- SPX/yields beta flip timing
- Regime shift dynamics
- Term-premium normalization

#### 8. Intraday Post, Reversion Trading Setup (June 9, 2025)
**File:** `unknown-date-intraday-post-09-june-reversion-trading-setup.md`
**Key Concepts:**
- Strong bullish imbalance
- Market confirmed positive drift
- More edge in vol market this week

### Key Alma Direct Quotes

From OpEx Flows post:
> "The supportive/suppressive is coming from the passive flows. But passive flows can be overwritten/interfered by shadow greek generated flows, and also the net exposure on a short or long speed profile is not a straight indicator to judge the vanna and charm flows because their weights can be different over the chain and tenors, generating different impacts."

From Theta Decay post:
> "As you know I said last week: vol selling, and now I said that I don't expect vol this week, rather from next week Tuesday/Wednesday window. Not a vol squeeze or something, but the trigger of a grind up."

From Important Trading Advice post:
> "During the day there is only one intraday edge opportunity, two at max. Usually during the AM, and after 2 PM."

> "In the first 20-30 min, intraday vol is high, bcs that when ppl are taking their 0DTE positions. You better watch during the first 30-40 min, and wait for the market to decide where it wants to go."

> "You are not obligated to give your money to the market makers."

### Technical Concepts Referenced

1. **Charm (Delta Decay)**: Rate of change of delta with respect to time
2. **Color (Gamma Decay)**: Rate of change of gamma with respect to time
3. **Theta Decay**: Time decay of option value
4. **Shadow Greeks**: Higher-order sensitivities not in standard Greek set
5. **0DTE**: Zero Days to Expiration options
6. **Passive Flows**: Mechanical hedging flows not driven by directional views
7. **Inventory Normalization**: Dealer risk reduction into close
8. **Reversion Model**: Alma's proprietary mean-reversion probability model

### Trading Implications Documented

1. Model intraday bias with time windows
2. Separate midday and close playbooks
3. Refresh regime assumptions at checkpoints
4. When charm dominates, prioritize reversion or stand aside
5. Wait for market to give entry; don't FOMO
6. Determine invalidation conditions before entry

### Gaps and Web References

None required. All concepts sourced from Alma teachings corpus.

### Synthesis Notes

Chapter 6 bridges second-order Greeks (Chapter 5) with practical intraday application (Chapter 7). The time-decay mechanics (charm, theta, color) are often overlooked by traders focused on price and news. Alma's emphasis on the clock as an active participant creates edge for those who respect it.

The end-of-day flow section draws heavily on Alma's specific timing advice (AM session, after 2 PM) and the distinction between midday narrative-driven flow and close mechanical rebalancing. This is practical, actionable content.

Charm-dominant regimes are where Alma's framework shines—explaining why markets can ignore loud headlines and remain range-bound due to mechanical suppression. The June 30 post on "when will vol come back" is the canonical example.
