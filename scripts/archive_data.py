#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from shls.archive import archive_payload, update_archive_index


DEFAULT_FILES = {
    "latest": "latest.json",
    "base": "base.json",
    "research": "research.json",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive current dashboard JSON by as-of date")
    parser.add_argument("--root", default="docs/data")
    parser.add_argument("--archive-root", default="docs/data/archive")
    args = parser.parse_args()

    root = Path(args.root)
    records = []
    for kind, filename in DEFAULT_FILES.items():
        source = root / filename
        if not source.exists():
            print(f"skip missing {source}")
            continue
        record = archive_payload(
            source_path=source,
            archive_root=args.archive_root,
            kind=kind,
            source_label=source.as_posix(),
        )
        records.append(record)
        print(f"archived {kind} {record['as_of_date']} -> {record['path']}")

    if records:
        index = update_archive_index(args.archive_root, records)
        print(f"archive records={len(index['records'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
