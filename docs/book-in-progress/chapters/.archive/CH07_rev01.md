# Chapter 7: The Intraday Playbook

> **Risk Disclosure:** The strategies discussed in this chapter involve derivatives and options trading, which carry substantial risk of loss. These instruments are not suitable for all investors. You may lose more than your initial investment. The content herein is for educational purposes only and does not constitute investment advice. Past performance is not indicative of future results. Always consult a qualified financial advisor before making investment decisions.

## Opening Hook

The goal is not to predict every move, it is to trade the state that is actually in front of you.

---

## 7.1 Reading Daily Positioning

Daily bias starts with inventory, not opinion. Positioning context tells you where forced behavior is likely if spot or vol moves beyond tolerance zones.

Alma's process reads this as a probability surface: what is most likely to be hedged, what is most likely to be absorbed, and where fragility appears if regime shifts. This prevents overreaction to single prints and anchors the day in structure. The purpose is not omniscience. The purpose is to remove avoidable surprises.

The June 12, 2025 post-CPI analysis demonstrates this approach. Alma noted that momentum and sentiment-wise, as long as SPX could close above specific thresholds, pullback was not confirmed. The SPX/yields beta had flipped to positive just ahead of CPI release, marking a regime shift where yield moves were dominated by term-premium normalization. This structural reading provided context that headline-focused traders missed.[^bible-june12-cpi]

Positioning data reveals the convexity landscape before price moves through it. Where are the gamma concentrations? Where is the vanna exposure? How does charm decay through the session? These questions create a map of mechanical pressure points that operate regardless of news flow.

The trader who starts with positioning has visibility into forced flows. The trader who starts with headlines chases price after the move has already begun.

**Key Insight:** Positioning transforms intraday forecasting from narrative guessing to conditional mapping.

**Trading Implication:** Write the day as scenarios before the open, then update only when state variables materially change. Treat scenarios as probability distributions, not forecasts—size positions for uncertainty and respect your risk budget regardless of conviction.

---

## 7.2 Coding Pivots

A pivot is not just a horizontal line, it is a decision boundary with flow consequences. In Alma's framework, pivots are coded from structure: exposure concentration, flip proximity, and conditional volatility response.

The value of coding is consistency; it reduces emotional level-drawing and forces pre-trade logic. When price tests a pivot, the question is not "is this support?" but "did state confirm expected behavior?" If yes, execute with predefined risk. If not, downgrade the level and move on.

The March 26, 2025 analysis illustrates this with gamma flip levels. Into Friday expiry, the skew became longer, and the positioning created specific decision boundaries. These were not arbitrary lines but structural pivots where dealer hedging behavior would change character. The trader who coded these levels in advance could execute with confidence when price approached them.[^bible-march26-gamma]

Pivots fail. This is expected. The difference between amateur and professional is not perfect pivot prediction—it is what happens when the pivot breaks. The professional has predefined invalidation and rotates immediately. The amateur defends the level and compounds losses.

**Key Insight:** Pivots are executable hypotheses tied to flow behavior, not static chart decorations.

**Trading Implication:** Use fail-fast rules at pivots; invalidated structure should trigger immediate plan rotation, not thesis defense.

---

## 7.3 Momentum Confirmation

Breakouts need participation from volatility and flow, not just price extension. Alma repeatedly flags this in intraday notes: without vol-state confirmation, many directional pushes are theater.

True confirmation usually includes follow-through in realized behavior, not immediate mean-revert snapback, plus alignment between spot and hedge pressure. In short-gamma or stress windows, this can happen quickly. In suppressive regimes, the same price move often dies on contact with liquidity. Confirmation is therefore a state check, not an emotional reaction.

The August 29, 2025 analysis provides a counter-example. Vomma supply was heavy, creating a "braking" effect that extended melt-up momentum while preventing long vol/long delta strategies from capitalizing. Through this supply, concentrated on the right-tail, quant algos measuring momentum velocity were cooled down. The price move continued, but without vol confirmation, it was mechanically fragile.[^bible-aug29-vomma]

Momentum traders often confuse price extension with momentum. True momentum has vol expansion, flow alignment, and persistence. False momentum has price moving while vol compresses and flow fights it. The distinction determines whether to add size or take profits.

**Key Insight:** Price extension without vol/flow confirmation is often a false breakout.

**Trading Implication:** Require multi-signal confirmation before adding size to momentum trades.

---

## 7.4 Mean Reversion Traps

