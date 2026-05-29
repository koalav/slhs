# Product Requirements Document

## 1. Product Summary

SHLS Timing Dashboard monitors whether a Samsung Electronics long / SK Hynix short strategy has reached a valid entry window. The product publishes a static GitHub Pages dashboard and refreshes its data through a Python snapshot builder.

## 2. Problem

The strategy can look attractive when SK Hynix approaches Samsung Electronics by market cap, but valuation gap alone is not enough. The risky failure mode is entering before the relative spread turns. The product must separate:

```text
waiting condition = valuation gap
entry trigger = spread reversal plus thesis confirmation
```

## 3. Goals

1. Show the current entry status in one scorecard.
2. Track SK/Samsung market cap ratio and weighted spread z-score.
3. Calculate 1H notional, hedge ratio, margin estimate, and stress PnL.
4. Support manual consensus updates.
5. Run locally for near-real-time monitoring and publish statically to GitHub Pages.

## 4. Non-Goals

1. No automated trade execution in v1.
2. No client-side secret API keys.
3. No claim of exchange-grade tick accuracy from free public data.
4. No investment recommendation or buy/sell order generation.

## 5. Target User

An individual or small research workflow monitoring the Samsung relative-revaluation thesis against SK Hynix, with enough discipline to wait for a defined spread reversal.

## 6. Core User Stories

| ID | Story | Priority |
|---|---|---|
| U1 | As a user, I can see whether the current state is no-entry, watch, test, or 1H candidate. | P0 |
| U2 | As a user, I can see whether spread reversal is confirmed. | P0 |
| U3 | As a user, I can inspect market cap ratio, spread z-score, volatility, and hedge ratio. | P0 |
| U4 | As a user, I can update consensus CSV files without editing code. | P1 |
| U5 | As a user, I can publish the dashboard on GitHub Pages. | P1 |
| U6 | As a user, I can run a local 60-second watcher. | P1 |
| U7 | As a user, I can later add broker real-time quotes without replacing the UI. | P2 |

## 7. Functional Requirements

### FR1. Snapshot Builder

The system shall build `docs/data/latest.json` containing:

1. Latest Samsung and SK Hynix price, change, market cap, shares, PER, PBR.
2. 180-session chart series.
3. Signal score and component scores.
4. 1H position risk.
5. Consensus summary.
6. Optional pykrx investor flow.

### FR2. Entry Scorecard

The system shall calculate:

```text
total score = value gap + spread oversold + spread reversal
            + earnings revision + Hynix fade
```

The system shall downgrade any test or entry action to "wait for reversal" when spread reversal is not confirmed.

### FR3. Spread Timing

The system shall calculate:

```text
spread = log(Samsung / Samsung_0) - 0.66 * log(SK Hynix / SK Hynix_0)
z = 60D z-score(spread)
```

The system shall flag reversal only after the spread has recently reached the oversold zone and recovered.

### FR4. Risk Model

The system shall calculate for 1H:

```text
Samsung notional = Samsung price * 10 * 11
SK Hynix notional = SK Hynix price * 10 * 1
actual h = SK Hynix notional / Samsung notional
margin estimate = Samsung notional * 29.10% + SK Hynix notional * 29.25%
```

The system shall show stress PnL for -20%, -10%, -7%, -5%, +5%, and +10% weighted spread moves.

### FR5. Static Dashboard

The dashboard shall:

1. Load `data/latest.json`.
2. Refresh every 60 seconds in the browser.
3. Render score, market table, charts, risk table, and consensus snapshot.
4. Work from GitHub Pages without a backend server.
5. Preserve daily `latest`, `base`, and `research` payloads under `data/archive/` while keeping current-value dashboard features on the top-level JSON files.

## 8. Data Requirements

| Data | Freshness Target | Source |
|---|---:|---|
| Latest price | 1-15 minutes in public mode | Naver realtime polling endpoint |
| Market cap | snapshot refresh | Naver Finance |
| Daily history | snapshot refresh | Naver daily price endpoint |
| Consensus | weekly or event-driven | CSV, later paid API |
| Investor flow | daily | optional pykrx/KRX |

## 9. Acceptance Criteria

1. `python3 scripts/smoke_test.py` passes offline.
2. `python3 scripts/build_snapshot.py` writes `docs/data/latest.json`.
3. `python3 -m http.server 8000 -d docs` serves a non-empty dashboard.
4. Score action changes to `WAIT_FOR_REVERSAL` when reversal is missing, even if other scores are positive.
5. The dashboard works without exposing API keys.
6. `python3 scripts/archive_data.py` writes a date-keyed archive index and dated payload files.

## 10. Release Plan

| Phase | Scope |
|---|---|
| v0.1 | Static dashboard, public data collector, manual CSV, scorecard |
| v0.2 | pykrx investor flow and short-sale enrichment |
| v0.3 | Broker real-time quote adapter and alerting |
| v0.4 | Backtest/report module and strategy parameter tuning |

## 11. Risks

1. Yahoo and Naver endpoints can change or throttle.
2. Public quote data is delayed and not suitable for execution.
3. Consensus data in CSV is only as good as manual maintenance.
4. Futures expiry logic is holiday-unadjusted and must be replaced with an exchange calendar before trading operations.
