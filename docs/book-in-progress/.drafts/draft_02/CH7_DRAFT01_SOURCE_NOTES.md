# CH7_DRAFT01_SOURCE_NOTES

## Chapter 7: The Intraday Playbook

### Primary Sources Used

#### 1. Post-CPI, SPX to Yields Beta Flip (June 12, 2025)
**File:** `unknown-date-post-cpi-spx-to-yields-beta-flip-intraday-post-12-june.md`
**Key Concepts:**
- Reversion model gave 80%+ signal for reversion
- Market fell 70 pts+ since signal
- Momentum and sentiment thresholds for confirmation
- SPX/yields beta flipped to positive ahead of CPI
- Market reacted to softer prints with pullback (as beta signaled)
- Regime shift: yield moves dominated by term-premium normalization
- Driven by fiscal deficits and heavy issuance
- Anchored inflation expectations
- Stable core inflation prints convinced markets Fed would "look through" term-premium-driven yield spikes
- Decoupling long yields from immediate policy-rate risk
- Real yields climbing, break-even inflation subdued, term premium elevated
- Growth-driven yield regime
- Equity-risk premium fell toward zero
- Valuation indicators warn stocks richly priced (Shiller CAPE 94th percentile)
- Positive yield shocks trigger "catch-up" bid in equities
- Core CPI 2.8% Y/Y reassured markets
- Nonfarm payrolls rose 139,000 in May
- Wage growth accelerating
- Labor resilience over headline CPI

#### 2. Vomma Supply, Short Vanna, Risk (Aug 29, 2025)
**File:** `unknown-date-vomma-supply-short-vanna-risk-intraday-post-29-aug.md`
**Key Concepts:**
- Vomma supply heavy, especially on right-tail
- Spot/vol beta 21.01% vs 16.24% avg
- Creates "braking" effect on momentum
- Extends melt-up momentum while preventing long vol/long delta strategies from capitalizing
- Locks cheapness of downside hedges for future correction
- Cools quant algos measuring momentum velocity
- Price moves without vol confirmation are mechanically fragile

#### 3. Intraday Post, Vol Comparison, Long Gamma Trade (March 26, 2025)
**File:** `unknown-date-intraday-post-26-march-vol-comparsion-long-gamma-trade.md`
**Key Concepts:**
- Gamma flip levels as decision boundaries
- Skew progression through week
- Into Friday expiry, skew became longer
- Structural pivots where dealer hedging changes character
- Positioning creates specific decision boundaries
- Coding levels in advance enables confident execution

#### 4. Intraday Post, Reversion Trading Setup (June 9, 2025)
**File:** `unknown-date-intraday-post-09-june-reversion-trading-setup.md`
**Key Concepts:**
- Strong bullish imbalance
- Market confirmed positive drift
- More edge in vol market than directional
- Conditional thinking: recognizing crowded directional reversion
- Setup into FOMC favored reversion trades
- More edge on long delta side

#### 5. Important Trading Advice (June 16, 2025)
**File:** `unknown-date-important-trading-advice-intraday-post-16-june.md`
**Key Concepts:**
- Cannot beat HF algos: speed and emotionlessness
- Only one intraday edge opportunity, two at max
- Usually during AM and after 2 PM
- First 20-30 minutes: high intraday vol from 0DTE positioning
- Better to watch first 30-40 minutes
- Wait for market to decide direction
- Build structure: retested support/resistance, net drift, influential effects
- Decide daily budget, loss limit, profit limit
- Decide which side you "feel," which you can read
- Based on intraday setup, decide entry point, conditions, size
- Determine conditions that disprove trade = take loss
- Wait until market gives it to you
- If doesn't give it, don't FOMO into other side
- Wait for next one or leave desk for tomorrow
- Not obligated to give money to market makers
- Key is careful and conscious planning