Reversion edges disappear when structure shifts faster than your playbook. A dip can look exhausted while short-gamma chase flow is only beginning. A squeeze can look overextended while vol compression and charm keep adding support.

Alma's trap language is useful because it centers mismatch: your strategy assumptions versus current mechanics. Most losses in this category come from using yesterday's regime template on today's tape. Reversion is a powerful tool, but only inside the right state.

The June 9, 2025 post noted strong bullish imbalance with market confirming positive drift, yet Alma personally found more edge in the vol market. This is conditional thinking: recognizing when directional reversion is crowded and vol trades offer better risk/reward. The setup into FOMC favored reversion trades with more edge on the long delta side, but this was context-specific, not universal.

The reversion model signaled 80%+ probability on June 12, providing specific targets. But Alma consistently caveated these signals with confirmation requirements: momentum and sentiment thresholds that had to hold, or the pullback was not confirmed. This is the anti-trap discipline: having a directional bias while requiring evidence before deployment.

**Key Insight:** Mean reversion fails hardest when used against active convexity pressure.

**Trading Implication:** Before fading a move, verify that regime variables support reversion; if not, preserve capital and wait.

---

## 7.5 Do Not Marry a Side

Attachment is the hidden tax in intraday trading. Alma's core discipline is conditional thinking: if this, then that, and if invalidated, rotate without ego. The market does not reward consistency of opinion; it rewards consistency of process.

A trader who can abandon a thesis early often keeps enough capital to exploit the real move later. This is not indecision, it is risk intelligence. Probabilistic flexibility is the final edge that keeps the whole framework alive.

The June 16, 2025 trading advice post crystallizes this: decide your daily budget, including your loss limit and your profit limit. Decide which side you "feel," which side you are familiar with to read. Then based on the intraday setup, decide at what point and what conditions you will take your trade, and in what size. With this conscious planning you also determine what conditions would disprove your trade—and you take the loss.[^bible-june16-advice]

The next thing is to wait, wait and wait, until the market gives it to you. If it doesn't give it to you, don't FOMO into the other side, but wait for the next one or leave the desk, and leave it for tomorrow. You are not obligated to give your money to the market makers.

This is probabilistic discipline in practice: predefining entry, exit, invalidation, and size before the market opens. The emotional trader improvises under pressure. The mechanical trader executes a plan made in calm.

**Key Insight:** Process loyalty beats directional loyalty.

**Trading Implication:** Predefine invalidation, honor it quickly, and redeploy only when a new state is confirmed.

---

## Chapter Close

The intraday playbook is not a crystal ball. It is a decision framework for trading the state in front of you, not the state you wish existed.

Reading positioning before the open creates scenario awareness. Coding pivots provides executable structure. Requiring momentum confirmation filters false breakouts. Recognizing reversion traps prevents fighting convexity. And refusing to marry a side preserves capital for when the real move arrives.

Alma's framework treats trading as engineering, not prophecy. The goal is not to predict every tick but to align with mechanical flows when they are clear and stand aside when they are not. This is probabilistic discipline: edge over time, not certainty on every trade.

The traders who survive and prosper are not the ones with perfect forecasts. They are the ones with robust processes that adapt when conditions change. The intraday playbook is that process—conditional, mechanical, and relentlessly focused on the state that actually exists.

---

## Vector

Part III expands from microstructure into macro narrative engines: the same flow mechanics continue, but now under geopolitical and regime-level pressure.

---

## Bible References

[^bible-june12-cpi]: Alma, "Post-CPI, SPX to yields beta flip + Intraday post (12/June)," June 12, 2025. Bible corpus: `bible/corpus/substack/unknown-date-post-cpi-spx-to-yields-beta-flip-intraday-post-12-june.md`

[^bible-march26-gamma]: Alma, "Intraday post (26/march), vol comparsion, long gamma trade," March 26, 2025. Bible corpus: `bible/corpus/substack/unknown-date-intraday-post-26-march-vol-comparsion-long-gamma-trade.md`

[^bible-aug29-vomma]: Alma, "Vomma supply, Short vanna, Risk - Intraday post (29/Aug)," August 29, 2025. Bible corpus: `bible/corpus/substack/unknown-date-vomma-supply-short-vanna-risk-intraday-post-29-aug.md`

[^bible-june16-advice]: Alma, "Important trading advice + Intraday post (16/June)," June 16, 2025. Bible corpus: `bible/corpus/substack/unknown-date-important-trading-advice-intraday-post-16-june.md`
