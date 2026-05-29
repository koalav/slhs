from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
import ast
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .config import MACRO_SYMBOLS, SAMSUNG, SKHYNIX, EquityConfig
from .indicators import pct_change, safe_float

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)
KST = timezone(timedelta(hours=9))


class DataProviderError(RuntimeError):
    pass


def _request_json(url: str, timeout: int = 20) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise DataProviderError(f"failed to fetch JSON: {url}") from exc


def _request_text(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise DataProviderError(f"failed to fetch text: {url}") from exc


def fetch_yahoo_chart(symbol: str, range_: str = "2y", interval: str = "1d") -> dict[str, Any]:
    errors: list[str] = []
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{symbol}?range={range_}&interval={interval}"
        try:
            payload = _request_json(url)
            result = payload.get("chart", {}).get("result")
            if result:
                return result[0]
            errors.append(f"{host}: empty result")
        except DataProviderError as exc:
            errors.append(f"{host}: {exc}")
            time.sleep(0.5)
    raise DataProviderError(f"empty Yahoo chart result for {symbol}; {'; '.join(errors)}")


def quote_from_yahoo_chart(symbol: str, chart: dict[str, Any]) -> dict[str, Any]:
    meta = chart.get("meta", {})
    price = safe_float(meta.get("regularMarketPrice"))
    previous = safe_float(meta.get("previousClose"))
    market_time = meta.get("regularMarketTime")
    updated_at = (
        datetime.fromtimestamp(market_time, tz=timezone.utc).isoformat()
        if isinstance(market_time, int)
        else None
    )
    return {
        "symbol": symbol,
        "price": price,
        "previous_close": previous,
        "change_pct": pct_change(price, previous),
        "currency": meta.get("currency"),
        "exchange": meta.get("exchangeName"),
        "timezone": meta.get("timezone"),
        "updated_at": updated_at,
        "source": "yahoo_chart",
    }


def fetch_yahoo_quote(symbol: str) -> dict[str, Any]:
    chart = fetch_yahoo_chart(symbol, range_="5d", interval="5m")
    return quote_from_yahoo_chart(symbol, chart)


def parse_yahoo_bars(chart: dict[str, Any]) -> list[dict[str, Any]]:
    timestamps = chart.get("timestamp") or []
    quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    bars: list[dict[str, Any]] = []
    for idx, ts in enumerate(timestamps):
        close = safe_float(closes[idx] if idx < len(closes) else None)
        if close is None:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        bars.append(
            {
                "date": dt.date().isoformat(),
                "timestamp": dt.isoformat(),
                "open": safe_float(opens[idx] if idx < len(opens) else None),
                "high": safe_float(highs[idx] if idx < len(highs) else None),
                "low": safe_float(lows[idx] if idx < len(lows) else None),
                "close": close,
                "volume": safe_float(volumes[idx] if idx < len(volumes) else None),
            }
        )
    return bars


def _quote_date(quote: dict[str, Any]) -> date | None:
    updated_at = quote.get("updated_at")
    if not isinstance(updated_at, str) or not updated_at:
        return None
    try:
        return datetime.fromisoformat(updated_at.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def apply_realtime_quote_to_latest_bar(
    bars: list[dict[str, Any]], quote: dict[str, Any]
) -> list[dict[str, Any]]:
    if not bars:
        return bars
    price = safe_float(quote.get("price"))
    quote_day = _quote_date(quote)
    if price is None or quote_day is None:
        return bars

    latest = bars[-1]
    if latest.get("date") != quote_day.isoformat():
        return bars

    latest["close"] = price
    latest["timestamp"] = quote.get("updated_at") or latest.get("timestamp")
    if quote.get("intraday_volume") is not None:
        latest["volume"] = quote.get("intraday_volume")
    high = safe_float(latest.get("high"))
    low = safe_float(latest.get("low"))
    latest["high"] = max(high, price) if high is not None else price
    latest["low"] = min(low, price) if low is not None else price
    return bars


def _clean_number(raw: str | None) -> float | None:
    if raw is None:
        return None
    value = raw.replace(",", "").replace("\xa0", "").strip()
    if not value or value in {"N/A", "-"}:
        return None
    return safe_float(value)


def _clean_int(raw: str | int | float | None) -> int | None:
    value = _clean_number(str(raw) if raw is not None else None)
    return int(value) if value is not None else None


def _extract_label_number(html: str, label: str, max_chars: int = 1200) -> float | None:
    idx = html.find(label)
    if idx == -1:
        return None
    fragment = html[idx : idx + max_chars]
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = re.sub(r"\s+", " ", text)
    numbers = re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?", text)
    return _clean_number(numbers[0]) if numbers else None


def fetch_naver_profile(equity: EquityConfig) -> dict[str, Any]:
    url = f"https://finance.naver.com/item/main.naver?code={equity.code}"
    html = _request_text(url)
    market_cap_100m = _extract_label_number(html, "시가총액(억)")
    shares = _extract_label_number(html, "상장주식수")
    per = _extract_label_number(html, "PER(배)")
    pbr = _extract_label_number(html, "PBR(배)")
    return {
        "code": equity.code,
        "market_cap_krw": market_cap_100m * 100_000_000 if market_cap_100m is not None else None,
        "shares_outstanding": int(shares) if shares is not None else equity.fallback_shares,
        "per": per,
        "pbr": pbr,
        "source": "naver_finance",
    }


def fetch_naver_realtime(equity: EquityConfig) -> dict[str, Any]:
    url = f"https://polling.finance.naver.com/api/realtime/domestic/stock/{equity.code}"
    payload = _request_json(url)
    rows = payload.get("datas") or []
    if not rows:
        raise DataProviderError(f"empty Naver realtime result for {equity.code}")
    row = rows[0]
    price = _clean_number(row.get("closePriceRaw") or row.get("closePrice"))
    change_abs = _clean_number(
        row.get("compareToPreviousClosePriceRaw") or row.get("compareToPreviousClosePrice")
    )
    previous = price - change_abs if price is not None and change_abs is not None else None
    change_pct = _clean_number(row.get("fluctuationsRatioRaw") or row.get("fluctuationsRatio"))
    return {
        "symbol": equity.yahoo_symbol,
        "price": price,
        "previous_close": previous,
        "change_pct": change_pct / 100 if change_pct is not None else pct_change(price, previous),
        "currency": "KRW",
        "exchange": "KOSPI",
        "timezone": "Asia/Seoul",
        "updated_at": row.get("localTradedAt"),
        "market_status": row.get("marketStatus"),
        "intraday_volume": _clean_int(row.get("accumulatedTradingVolumeRaw")),
        "intraday_trading_value_krw": _clean_int(row.get("accumulatedTradingValueRaw")),
        "market_cap_krw": _clean_int(row.get("marketValueFullRaw")),
        "source": "naver_realtime",
    }


def fetch_naver_history(equity: EquityConfig, days: int = 760) -> list[dict[str, Any]]:
    end = datetime.now(KST).date()
    start = end - timedelta(days=days)
    url = (
        "https://api.finance.naver.com/siseJson.naver"
        f"?symbol={equity.code}&requestType=1"
        f"&startTime={start:%Y%m%d}&endTime={end:%Y%m%d}&timeframe=day"
    )
    text = _request_text(url).strip()
    try:
        rows = ast.literal_eval(text)
    except (SyntaxError, ValueError) as exc:
        raise DataProviderError(f"failed to parse Naver history for {equity.code}") from exc
    if len(rows) < 2:
        raise DataProviderError(f"empty Naver history result for {equity.code}")

    bars: list[dict[str, Any]] = []
    for row in rows[1:]:
        if len(row) < 6:
            continue
        raw_date, open_, high, low, close, volume = row[:6]
        day = datetime.strptime(str(raw_date), "%Y%m%d").date()
        bars.append(
            {
                "date": day.isoformat(),
                "timestamp": datetime.combine(day, datetime.min.time(), timezone.utc).isoformat(),
                "open": safe_float(open_),
                "high": safe_float(high),
                "low": safe_float(low),
                "close": safe_float(close),
                "volume": safe_float(volume),
            }
        )
    return [bar for bar in bars if bar["close"] is not None]


def fetch_equity(equity: EquityConfig, history_range: str = "2y") -> dict[str, Any]:
    profile = fetch_naver_profile(equity)
    try:
        quote = fetch_naver_realtime(equity)
        bars = fetch_naver_history(equity)
    except DataProviderError:
        chart = fetch_yahoo_chart(equity.yahoo_symbol, range_=history_range, interval="1d")
        quote = quote_from_yahoo_chart(equity.yahoo_symbol, chart)
        bars = parse_yahoo_bars(chart)
    bars = apply_realtime_quote_to_latest_bar(bars, quote)

    shares = profile.get("shares_outstanding") or equity.fallback_shares
    if quote.get("market_cap_krw") is not None:
        profile["market_cap_krw"] = quote["market_cap_krw"]
    elif profile.get("market_cap_krw") is None and quote.get("price") is not None:
        profile["market_cap_krw"] = quote["price"] * shares

    return {
        "key": equity.key,
        "name": equity.name,
        "code": equity.code,
        "yahoo_symbol": equity.yahoo_symbol,
        **quote,
        **profile,
        "quote_source": quote.get("source"),
        "profile_source": profile.get("source"),
        "source": [quote.get("source"), profile.get("source")],
        "history": bars,
    }


def fetch_macro_quotes() -> dict[str, dict[str, Any]]:
    macro: dict[str, dict[str, Any]] = {}
    for key, item in MACRO_SYMBOLS.items():
        try:
            quote = fetch_yahoo_quote(item["symbol"])
            macro[key] = {"name": item["name"], **quote}
            time.sleep(0.1)
        except DataProviderError as exc:
            macro[key] = {"name": item["name"], "symbol": item["symbol"], "error": str(exc)}
    return macro


def fetch_pykrx_flow(start: str, end: str) -> dict[str, Any]:
    try:
        from pykrx import stock  # type: ignore
    except Exception:
        return {"available": False, "reason": "pykrx is not installed"}

    out: dict[str, Any] = {"available": True, "source": "pykrx"}
    for equity in (SAMSUNG, SKHYNIX):
        try:
            df = stock.get_market_trading_value_by_date(start, end, equity.code)
            recent = df.tail(5)
            out[equity.key] = {
                "foreign_5d_krw": float(recent.get("외국인합계", recent.get("외국인", 0)).sum()),
                "institution_5d_krw": float(recent.get("기관합계", recent.get("기관", 0)).sum()),
                "individual_5d_krw": float(recent.get("개인", 0).sum()),
            }
        except Exception as exc:
            out[equity.key] = {"error": str(exc)}
    return out


def collect_market_data(history_range: str = "2y") -> dict[str, Any]:
    samsung = fetch_equity(SAMSUNG, history_range=history_range)
    time.sleep(0.2)
    skhynix = fetch_equity(SKHYNIX, history_range=history_range)
    macro = fetch_macro_quotes()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": ["naver_realtime", "naver_finance", "yahoo_chart_macro"],
        "equities": {"samsung": samsung, "skhynix": skhynix},
        "macro": macro,
    }
