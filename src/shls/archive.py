from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ARCHIVE_SCHEMA_VERSION = 1


def read_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str | Path, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def payload_date(payload: dict[str, Any]) -> str:
    period_end = payload.get("period", {}).get("end")
    if isinstance(period_end, str) and period_end:
        return period_end
    generated_at = payload.get("generated_at")
    if isinstance(generated_at, str) and generated_at:
        return datetime.fromisoformat(generated_at.replace("Z", "+00:00")).date().isoformat()
    return datetime.now(timezone.utc).date().isoformat()


def _latest_summary(payload: dict[str, Any]) -> dict[str, Any]:
    signals = payload.get("signals", {})
    market = payload.get("market", {}).get("equities", {})
    samsung = market.get("samsung", {})
    skhynix = market.get("skhynix", {})
    return {
        "score": signals.get("score", {}).get("total"),
        "action": signals.get("score", {}).get("action"),
        "samsung_price": samsung.get("price"),
        "skhynix_price": skhynix.get("price"),
        "actual_hedge_h": signals.get("position_1h", {}).get("actual_hedge_h"),
        "spread_zscore": signals.get("metrics", {}).get("spread_zscore"),
    }


def _base_summary(payload: dict[str, Any]) -> dict[str, Any]:
    latest = payload.get("latest", {})
    return {
        "period_start": payload.get("period", {}).get("start"),
        "period_end": payload.get("period", {}).get("end"),
        "observations": payload.get("period", {}).get("observations"),
        "spread_zscore_60d": latest.get("spread_zscore_60d"),
        "beta_samsung_on_skhynix_60d": latest.get("beta_samsung_on_skhynix_60d"),
        "corr_60d": latest.get("corr_60d"),
    }


def _research_summary(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "coverage": [
            {
                "key": item.get("key"),
                "label": item.get("label"),
                "available": item.get("available"),
                "rows": item.get("rows"),
            }
            for item in payload.get("coverage", [])
        ]
    }


def summarize(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    if kind == "latest":
        return _latest_summary(payload)
    if kind == "base":
        return _base_summary(payload)
    if kind == "research":
        return _research_summary(payload)
    return {}


def archive_payload(
    source_path: str | Path,
    archive_root: str | Path,
    kind: str,
    source_label: str | None = None,
) -> dict[str, Any]:
    source = Path(source_path)
    payload = read_json(source)
    as_of_date = payload_date(payload)
    relative_path = Path(kind) / f"{as_of_date}.json"
    target = Path(archive_root) / relative_path
    write_json(target, payload)
    return {
        "kind": kind,
        "as_of_date": as_of_date,
        "generated_at": payload.get("generated_at"),
        "path": relative_path.as_posix(),
        "source": source_label or source.as_posix(),
        "summary": summarize(kind, payload),
    }


def update_archive_index(archive_root: str | Path, records: list[dict[str, Any]]) -> dict[str, Any]:
    root = Path(archive_root)
    index_path = root / "index.json"
    if index_path.exists():
        index = read_json(index_path)
        existing = index.get("records", [])
    else:
        existing = []

    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for record in existing:
        kind = record.get("kind")
        as_of_date = record.get("as_of_date")
        if isinstance(kind, str) and isinstance(as_of_date, str):
            by_key[(kind, as_of_date)] = record
    for record in records:
        by_key[(record["kind"], record["as_of_date"])] = record

    merged = sorted(by_key.values(), key=lambda item: (item.get("as_of_date", ""), item.get("kind", "")))
    payload = {
        "schema_version": ARCHIVE_SCHEMA_VERSION,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "records": merged,
    }
    write_json(index_path, payload)
    return payload
