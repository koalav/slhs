# SHLS Timing Dashboard

Samsung Electronics long / SK Hynix short timing monitor.

This repository turns the shared strategy notes into a static GitHub Pages dashboard fed by a Python snapshot builder. It is a monitoring tool, not an automated trading system or investment advice.

## Quick Start

```bash
python3 scripts/build_snapshot.py
python3 -m http.server 8000 -d docs
```

Open `http://localhost:8000`.

For continuous local refresh:

```bash
python3 scripts/watch_snapshot.py --seconds 60
```

For a deterministic offline test:

```bash
python3 scripts/smoke_test.py
python3 scripts/build_snapshot.py --offline
```

For page/resource/calculation regression tests:

```bash
python3 scripts/test_pages.py
```

## GitHub Pages

Use `docs/` as the Pages publishing directory. The dashboard reads `docs/data/latest.json`; GitHub Actions can refresh that file on a schedule.

## Documents

- [Architecture](docs/ARCHITECTURE.md)
- [PRD](docs/PRD.md)
- [Base Materials](docs/BASELINE.md)
- [Interactive Simulator](docs/SIMULATOR.md)
- Research Inputs: `docs/research.html`

## Pages

- `docs/index.html`: entry timing dashboard
- `docs/base.html`: two-year base chart pack
- `docs/research.html`: target price, earnings, articles, global memory factors
- `docs/simulator.html`: interactive h/backtest/forecast/margin simulator
- `docs/backtest.html`: simple entry-date and position-size PnL backtest

## Data Notes

The core collector uses Yahoo chart data and Naver Finance with no API key. These are suitable for monitoring and prototyping, but not exchange-grade execution. True real-time quotes, futures order books, investor flow, and account margin should be integrated through a broker API such as KIS OpenAPI, Kiwoom, or CYBOS Plus.
