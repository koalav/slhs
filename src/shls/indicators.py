from __future__ import annotations

import math
from statistics import mean
from typing import Iterable, Sequence


def safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return current / previous - 1.0


def rolling_mean(values: Sequence[float | None], window: int) -> list[float | None]:
    out: list[float | None] = []
    for idx in range(len(values)):
        chunk = [v for v in values[max(0, idx - window + 1) : idx + 1] if v is not None]
        out.append(mean(chunk) if len(chunk) == window else None)
    return out


def rolling_std(values: Sequence[float | None], window: int) -> list[float | None]:
    out: list[float | None] = []
    for idx in range(len(values)):
        chunk = [v for v in values[max(0, idx - window + 1) : idx + 1] if v is not None]
        if len(chunk) != window:
            out.append(None)
            continue
        avg = mean(chunk)
        variance = sum((v - avg) ** 2 for v in chunk) / (window - 1)
        out.append(math.sqrt(max(variance, 0.0)))
    return out


def rolling_zscore(values: Sequence[float | None], window: int) -> list[float | None]:
    means = rolling_mean(values, window)
    stds = rolling_std(values, window)
    out: list[float | None] = []
    for value, avg, std in zip(values, means, stds):
        if value is None or avg is None or std in (None, 0):
            out.append(None)
        else:
            out.append((value - avg) / std)
    return out


def log_returns(values: Sequence[float | None]) -> list[float | None]:
    out: list[float | None] = [None]
    for prev, cur in zip(values, values[1:]):
        if prev in (None, 0) or cur in (None, 0):
            out.append(None)
        else:
            out.append(math.log(cur / prev))
    return out


def cumulative_weighted_spread(
    samsung_close: Sequence[float],
    skhynix_close: Sequence[float],
    hedge_h: float,
) -> list[float | None]:
    if not samsung_close or not skhynix_close:
        return []
    s0 = samsung_close[0]
    h0 = skhynix_close[0]
    out: list[float | None] = []
    for s_close, h_close in zip(samsung_close, skhynix_close):
        if s0 <= 0 or h0 <= 0 or s_close <= 0 or h_close <= 0:
            out.append(None)
        else:
            out.append(math.log(s_close / s0) - hedge_h * math.log(h_close / h0))
    return out


def latest(values: Sequence[float | None]) -> float | None:
    for value in reversed(values):
        if value is not None:
            return value
    return None


def trailing_min(values: Sequence[float | None], window: int) -> float | None:
    chunk = [v for v in values[-window:] if v is not None]
    return min(chunk) if chunk else None


def trailing_max(values: Sequence[float | None], window: int) -> float | None:
    chunk = [v for v in values[-window:] if v is not None]
    return max(chunk) if chunk else None


def annualized_volatility(log_return_values: Sequence[float | None], window: int) -> float | None:
    stds = rolling_std(log_return_values, window)
    value = latest(stds)
    return value * math.sqrt(252) if value is not None else None


def correlation(xs: Sequence[float | None], ys: Sequence[float | None], window: int) -> float | None:
    pairs = [(x, y) for x, y in zip(xs[-window:], ys[-window:]) if x is not None and y is not None]
    if len(pairs) < window:
        return None
    x_vals = [x for x, _ in pairs]
    y_vals = [y for _, y in pairs]
    x_avg = mean(x_vals)
    y_avg = mean(y_vals)
    cov = sum((x - x_avg) * (y - y_avg) for x, y in pairs)
    x_var = sum((x - x_avg) ** 2 for x in x_vals)
    y_var = sum((y - y_avg) ** 2 for y in y_vals)
    if x_var == 0 or y_var == 0:
        return None
    return cov / math.sqrt(x_var * y_var)


def beta(xs: Sequence[float | None], ys: Sequence[float | None], window: int) -> float | None:
    pairs = [(x, y) for x, y in zip(xs[-window:], ys[-window:]) if x is not None and y is not None]
    if len(pairs) < window:
        return None
    x_vals = [x for x, _ in pairs]
    y_vals = [y for _, y in pairs]
    x_avg = mean(x_vals)
    y_avg = mean(y_vals)
    cov = sum((x - x_avg) * (y - y_avg) for x, y in pairs)
    y_var = sum((y - y_avg) ** 2 for y in y_vals)
    return cov / y_var if y_var else None


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compact_series(values: Iterable[float | None], precision: int = 6) -> list[float | None]:
    out: list[float | None] = []
    for value in values:
        out.append(round(value, precision) if value is not None else None)
    return out
