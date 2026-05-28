from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .calendar import business_days_until, next_stock_futures_expiry
from .config import DEFAULT_CONFIG, StrategyConfig
from .indicators import (
    annualized_volatility,
    beta,
    clamp,
    compact_series,
    correlation,
    cumulative_weighted_spread,
    latest,
    log_returns,
    pct_change,
    rolling_mean,
    rolling_zscore,
    trailing_max,
    trailing_min,
)
from .manual_data import consensus_summary, hbm_event_summary

KST = timezone(timedelta(hours=9))


def _common_history(market: dict[str, Any]) -> dict[str, list[Any]]:
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


def _score_value_gap(ratio: float | None, config: StrategyConfig) -> int:
    if ratio is None:
        return 0
    if ratio >= config.ratio_extreme:
        return 15
    if ratio >= config.ratio_watch:
        return 12
    if ratio >= 0.70:
        return 8
    if ratio >= 0.60:
        return 4
    return 0


def _score_oversold(z_latest: float | None, config: StrategyConfig) -> int:
    if z_latest is None:
        return 0
    if z_latest <= config.z_oversold:
        return 15
    if z_latest <= config.z_reversal:
        return 10
    if z_latest <= -1.0:
        return 5
    return 0


def _score_reversal(
    z_latest: float | None,
    z_min10: float | None,
    spread_latest: float | None,
    spread_ma20_latest: float | None,
    config: StrategyConfig,
) -> tuple[int, bool]:
    if z_latest is None:
        return 0, False
    recovered_from_extreme = z_min10 is not None and z_min10 <= config.z_oversold and z_latest > config.z_reversal
    above_ma20 = (
        spread_latest is not None
        and spread_ma20_latest is not None
        and spread_latest > spread_ma20_latest
    )
    if recovered_from_extreme and above_ma20:
        return 25, True
    if recovered_from_extreme:
        return 20, True
    if above_ma20 and z_latest > -2.0:
        return 15, False
    return 0, False


def _score_consensus(summary: dict[str, Any]) -> int:
    revision_diff = summary.get("revision_diff")
    target_signal = summary.get("target_pair_signal")
    if revision_diff is not None:
        if revision_diff >= 0.05:
            return 20
        if revision_diff >= 0.02:
            return 15
        if revision_diff > 0:
            return 10
    # Target upside is useful, but weaker than actual estimate revision.
    if target_signal is not None:
        if target_signal >= 0.20:
            return 8
        if target_signal >= 0.05:
            return 4
    return 0


def _score_hynix_fade(
    skhynix_close: list[float],
    skhynix_turnover: list[float | None],
    ratio_latest: float | None,
    ratio_ma20_latest: float | None,
) -> tuple[int, dict[str, Any]]:
    close_latest = skhynix_close[-1] if skhynix_close else None
    high20 = trailing_max(skhynix_close, 20)
    turnover_latest = latest(skhynix_turnover)
    turnover_ma20 = latest(rolling_mean(skhynix_turnover, 20))

    failed_high = (
        close_latest is not None and high20 is not None and close_latest < high20 * 0.985
    )
    turnover_fading = (
        turnover_latest is not None
        and turnover_ma20 is not None
        and turnover_latest < turnover_ma20
    )
    ratio_turning_down = (
        ratio_latest is not None
        and ratio_ma20_latest is not None
        and ratio_latest < ratio_ma20_latest
    )
    score = 0
    score += 4 if failed_high else 0
    score += 3 if turnover_fading else 0
    score += 3 if ratio_turning_down else 0
    return score, {
        "failed_20d_high": failed_high,
        "turnover_fading": turnover_fading,
        "ratio_below_ma20": ratio_turning_down,
        "skhynix_20d_high": high20,
        "skhynix_turnover": turnover_latest,
        "skhynix_turnover_ma20": turnover_ma20,
    }


