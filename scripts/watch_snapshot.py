#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Continuously refresh dashboard snapshot")
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--output", default="docs/data/latest.json")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    command = [sys.executable, str(ROOT / "scripts" / "build_snapshot.py"), "--output", args.output]
    if args.offline:
        command.append("--offline")

    while True:
        started = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{started}] refreshing {args.output}", flush=True)
        subprocess.run(command, cwd=ROOT, check=False)
        time.sleep(args.seconds)


if __name__ == "__main__":
    raise SystemExit(main())
