# Interactive Simulator

Open:

```text
docs/simulator.html
```

The simulator loads:

```text
docs/data/latest.json
docs/data/base.json
```

## What It Calculates

| Area | Calculation |
|---|---|
| Current price | Latest Samsung and SK Hynix prices from `latest.json`. |
| h source | Signal h, manual h, latest 60D rolling beta, or latest 60D volatility hedge h. |
| h backtest | Two-year fixed-contract futures PnL backtest using Samsung contracts and h-derived SK Hynix contracts. |
| Rolling beta strategy | Prior-session 60D Samsung-on-SK-Hynix beta sets the daily SK short contract count, with estimated rebalance cost. |
| Expected price PnL | Current price to user-entered expected prices. |
| Required margin | `Samsung notional * Samsung margin rate + SK short notional * SK margin rate`. |
| Recommended buffer | Required margin multiplied by a user-entered buffer multiple, plus entry cost estimate. |
| Contract construction | `SK contracts = round(Samsung notional * target h / (SK price * multiplier))`. |
| Cost estimate | One-way fee bps plus one-way slippage bps; forecast PnL is shown gross and net of round-trip cost. |

## Default Assumptions

```text
Product preset = mini futures x1
h source = signal h
h = current 1H actual hedge ratio, fallback 0.66
Samsung contracts = 110 mini contracts by default, equivalent to 11 standard x10 contracts
Samsung margin rate = 29.10%
SK Hynix margin rate = 29.25%
Fee = 0.5 bps one way
Slippage = 2 bps one way
Recommended buffer = 3x required margin + entry cost estimate
Account capital = 100,000,000 KRW
```

This is a static browser-side model for research. It does not include real futures basis, taxes, holiday-adjusted expiry, broker portfolio margin offsets, or forced liquidation rules.
