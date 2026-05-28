from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any

from .config import DEFAULT_CONFIG, StrategyConfig
from .indicators import (
    compact_series,
    cumulative_weighted_spread,
    latest,
    log_returns,
    rolling_mean,
    rolling_std,
    rolling_zscore,
)
from .providers import collect_market_data


def _aligned_history(market: dict[str, Any]) -> dict[str, list[Any]]:
    samsung = {bar["date"]: bar for bar in market["equities"]["samsung"]["history"]}
    skhynix = {bar["date"]: bar for bar in market["equities"]["skhynix"]["history"]}
    dates = sorted(set(samsung) & set(skhynix))
    return {
        "dates": dates,
        "samsung_close": [samsung[d]["close"] for d in dates],
        "skhynix_close": [skhynix[d]["close"] for d in dates],
        "samsung_volume": [samsung[d].get("volume") for d in dates],
        "skhynix_volume": [skhynix[d].get("volume") for d in dates],
    }


def _rolling_beta(
    dependent: list[float | None],
    independent: list[float | None],
    window: int,
) -> list[float | None]:
    out: list[float | None] = []
    for idx in range(len(dependent)):
        pairs = [
            (x, y)
            for x, y in zip(
                dependent[max(0, idx - window + 1) : idx + 1],
                independent[max(0, idx - window + 1) : idx + 1],
            )
            if x is not None and y is not None
        ]
        if len(pairs) != window:
            out.append(None)
            continue
        xs = [x for x, _ in pairs]
        ys = [y for _, y in pairs]
        x_avg = mean(xs)
        y_avg = mean(ys)
        cov = sum((x - x_avg) * (y - y_avg) for x, y in pairs)
        var_y = sum((y - y_avg) ** 2 for y in ys)
        out.append(cov / var_y if var_y else None)
    return out


def _rolling_corr(
    xs: list[float | None],
    ys: list[float | None],
    window: int,
) -> list[float | None]:
    out: list[float | None] = []
    for idx in range(len(xs)):
        pairs = [
            (x, y)
            for x, y in zip(
                xs[max(0, idx - window + 1) : idx + 1],
                ys[max(0, idx - window + 1) : idx + 1],
            )
            if x is not None and y is not None
        ]
        if len(pairs) != window:
            out.append(None)
            continue
        x_vals = [x for x, _ in pairs]
        y_vals = [y for _, y in pairs]
        x_avg = mean(x_vals)
        y_avg = mean(y_vals)
        cov = sum((x - x_avg) * (y - y_avg) for x, y in pairs)
        x_var = sum((x - x_avg) ** 2 for x in x_vals)
        y_var = sum((y - y_avg) ** 2 for y in y_vals)
        out.append(cov / ((x_var * y_var) ** 0.5) if x_var and y_var else None)
    return out


def _normalize(values: list[float]) -> list[float | None]:
    if not values or not values[0]:
        return [None for _ in values]
    base = values[0]
    return [value / base - 1 for value in values]


def _ratio(numerators: list[float | None], denominators: list[float | None]) -> list[float | None]:
    return [
        numerator / denominator
        if numerator is not None and denominator not in (None, 0)
        else None
        for numerator, denominator in zip(numerators, denominators)
    ]


