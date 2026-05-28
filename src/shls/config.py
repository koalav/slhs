from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EquityConfig:
    key: str
    name: str
    code: str
    yahoo_symbol: str
    fallback_shares: int


@dataclass(frozen=True)
class StrategyConfig:
    samsung_contracts_1h: int = 11
    skhynix_contracts_1h: int = 1
    futures_multiplier: int = 10
    model_hedge_h: float = 0.66
    spread_window: int = 60
    spread_ma_window: int = 20
    vol_window: int = 60
    ratio_watch: float = 0.75
    ratio_extreme: float = 0.85
    z_oversold: float = -2.0
    z_reversal: float = -1.5
    samsung_margin_rate: float = 0.291
    skhynix_margin_rate: float = 0.2925


SAMSUNG = EquityConfig(
    key="samsung",
    name="Samsung Electronics",
    code="005930",
    yahoo_symbol="005930.KS",
    fallback_shares=5_846_278_608,
)

SKHYNIX = EquityConfig(
    key="skhynix",
    name="SK Hynix",
    code="000660",
    yahoo_symbol="000660.KS",
    fallback_shares=712_702_365,
)

MACRO_SYMBOLS = {
    "kospi": {"name": "KOSPI", "symbol": "^KS11"},
    "nasdaq": {"name": "NASDAQ Composite", "symbol": "^IXIC"},
    "vix": {"name": "VIX", "symbol": "^VIX"},
    "usdkrw": {"name": "USD/KRW", "symbol": "KRW=X"},
    "soxx": {"name": "SOXX", "symbol": "SOXX"},
}

DEFAULT_CONFIG = StrategyConfig()
