# CH5_DRAFT01_SOURCE_NOTES

## Chapter 5: Vanna and Speed Profiles

### Primary Sources Used

#### 1. OpEx Flows, Supportive or Suppressive Vanna/Charm (Sept 18, 2025)
**File:** `unknown-date-opex-flows-supportive-or-suppressive-vanna-charm-intraday-po.md`
**Key Concepts:**
- Supportive vs suppressive flow is context-dependent
- Schematic modeling using only OTM skew contracts oversimplifies reality
- Negative speed profile: MM net long OTM puts, net short OTM calls
- Result: net positive charm, net negative vanna
- Mechanics: if vol is sold, negative vanna makes dealer longer delta, making him sell futures
- Long charm also makes dealer longer delta as time passes
- This positioning could be called "right-tailish" - sells left-tail, prevents downside vol squeezes, opens gate for upward gamma squeezes
- Centroid of setup determines which scenario activates
- Dealers have thousands/millions of contracts across tenors, not just two schematic contracts

#### 2. Vomma Supply, Short Vanna, Risk (Aug 29, 2025)
**File:** `unknown-date-vomma-supply-short-vanna-risk-intraday-post-29-aug.md`
**Key Concepts:**
- Vomma supply on (grey line), very heavy, especially on right-tail
- Spot/vol beta at 21.01% vs avg 16.24%
- Reason: illiquidity and short squeeze
- 3m realized volatility at 9.38%, 1m-RV at 10.11%
- Realized vvol sold from 81.3% to 26.59% in one week
- "Higher for longer" vol environment
- Quant funds scaling out of long exposures
- Decreasing institutional buying flow
- Current SPX levels not stable, held until Sept cut
- Risk premium compression
- Vomma supply creates "braking" effect to extend melt-up momentum
- Long vol/long delta strategies can't capitalize
- Locks cheapness of downside hedges for future correction
- Cools quant algos measuring momentum velocity

#### 3. Short Vanna, Short Veta, Short Fly (Oct 6-10, 2025)
**File:** `unknown-date-short-vanna-short-veta-short-fly-weekly-post-06-10-oct.md`
**Key Concepts:**
- Window of risk framework
- 130.3 pts pullback from Tuesday to reversion model signal level
- "No downside confirmation" caveat
- Shutdown risk
- U.S. equity funds took in $36.4B (largest since Nov '24)
- Large-cap inflows, small/mid outflows
- Short-to-intermediate Treasury funds large outflows
- Risk-on in cap-weighted beta
- Short squeeze dynamics
- Gold rally supported by central banks + ETF demand
- Gold is short beta to real yields
- Biggest left-tail: real-yield backup / curve steepener

#### 4. IV Down/RV Up, Long Zomma/Short Vanna (Oct 31, 2025)
**File:** `unknown-date-iv-down-rv-up-long-zomma-short-vanna-intraday-post-31-oct.md`
**Key Concepts:**
- Zomma supply and short vanna realized after sell-the-news event
- Closing at downside target
- Market underpricing reality
- PCE consensus: core PCE ~+0.2% m/m, ~+2.9% y/y
- December cut odds slid from mid-80s/90s to ~68-75%
- Shutdown is on - hidden left-tail
- Market prices in only good news, not bad news

#### 5. Bottom? JPM Collar, OpEx, Systematics (March 14, 2025)
**File:** `unknown-date-bottom-jpm-collar-opex-systematics-intraday-post-14-march.md`
**Key Concepts:**
- JPM collar expectations should be tempered
- Has more local impact
- Vol impact on long run if spot in certain area
- Only one trade among many others
- This time has minor impact
- Warning against furus explaining collar wrongly

#### 6. Liquidity Structure | Speed Profile Context (Jan 7, 2026)
**File:** `unknown-date-liquidity-structure-let-s-put-speed-profile-into-context.md`
**Key Concepts:**
- Educational post on practical use of positioning data
- Warning against furu misinterpretations
- Goal: steer thinking back toward practical use
- Positioning data is valuable but often neutralized by unrealistic explanations
- Speed profile context for liquidity structure

#### 7. Zomma & Vomma Risk as Response to Macro (May 19-23, 2025)
**File:** `unknown-date-zomma-vomma-risk-as-a-response-to-macro-weekly-post-19-23-ma.md`
**Key Concepts:**
- Coded rolling SPX/VIX beta
- Beta spike since May 5
- Key is sudden steep spike, not current value
- SPX corrected back, saved by gov speakers, squeezed up
- Beta still negative but went longer (more positive/less negative)
- On SPX pullback VIX went down, but when SPX rallied, VIX decline slowed
- Whole smirk got bid, including tails
- Cheap IV relative to RV indicates short vol trade oversold
- Liquidity problems to upside
- Accumulated significant zomma and vomma risk

#### 8. Zomma Supply (Sept 8-12, 2025)
**File:** `unknown-date-zomma-supply-weekly-post-08-12-sept.md`
**Key Concepts:**
- Vomma supply playing out as expected
- VIX declined 6.32% during week
- Realized volatility ranging as expected "higher for longer" through vomma supply
- Market set to vol selling
- 6543.51 avg needed over next five days to keep positive disbalance
- Below 6492.66 approaches equilibrium
- Elevates risk further

### Key Alma Direct Quotes

From OpEx Flows post:
> "If something is supportive is suppressive is very much context dependent, and assuming flows by using only the OTM 'skew' contracts for schematic examples is not necessarily accurate."

> "The supportive/suppressive is coming from the passive flows. But passive flows can be overwritten/interfered by shadow greek generated flows."

From Vomma Supply post:
> "Vomma supply is on (grey line), and very heavy, as we keep seeing it day by day, week by week: especially on the right-tail, because spot/vol beta is about 21.01% with an avg of 16.24%."

From JPM Collar post:
> "Don't expect too much impact from the JPM collar reset. It has more local impact, and vol impact on the long run, if spot is in a certain area. But it is only one trade among many others, and this time it has minor impact."

> "Don't fall for furus who try to sound clever through explaining the collar over and over again, and mostly wrongly."

From Liquidity Structure post:
> "The goal of my current educational series is to steer my subscribers' thinking back toward practical use, and to show how positioning data..."

### Technical Concepts Referenced

1. **Speed Profile**: Second derivative of gamma; how quickly gamma changes as spot moves
2. **Vanna**: Sensitivity of delta to changes in implied volatility
3. **Vomma**: Sensitivity of vega to changes in implied volatility (vol of vol)
4. **Zomma**: Sensitivity of gamma to changes in implied volatility
5. **OTM Skew Contracts**: Out-of-the-money puts and calls used for schematic modeling
6. **Spot/Vol Beta**: Correlation between spot price movement and volatility changes
7. **Realized Vol of Vol**: Actual volatility of implied volatility itself
8. **Shadow Greeks**: Higher-order Greeks not captured in standard delta/gamma/theta/vega

### Trading Implications Documented

1. When speed is adverse, reduce reliance on static level maps
2. Use collar windows as scenario modifiers, not standalone triggers
3. Track vol trend with price; de-risk when they align against you
4. Pair directional bias with IV regime checks
5. Context determines whether flows are supportive or suppressive

### Gaps and Web References

None required. All concepts sourced from Alma teachings corpus.

### Synthesis Notes

Chapter 5 bridges gamma mechanics (Chapter 4) with time-decay dynamics (Chapter 6). The vanna and speed discussion establishes second-order sensitivities that explain why markets can appear stable while building structural pressure. The JPM collar case study provides concrete example of how single structures interact with broader inventory. The IV-delta relationship is emphasized as primary driver of directional persistence.
