#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from shls.base_materials import build_base_materials


def main() -> int:
    parser = argparse.ArgumentParser(description="Build 2Y base materials JSON")
    parser.add_argument("--output", default="docs/data/base.json")
    args = parser.parse_args()

    payload = build_base_materials()
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"wrote {target}")
    print(
        f"period={payload['period']['start']}..{payload['period']['end']} "
        f"obs={payload['period']['observations']}"
    )
    print(
        f"z={payload['latest']['spread_zscore_60d']:.2f} "
        f"beta={payload['latest']['beta_samsung_on_skhynix_60d']:.2f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
