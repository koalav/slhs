from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from .indicators import clamp, safe_float


def _parse_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def load_csv(path: str | Path) -> list[dict[str, str]]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_consensus(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for row in load_csv(path):
        parsed = {"date": _parse_date(row.get("date", "")), "raw": row}
        for key, value in row.items():
            if key == "date":
                continue
            parsed[key] = safe_float(value)
        if parsed["date"] is not None:
            rows.append(parsed)
    rows.sort(key=lambda item: item["date"])
    return rows


def load_events(path: str | Path) -> list[dict[str, Any]]:
    events = []
    for row in load_csv(path):
        event_date = _parse_date(row.get("date", ""))
        if event_date is None:
            continue
        events.append(
            {
                "date": event_date,
                "company": row.get("company", ""),
                "type": row.get("type", ""),
                "direction": int(safe_float(row.get("direction")) or 0),
                "confidence": int(safe_float(row.get("confidence")) or 0),
                "note": row.get("note", ""),
                "source_url": row.get("source_url", ""),
            }
        )
    events.sort(key=lambda item: item["date"])
    return events


def consensus_summary(
    rows: list[dict[str, Any]],
    samsung_price: float | None,
    skhynix_price: float | None,
    hedge_h: float,
) -> dict[str, Any]:
    if not rows:
        return {"available": False}

    latest = rows[-1]
    latest_date = latest["date"]
    ref = None
    for row in reversed(rows):
        if row["date"] <= latest_date - timedelta(days=28):
            ref = row
            break
    if ref is None and len(rows) > 1:
        ref = rows[0]

    def rel_change(key: str) -> float | None:
        if ref is None:
            return None
        last_value = latest.get(key)
        ref_value = ref.get(key)
        if last_value is None or ref_value in (None, 0):
            return None
        return last_value / ref_value - 1

    samsung_revision = rel_change("samsung_op_2026")
    skhynix_revision = rel_change("skhynix_op_2026")
    revision_diff = (
        samsung_revision - skhynix_revision
        if samsung_revision is not None and skhynix_revision is not None
        else None
    )

    samsung_target = latest.get("samsung_target_price")
    skhynix_target = latest.get("skhynix_target_price")
    samsung_upside = (
        samsung_target / samsung_price - 1
        if samsung_target is not None and samsung_price not in (None, 0)
        else None
    )
    skhynix_upside = (
        skhynix_target / skhynix_price - 1
        if skhynix_target is not None and skhynix_price not in (None, 0)
        else None
    )
    target_pair_signal = (
        samsung_upside - hedge_h * skhynix_upside
        if samsung_upside is not None and skhynix_upside is not None
        else None
    )

    return {
        "available": True,
        "latest_date": latest_date.isoformat(),
        "reference_date": ref["date"].isoformat() if ref else None,
        "samsung_target_price": samsung_target,
        "skhynix_target_price": skhynix_target,
        "samsung_target_upside": samsung_upside,
        "skhynix_target_upside": skhynix_upside,
        "target_pair_signal": target_pair_signal,
        "samsung_op_2026_revision": samsung_revision,
        "skhynix_op_2026_revision": skhynix_revision,
        "revision_diff": revision_diff,
        "raw_note": latest.get("raw", {}).get("note", ""),
    }


def hbm_event_summary(events: list[dict[str, Any]], today: date, lookback_days: int = 45) -> dict[str, Any]:
    recent = [e for e in events if e["date"] >= today - timedelta(days=lookback_days)]
    if not recent:
        return {"available": False, "score": 0, "net_score": 0, "events": []}
    net = sum(e["direction"] * e["confidence"] for e in recent)
    # Neutral event tape is not a buy signal; the score is capped and visible.
    score = int(round(clamp(7.5 + net * 1.5, 0, 15)))
    return {
        "available": True,
        "score": score,
        "net_score": net,
        "events": [
            {
                **event,
                "date": event["date"].isoformat(),
            }
            for event in recent[-10:]
        ],
    }
