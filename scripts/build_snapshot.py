#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from shls.snapshot import build_snapshot, write_history, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Build SHLS dashboard JSON snapshot")
    parser.add_argument("--output", default="docs/data/latest.json")
    parser.add_argument("--history-dir", default="")
    parser.add_argument("--consensus", default="data/manual/consensus.csv")
    parser.add_argument("--events", default="data/manual/hbm_events.csv")
    parser.add_argument("--history-range", default="2y")
    parser.add_argument("--offline", action="store_true", help="Use deterministic fixture data")
    parser.add_argument("--no-fixture-on-error", action="store_true")
    args = parser.parse_args()

    snapshot = build_snapshot(
        consensus_path=args.consensus,
        events_path=args.events,
        history_range=args.history_range,
        fixture_on_error=not args.no_fixture_on_error,
        offline=args.offline,
    )
    write_json(args.output, snapshot)
    if args.history_dir:
        write_history(args.history_dir, snapshot)
    print(f"wrote {args.output}")
    print(
        f"score={snapshot['signals']['score']['total']} "
        f"action={snapshot['signals']['score']['action']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