#### 6. The Risk of Vanna Regime Shift (July 1, 2025)
**File:** `unknown-date-the-risk-of-vanna-regime-shift-trades-tariffs-deadline-intra.md`
**Key Concepts:**
- Vol selling regime
- Cash out of positions (short vol, long delta) at specific points
- Roll up only small percentage
- Don't open new longs
- Buy cheap OTM put spreads as hedge
- Reversion model says 80%+
- Hedge out rather than net short
- Risk target remains August as pivot
- Watch how things evolve and how positioning reacts
- Tariffs deadline can be "TACOed" (Trump Always Chickens Out)

#### 7. FOMC Preview, Trading Advises (June 17, 2025)
**File:** `unknown-date-fomc-preview-trading-advises-intraday-post-17-june.md`
**Key Concepts:**
- Vanna model signals specific levels
- Spot/vol beta dynamics through session
- Vvol realized to downside as predicted
- Monitoring skew direction for vol profile reversal
- Context-dependent interpretation

#### 8. IV Down/RV Up, Long Zomma/Short Vanna (Oct 31, 2025)
**File:** `unknown-date-iv-down-rv-up-long-zomma-short-vanna-intraday-post-31-oct.md`
**Key Concepts:**
- Zomma supply and short vanna realized after sell-the-news
- Market underpricing reality
- Confirmation through multi-signal alignment

### Key Alma Direct Quotes

From Important Trading Advice post:
> "You cannot beat the HF algos. There are two reasons for that: 1) Because, you cannot be that fast in terms of reading complex conditions, and fill trades; 2) Because you cannot be that emotionless, and disciplined. You will be distracted by win or loss."

> "During the day there is only one intraday edge opportunity, two at max. Usually during the AM, and after 2 PM."

> "You probably keep your spendings/incomes in check, so you know how much capital you should put into trading. If so, you should decide your daily budget, including your loss limit, and also your profit limit."

> "The next thing you need to do is to wait, wait and wait, until the market gives it to you. If it doesn't give it to you, don't fomo into the otherside, but wait for the next one or leave the desk, and leave it for tomorrow."

> "You are not obligated to give your money to the market makers."

From Post-CPI post:
> "The SPX/yields beta flipped to positive just right ahead of CPI release, as I expected on Sunday. Market reacted to softer prints as it was signaled by the beta: reacting with pullback for a softer-than-expected print."

From Vanna Regime Shift post:> "At these points I use the spot to cash out of the positions (short vol, long delta) and roll up a small % of them only. I don't open new longs, and buy very cheap July/August OTM put spreads (30/10 deltas are my targets now), bcs reversion model says 80%+, and I want to hedge this out."

### Technical Concepts Referenced

1. **Reversion Model**: Alma's proprietary mean-reversion probability framework
2. **Gamma Flip Levels**: Price boundaries where dealer hedging behavior changes
3. **Spot/Vol Beta**: Correlation between spot movement and volatility changes
4. **Vomma Supply**: Sensitivity of vega to vol changes, creating "braking" effects
5. **Term-Premium Normalization**: Yield regime driven by fiscal factors not policy
6. **0DTE**: Zero Days to Expiration options creating intraday volatility
7. **TACO**: "Trump Always Chickens Out" - pattern recognition in political risk
8. **Positioning Context**: Inventory-based structural bias reading

### Trading Implications Documented

1. Write day as scenarios before open, update only on material state changes
2. Use fail-fast rules at pivots; rotate on invalidation
3. Require multi-signal confirmation before adding size
4. Verify regime variables support reversion before fading moves
5. Predefine invalidation, honor it quickly
6. Decide daily budget, loss limit, profit limit before trading
7. Wait for market to give entry; don't FOMO
8. Not obligated to trade every day

### Gaps and Web References

None required. All concepts sourced from Alma teachings corpus.

### Synthesis Notes

Chapter 7 synthesizes the microstructure concepts from Chapters 4-6 into a practical intraday framework. The five sections align with the book outline: positioning, pivots, momentum, reversion traps, and probabilistic discipline.

The chapter draws heavily on Alma's specific trading advice (June 16 post) which provides concrete, actionable guidance. This grounds the theoretical Greeks in practical execution.

The transition to Part III is natural: having established microstructure mechanics, the book now expands to macro narrative engines where these same flows operate under geopolitical pressure.
