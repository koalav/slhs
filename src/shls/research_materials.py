from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .indicators import safe_float
from .manual_data import load_csv


def _num(value: str | None) -> float | None:
    return safe_float(value)


def _int(value: str | None) -> int | None:
    number = safe_float(value)
    return int(number) if number is not None else None


def load_target_prices(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for row in load_csv(path):
        rows.append(
            {
                "date": row.get("date", ""),
                "company": row.get("company", ""),
                "source": row.get("source", ""),
                "rating": row.get("rating", ""),
                "current_price_krw": _num(row.get("current_price_krw")),
                "target_price_krw": _num(row.get("target_price_krw")),
                "target_high_krw": _num(row.get("target_high_krw")),
                "target_low_krw": _num(row.get("target_low_krw")),
                "upside_pct": _num(row.get("upside_pct")),
                "note": row.get("note", ""),
                "source_url": row.get("source_url", ""),
            }
        )
    return rows


def load_earnings(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for row in load_csv(path):
        rows.append(
            {
                "period": row.get("period", ""),
                "period_type": row.get("period_type", ""),
                "company": row.get("company", ""),
                "revenue_krw_t": _num(row.get("revenue_krw_t")),
                "operating_profit_krw_t": _num(row.get("operating_profit_krw_t")),
                "net_profit_krw_t": _num(row.get("net_profit_krw_t")),
                "op_margin_pct": _num(row.get("op_margin_pct")),
                "source": row.get("source", ""),
                "note": row.get("note", ""),
                "source_url": row.get("source_url", ""),
            }
        )
    return rows


def load_articles(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for row in load_csv(path):
        rows.append(
            {
                "date": row.get("date", ""),
                "title": row.get("title", ""),
                "publisher": row.get("publisher", ""),
                "theme": row.get("theme", ""),
                "direction": _int(row.get("direction")),
                "confidence": _int(row.get("confidence")),
                "summary": row.get("summary", ""),
                "source_url": row.get("source_url", ""),
            }
        )
    return rows


def load_global_factors(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for row in load_csv(path):
        value_number = _num(row.get("value"))
        rows.append(
            {
                "date": row.get("date", ""),
                "category": row.get("category", ""),
                "metric": row.get("metric", ""),
                "company": row.get("company", ""),
                "value": value_number if value_number is not None else row.get("value", ""),
                "unit": row.get("unit", ""),
                "direction": _int(row.get("direction")),
                "confidence": _int(row.get("confidence")),
                "note": row.get("note", ""),
                "source_url": row.get("source_url", ""),
            }
        )
    return rows


def _coverage(targets: list[Any], earnings: list[Any], articles: list[Any], global_factors: list[Any]) -> list[dict[str, Any]]:
    checks = [
        ("expected_target_price", "Target price", len(targets) > 0, len(targets)),
        ("earnings_trend", "Earnings trend", len(earnings) > 0, len(earnings)),
        ("major_articles", "Major articles", len(articles) > 0, len(articles)),
        ("global_memory_factors", "Memory/global factors", len(global_factors) > 0, len(global_factors)),
    ]
    return [
        {"key": key, "label": label, "available": available, "rows": rows}
        for key, label, available, rows in checks
    ]


def build_research_materials(
    target_path: str | Path = "data/manual/target_prices.csv",
    earnings_path: str | Path = "data/manual/earnings_trend.csv",
    articles_path: str | Path = "data/manual/major_articles.csv",
    global_path: str | Path = "data/manual/global_factors.csv",
) -> dict[str, Any]:
    targets = load_target_prices(target_path)
    earnings = load_earnings(earnings_path)
    articles = load_articles(articles_path)
    global_factors = load_global_factors(global_path)

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "coverage": _coverage(targets, earnings, articles, global_factors),
        "target_prices": targets,
        "earnings_trend": earnings,
        "major_articles": articles,
        "global_factors": global_factors,
        "notes": [
            "Target prices and forward estimates are seed/manual data unless replaced with a licensed consensus feed.",
            "Global factor rows are source-linked research inputs; they are not automatically updated in v1.",
        ],
    }


def write_research_materials(path: str | Path, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
