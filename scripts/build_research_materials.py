#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from shls.research_materials import build_research_materials, write_research_materials


def main() -> int:
    parser = argparse.ArgumentParser(description="Build research materials JSON")
    parser.add_argument("--output", default="docs/data/research.json")
    args = parser.parse_args()

    payload = build_research_materials()
    write_research_materials(args.output, payload)
    print(f"wrote {args.output}")
    for item in payload["coverage"]:
        print(f"{item['label']}: {'OK' if item['available'] else 'MISSING'} ({item['rows']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