def build_base_materials(config: StrategyConfig = DEFAULT_CONFIG) -> dict[str, Any]:
    market = collect_market_data(history_range="2y")
    history = _aligned_history(market)
    dates = history["dates"]
    samsung_close = history["samsung_close"]
    skhynix_close = history["skhynix_close"]
    samsung = market["equities"]["samsung"]
    skhynix = market["equities"]["skhynix"]

    samsung_returns = log_returns(samsung_close)
    skhynix_returns = log_returns(skhynix_close)
    spread = cumulative_weighted_spread(samsung_close, skhynix_close, config.model_hedge_h)
    spread_z = rolling_zscore(spread, config.spread_window)
    spread_ma20 = rolling_mean(spread, config.spread_ma_window)

    beta_s_on_h = _rolling_beta(samsung_returns, skhynix_returns, config.vol_window)
    beta_h_on_s = _rolling_beta(skhynix_returns, samsung_returns, config.vol_window)
    corr60 = _rolling_corr(samsung_returns, skhynix_returns, config.vol_window)
    vol_s60 = [v * (252**0.5) if v is not None else None for v in rolling_std(samsung_returns, config.vol_window)]
    vol_h60 = [v * (252**0.5) if v is not None else None for v in rolling_std(skhynix_returns, config.vol_window)]
    vol_hedge = _ratio(vol_s60, vol_h60)

    samsung_mcap = [
        close * (samsung.get("shares_outstanding") or 0)
        for close in samsung_close
    ]
    skhynix_mcap = [
        close * (skhynix.get("shares_outstanding") or 0)
        for close in skhynix_close
    ]
    mcap_ratio = _ratio(skhynix_mcap, samsung_mcap)
    mcap_ratio_ma20 = rolling_mean(mcap_ratio, config.spread_ma_window)

    latest_samsung = samsung_close[-1] if samsung_close else None
    latest_skhynix = skhynix_close[-1] if skhynix_close else None
    latest_ratio = latest(mcap_ratio)
    latest_spread_z = latest(spread_z)
    latest_beta = latest(beta_s_on_h)
    latest_corr = latest(corr60)

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market_source": market["source"],
        "period": {
            "start": dates[0] if dates else None,
            "end": dates[-1] if dates else None,
            "observations": len(dates),
        },
        "definitions": {
            "spread": "log(Samsung/Samsung_0) - h * log(SK Hynix/SK Hynix_0)",
            "hedge_h": config.model_hedge_h,
            "beta_samsung_on_skhynix": "60D rolling beta from regressing Samsung daily log return on SK Hynix daily log return",
            "vol_hedge_h": "Samsung 60D annualized volatility / SK Hynix 60D annualized volatility",
        },
        "latest": {
            "samsung_close": latest_samsung,
            "skhynix_close": latest_skhynix,
            "samsung_return_2y": samsung_close[-1] / samsung_close[0] - 1 if len(samsung_close) > 1 else None,
            "skhynix_return_2y": skhynix_close[-1] / skhynix_close[0] - 1 if len(skhynix_close) > 1 else None,
            "mcap_ratio": latest_ratio,
            "samsung_premium": 1 / latest_ratio - 1 if latest_ratio else None,
            "spread": latest(spread),
            "spread_zscore_60d": latest_spread_z,
            "beta_samsung_on_skhynix_60d": latest_beta,
            "beta_skhynix_on_samsung_60d": latest(beta_h_on_s),
            "corr_60d": latest_corr,
            "samsung_vol_60d": latest(vol_s60),
            "skhynix_vol_60d": latest(vol_h60),
            "vol_hedge_h_60d": latest(vol_hedge),
        },
        "series": {
            "dates": dates,
            "samsung_close": compact_series(samsung_close, 2),
            "skhynix_close": compact_series(skhynix_close, 2),
            "samsung_normalized_return": compact_series(_normalize(samsung_close), 6),
            "skhynix_normalized_return": compact_series(_normalize(skhynix_close), 6),
            "spread": compact_series(spread, 6),
            "spread_ma20": compact_series(spread_ma20, 6),
            "spread_zscore_60d": compact_series(spread_z, 4),
            "beta_samsung_on_skhynix_60d": compact_series(beta_s_on_h, 4),
            "beta_skhynix_on_samsung_60d": compact_series(beta_h_on_s, 4),
            "corr_60d": compact_series(corr60, 4),
            "samsung_vol_60d": compact_series(vol_s60, 4),
            "skhynix_vol_60d": compact_series(vol_h60, 4),
            "vol_hedge_h_60d": compact_series(vol_hedge, 4),
            "mcap_ratio": compact_series(mcap_ratio, 6),
            "mcap_ratio_ma20": compact_series(mcap_ratio_ma20, 6),
        },
    }
