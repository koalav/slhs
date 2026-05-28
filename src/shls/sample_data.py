from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .config import SAMSUNG, SKHYNIX


def _bars(start: date, days: int, base: float, drift: float, cycle: float) -> list[dict[str, Any]]:
    bars = []
    current = start
    idx = 0
    while len(bars) < days:
        if current.weekday() < 5:
            value = base * (1 + drift * idx + 0.05 * math.sin(idx / cycle))
            bars.append(
                {
                    "date": current.isoformat(),
                    "timestamp": datetime.combine(current, datetime.min.time(), timezone.utc).isoformat(),
                    "open": round(value * 0.995, 2),
                    "high": round(value * 1.015, 2),
                    "low": round(value * 0.985, 2),
                    "close": round(value, 2),
                    "volume": int(10_000_000 + 2_000_000 * math.sin(idx / 6)),
                }
            )
            idx += 1
        current += timedelta(days=1)
    return bars


def make_fixture() -> dict[str, Any]:
    start = date.today() - timedelta(days=420)
    samsung_bars = _bars(start, 260, 72_000, 0.006, 11)
    skhynix_bars = _bars(start, 260, 180_000, 0.010, 9)
    samsung_price = 294_500
    skhynix_price = 2_196_000
    samsung_bars[-1]["close"] = samsung_price
    skhynix_bars[-1]["close"] = skhynix_price
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": ["fixture"],
        "equities": {
            "samsung": {
                "key": "samsung",
                "name": SAMSUNG.name,
                "code": SAMSUNG.code,
                "yahoo_symbol": SAMSUNG.yahoo_symbol,
                "symbol": SAMSUNG.yahoo_symbol,
                "price": samsung_price,
                "previous_close": 307_000,
                "change_pct": samsung_price / 307_000 - 1,
                "market_cap_krw": samsung_price * SAMSUNG.fallback_shares,
                "shares_outstanding": SAMSUNG.fallback_shares,
                "per": 36.84,
                "pbr": 1.51,
                "source": "fixture",
                "history": samsung_bars,
            },
            "skhynix": {
                "key": "skhynix",
                "name": SKHYNIX.name,
                "code": SKHYNIX.code,
                "yahoo_symbol": SKHYNIX.yahoo_symbol,
                "symbol": SKHYNIX.yahoo_symbol,
                "price": skhynix_price,
                "previous_close": 2_242_625,
                "change_pct": skhynix_price / 2_242_625 - 1,
                "market_cap_krw": skhynix_price * SKHYNIX.fallback_shares,
                "shares_outstanding": SKHYNIX.fallback_shares,
                "per": -11.3,
                "pbr": 1.82,
                "source": "fixture",
                "history": skhynix_bars,
            },
        },
        "macro": {
            "kospi": {"name": "KOSPI", "symbol": "^KS11", "price": 7979.33, "change_pct": -0.0303},
            "vix": {"name": "VIX", "symbol": "^VIX", "price": 16.29, "change_pct": -0.0181},
            "usdkrw": {"name": "USD/KRW", "symbol": "KRW=X", "price": 1508.48, "change_pct": 0.0056},
            "soxx": {"name": "SOXX", "symbol": "SOXX", "price": 563.98, "change_pct": -0.0107},
        },
    }