def build_signals(
    market: dict[str, Any],
    consensus_rows: list[dict[str, Any]],
    events: list[dict[str, Any]],
    config: StrategyConfig = DEFAULT_CONFIG,
) -> dict[str, Any]:
    history = _common_history(market)
    dates = history["dates"]
    samsung_close = history["samsung_close"]
    skhynix_close = history["skhynix_close"]
    samsung = market["equities"]["samsung"]
    skhynix = market["equities"]["skhynix"]

    samsung_shares = samsung.get("shares_outstanding") or 0
    skhynix_shares = skhynix.get("shares_outstanding") or 0
    samsung_mcap_series = [close * samsung_shares for close in samsung_close]
    skhynix_mcap_series = [close * skhynix_shares for close in skhynix_close]
    ratio_series = [
        h / s if s else None for s, h in zip(samsung_mcap_series, skhynix_mcap_series)
    ]
    ratio_ma20 = rolling_mean(ratio_series, config.spread_ma_window)

    spread = cumulative_weighted_spread(samsung_close, skhynix_close, config.model_hedge_h)
    spread_z = rolling_zscore(spread, config.spread_window)
    spread_ma20 = rolling_mean(spread, config.spread_ma_window)

    samsung_returns = log_returns(samsung_close)
    skhynix_returns = log_returns(skhynix_close)
    samsung_vol60 = annualized_volatility(samsung_returns, config.vol_window)
    skhynix_vol60 = annualized_volatility(skhynix_returns, config.vol_window)
    vol_hedge_h = (
        samsung_vol60 / skhynix_vol60
        if samsung_vol60 is not None and skhynix_vol60 not in (None, 0)
        else None
    )
    corr60 = correlation(samsung_returns, skhynix_returns, config.vol_window)
    beta60 = beta(samsung_returns, skhynix_returns, config.vol_window)

    skhynix_turnover = [
        (close * volume) / mcap if close and volume and mcap else None
        for close, volume, mcap in zip(
            skhynix_close, history["skhynix_volume"], skhynix_mcap_series
        )
    ]

    ratio_latest = latest(ratio_series)
    ratio_ma20_latest = latest(ratio_ma20)
    z_latest = latest(spread_z)
    z_min10 = trailing_min(spread_z, 10)
    spread_latest = latest(spread)
    spread_ma20_latest = latest(spread_ma20)

    consensus = consensus_summary(
        consensus_rows,
        samsung.get("price"),
        skhynix.get("price"),
        config.model_hedge_h,
    )
    today = datetime.now(KST).date()
    hbm = hbm_event_summary(events, today)

    value_score = _score_value_gap(ratio_latest, config)
    oversold_score = _score_oversold(z_latest, config)
    reversal_score, reversal_confirmed = _score_reversal(
        z_latest, z_min10, spread_latest, spread_ma20_latest, config
    )
    consensus_score = _score_consensus(consensus)
    hbm_score = hbm.get("score", 0) if hbm.get("available") else 0
    hynix_fade_score, hynix_fade = _score_hynix_fade(
        skhynix_close, skhynix_turnover, ratio_latest, ratio_ma20_latest
    )
    total_score = (
        value_score
        + oversold_score
        + reversal_score
        + consensus_score
        + hbm_score
        + hynix_fade_score
    )

    if total_score < 40:
        action = "NO_ENTRY"
        action_label = "진입 금지"
    elif total_score < 60:
        action = "WATCH"
        action_label = "관찰"
    elif total_score < 75:
        action = "TEST_1H"
        action_label = "1H 소량 테스트 후보"
    else:
        action = "ENTER_1H"
        action_label = "1H 진입 후보"

    if not reversal_confirmed and action in {"TEST_1H", "ENTER_1H"}:
        action = "WAIT_FOR_REVERSAL"
        action_label = "스프레드 반전 대기"

    samsung_notional = (
        (samsung.get("price") or 0)
        * config.futures_multiplier
        * config.samsung_contracts_1h
    )
    skhynix_notional = (
        (skhynix.get("price") or 0)
        * config.futures_multiplier
        * config.skhynix_contracts_1h
    )
    gross_notional = samsung_notional + skhynix_notional
    actual_hedge_h = skhynix_notional / samsung_notional if samsung_notional else None
    margin_estimate = (
        samsung_notional * config.samsung_margin_rate
        + skhynix_notional * config.skhynix_margin_rate
    )
    expiry = next_stock_futures_expiry(today)
    dte_business = business_days_until(today, expiry)

    stress = []
    for move in [-0.20, -0.10, -0.07, -0.05, 0.05, 0.10]:
        stress.append(
            {
                "weighted_spread_move": move,
                "estimated_1h_pnl_krw": samsung_notional * move,
            }
        )

    return {
        "config": config.__dict__,
        "score": {
            "total": int(total_score),
            "max": 100,
            "action": action,
            "action_label": action_label,
            "components": {
                "value_gap": value_score,
                "spread_oversold": oversold_score,
                "spread_reversal": reversal_score,
                "earnings_revision": consensus_score,
                "hbm_event": hbm_score,
                "hynix_fade": hynix_fade_score,
            },
            "required": {
                "spread_reversal_confirmed": reversal_confirmed,
            },
        },
        "metrics": {
            "mcap_ratio": ratio_latest,
            "mcap_ratio_ma20": ratio_ma20_latest,
            "samsung_premium": (1 / ratio_latest - 1) if ratio_latest else None,
            "spread": spread_latest,
            "spread_ma20": spread_ma20_latest,
            "spread_zscore": z_latest,
            "spread_zscore_min10": z_min10,
            "samsung_vol60": samsung_vol60,
            "skhynix_vol60": skhynix_vol60,
            "vol_hedge_h": vol_hedge_h,
            "corr60": corr60,
            "ols_beta60": beta60,
            "skhynix_turnover": hynix_fade.get("skhynix_turnover"),
            "skhynix_turnover_ma20": hynix_fade.get("skhynix_turnover_ma20"),
            "samsung_1d_change": pct_change(samsung.get("price"), samsung.get("previous_close")),
            "skhynix_1d_change": pct_change(skhynix.get("price"), skhynix.get("previous_close")),
        },
        "flags": hynix_fade,
        "consensus": consensus,
        "hbm_events": hbm,
        "position_1h": {
            "samsung_contracts": config.samsung_contracts_1h,
            "skhynix_contracts": config.skhynix_contracts_1h,
            "futures_multiplier": config.futures_multiplier,
            "samsung_notional_krw": samsung_notional,
            "skhynix_notional_krw": skhynix_notional,
            "gross_notional_krw": gross_notional,
            "net_notional_krw": samsung_notional - skhynix_notional,
            "actual_hedge_h": actual_hedge_h,
            "margin_estimate_krw": margin_estimate,
            "recommended_cash_3x_margin_krw": margin_estimate * 3,
            "next_expiry": expiry.isoformat(),
            "business_days_to_expiry": dte_business,
            "rollover_watch": dte_business <= 5,
            "stress": stress,
        },
        "series": {
            "dates": dates[-180:],
            "samsung_close": compact_series(samsung_close[-180:], 2),
            "skhynix_close": compact_series(skhynix_close[-180:], 2),
            "mcap_ratio": compact_series(ratio_series[-180:], 6),
            "mcap_ratio_ma20": compact_series(ratio_ma20[-180:], 6),
            "spread": compact_series(spread[-180:], 6),
            "spread_ma20": compact_series(spread_ma20[-180:], 6),
            "spread_zscore": compact_series(spread_z[-180:], 4),
        },
    }
