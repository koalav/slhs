#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from shls.snapshot import build_snapshot


def main() -> int:
    snapshot = build_snapshot(offline=True)
    assert snapshot["schema_version"] == 1
    assert "market" in snapshot
    assert "signals" in snapshot
    assert snapshot["signals"]["series"]["dates"]
    assert snapshot["signals"]["score"]["action"]
    assert "hbm_events" not in snapshot["signals"]
    assert "hbm_event" not in snapshot["signals"]["score"]["components"]
    assert snapshot["signals"]["position_1h"]["samsung_contracts"] == 11
    print("smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
