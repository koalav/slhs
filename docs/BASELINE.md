# Base Materials

This page is the static reference pack for the Samsung Electronics / SK Hynix pair strategy.

Open the chart pack:

```text
docs/base.html
```

## Included Charts

| Chart | Purpose |
|---|---|
| Raw Price | Shows each stock's two-year price path with separate axes. |
| Normalized Return | Compares two-year cumulative return from a common 0% start. |
| Weighted Spread | Tracks `log(Samsung/Samsung_0) - 0.66 * log(SK Hynix/SK Hynix_0)` and 60D z-score. |
| 60D Beta | Shows rolling Samsung-on-SK Hynix beta and volatility hedge ratio. |
| 60D Correlation & Volatility | Shows pair stability and relative risk intensity. |
| Market Cap Ratio | Shows `SK Hynix market cap / Samsung market cap` and 20D moving average. |

## Core Definitions

```text
spread = log(Samsung / Samsung_0) - h * log(SK Hynix / SK Hynix_0)
h = 0.66
```

The base beta chart uses:

```text
beta = cov(Samsung daily log return, SK Hynix daily log return)
       / var(SK Hynix daily log return)
```

This is not the same as exchange margin or actual contract ratio. It is a rolling statistical hedge reference. The dashboard still uses the explicit 1H model:

```text
Samsung futures long 11 contracts
SK Hynix futures short 1 contract
```

## Generate

```bash
python3 scripts/build_base_materials.py
```

The output is:

```text
docs/data/base.json
```

The HTML page fetches that JSON directly, so it can be served by GitHub Pages.
