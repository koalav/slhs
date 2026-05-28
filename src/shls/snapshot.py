from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DEFAULT_CONFIG
from .manual_data import load_consensus, load_events
from .providers import DataProviderError, collect_market_data, fetch_pykrx_flow
from .sample_data import make_fixture
from .signals import build_signals


def build_snapshot(
    consensus_path: str | Path = "data/manual/consensus.csv",
    events_path: str | Path = "data/manual/hbm_events.csv",
    history_range: str = "2y",
    fixture_on_error: bool = True,
    offline: bool = False,
) -> dict[str, Any]:
    data_warning = None
    if offline:
        market = make_fixture()
    else:
        try:
            market = collect_market_data(history_range=history_range)
        except DataProviderError as exc:
            if not fixture_on_error:
                raise
            data_warning = str(exc)
            market = make_fixture()

    consensus_rows = load_consensus(consensus_path)
    events = load_events(events_path)
    signals = build_signals(market, consensus_rows, events, DEFAULT_CONFIG)

    series_dates = signals.get("series", {}).get("dates") or []
    flow = {"available": False, "reason": "insufficient history"}
    if series_dates:
        start = series_dates[-10].replace("-", "") if len(series_dates) >= 10 else series_dates[0].replace("-", "")
        end = series_dates[-1].replace("-", "")
        flow = fetch_pykrx_flow(start, end)

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_warning": data_warning,
        "market": market,
        "signals": signals,
        "flow": flow,
        "disclaimer": (
            "This dashboard is a monitoring tool for a user-defined strategy, "
            "not investment advice or an automated trading system."
        ),
    }


def write_json(path: str | Path, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def write_history(history_dir: str | Path, payload: dict[str, Any]) -> Path:
    generated = datetime.fromisoformat(payload["generated_at"].replace("Z", "+00:00"))
    name = generated.strftime("%Y-%m-%dT%H-%M-%SZ.json")
    target = Path(history_dir) / name
    write_json(target, payload)
    return target
