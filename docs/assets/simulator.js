const simCharts = {
  backtest: null,
  sensitivity: null,
};

const sim = {
  latest: null,
  base: null,
};

const simFmt = {
  pct(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(digits)}%`;
  },
  num(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return Number(value).toLocaleString("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  krw(value) {
    if (!Number.isFinite(value)) return "-";
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${simFmt.num(value / 1_000_000_000, 1)}B KRW`;
    if (abs >= 1_000_000) return `${simFmt.num(value / 1_000_000, 1)}M KRW`;
    if (abs >= 1_000) return `${simFmt.num(value / 1_000, 1)}K KRW`;
    return `${Math.round(value).toLocaleString("ko-KR")} KRW`;
  },
  price(value) {
    if (!Number.isFinite(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
};

function s(id) {
  return document.getElementById(id);
}

function readNumber(id) {
  const value = Number(s(id).value);
  return Number.isFinite(value) ? value : 0;
}

function clampH(value, fallback = 0.66) {
  const number = Number(value);
  const resolved = Number.isFinite(number) && number > 0 ? number : fallback;
  return Math.min(1.4, Math.max(0.2, resolved));
}

function lastFinite(values) {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = Number(values[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function currentPrices() {
  const market = sim.latest.market.equities;
  return {
    samsung: Number(market.samsung.price || sim.base.latest.samsung_close),
    hynix: Number(market.skhynix.price || sim.base.latest.skhynix_close),
    samsungChange: Number(market.samsung.change_pct || 0),
    hynixChange: Number(market.skhynix.change_pct || 0),
  };
}

function hReferenceValues() {
  const signal = Number(sim.latest.signals.position_1h.actual_hedge_h || 0.66);
  return {
    signal: clampH(signal),
    beta: clampH(lastFinite(sim.base.series.beta_samsung_on_skhynix_60d), signal),
    reverseBeta: lastFinite(sim.base.series.beta_skhynix_on_samsung_60d),
    vol: clampH(lastFinite(sim.base.series.vol_hedge_h_60d), signal),
  };
}

function selectedHFromMode() {
  const refs = hReferenceValues();
  const mode = s("hMode").value;
  if (mode === "beta") return refs.beta;
  if (mode === "vol") return refs.vol;
  if (mode === "signal") return refs.signal;
  return readNumber("hInput");
}

function setHValue(value) {
  const h = clampH(value);
  s("hRange").value = h.toFixed(2);
  s("hInput").value = h.toFixed(2);
}

function defaultControls() {
  const prices = currentPrices();
  const position = sim.latest.signals.position_1h;
  const h = Number(position.actual_hedge_h || 0.66);
  const miniMultiplier = 1;
  const standardSamsungContracts = Number(position.samsung_contracts || 11);

  s("hMode").value = "signal";
  s("productPreset").value = String(miniMultiplier);
  s("contractMultiplier").value = miniMultiplier;
  setHValue(h);
  s("samsungContracts").value = standardSamsungContracts * 10;
  s("accountCapital").value = 100_000_000;
  s("samsungExpected").value = Math.round(prices.samsung);
  s("hynixExpected").value = Math.round(prices.hynix);
  s("bufferMultiple").value = 3;
  s("samsungMarginRate").value = 0.291;
  s("hynixMarginRate").value = 0.2925;
  s("feeBps").value = 0.5;
  s("slippageBps").value = 2;
}

function syncH(fromRange) {
  s("hMode").value = "manual";
  if (fromRange) s("hInput").value = s("hRange").value;
  else s("hRange").value = s("hInput").value;
  recalc();
}

function controls() {
  if (s("hMode").value !== "manual") setHValue(selectedHFromMode());
  return {
    h: readNumber("hInput"),
    hMode: s("hMode").value,
    multiplier: Math.max(1, Math.round(readNumber("contractMultiplier"))),
    samsungContracts: Math.max(0, Math.round(readNumber("samsungContracts"))),
    capital: readNumber("accountCapital"),
    samsungExpected: readNumber("samsungExpected"),
    hynixExpected: readNumber("hynixExpected"),
    bufferMultiple: readNumber("bufferMultiple"),
    samsungMarginRate: readNumber("samsungMarginRate"),
    hynixMarginRate: readNumber("hynixMarginRate"),
    feeBps: readNumber("feeBps"),
    slippageBps: readNumber("slippageBps"),
  };
}

function buildPosition(c, overrideH = c.h) {
  const prices = currentPrices();
  const samsungExposure = c.samsungContracts * c.multiplier * prices.samsung;
  const targetHynixExposure = samsungExposure * overrideH;
  const hynixContracts =
    prices.hynix > 0 ? Math.max(0, Math.round(targetHynixExposure / (c.multiplier * prices.hynix))) : 0;
  const hynixExposure = hynixContracts * c.multiplier * prices.hynix;
  const actualH = samsungExposure > 0 ? hynixExposure / samsungExposure : 0;
  const grossNotional = samsungExposure + hynixExposure;
  return {
    samsungExposure,
    targetHynixExposure,
    hynixContracts,
    hynixExposure,
    actualH,
    grossNotional,
  };
}

function tradeCost(notional, c) {
  return notional * ((c.feeBps + c.slippageBps) / 10_000);
}

function performanceStats(equity, drawdown, capital) {
  const totalReturn = equity[equity.length - 1] / capital - 1;
  const mdd = Math.min(...drawdown);
  const dailyReturns = [];
  for (let i = 1; i < equity.length; i += 1) {
    dailyReturns.push(equity[i] / equity[i - 1] - 1);
  }
  const avg = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturns.length);
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    Math.max(1, dailyReturns.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  return { totalReturn, mdd, vol };
}

function historicalHynixContracts(c, index, h) {
  const samsung = sim.base.series.samsung_close;
  const hynix = sim.base.series.skhynix_close;
  const samsungExposure = c.samsungContracts * c.multiplier * samsung[index];
  const contractNotional = c.multiplier * hynix[index];
  if (contractNotional <= 0) return 0;
  return Math.max(0, Math.round((samsungExposure * h) / contractNotional));
}

function computeBacktest(c, overrideH = c.h) {
  const position = buildPosition(c, overrideH);
  const dates = sim.base.series.dates;
  const samsung = sim.base.series.samsung_close;
  const hynix = sim.base.series.skhynix_close;
  const equity = [c.capital];
  const drawdown = [0];
  let peak = c.capital;

  for (let i = 1; i < dates.length; i += 1) {
    const samsungPnl = c.samsungContracts * c.multiplier * (samsung[i] - samsung[i - 1]);
    const hynixPnl = -position.hynixContracts * c.multiplier * (hynix[i] - hynix[i - 1]);
    const next = equity[equity.length - 1] + samsungPnl + hynixPnl;
    peak = Math.max(peak, next);
    equity.push(next);
    drawdown.push(next / peak - 1);
  }

  const { totalReturn, mdd, vol } = performanceStats(equity, drawdown, c.capital);

  return { dates, equity, drawdown, totalReturn, mdd, vol, position };
}

function computeRollingBetaBacktest(c) {
  const dates = sim.base.series.dates;
  const samsung = sim.base.series.samsung_close;
  const hynix = sim.base.series.skhynix_close;
  const beta = sim.base.series.beta_samsung_on_skhynix_60d || [];
  const equity = [c.capital];
  const drawdown = [0];
  const hUsed = [clampH(beta[0], c.h)];
  const hynixContracts = [historicalHynixContracts(c, 0, hUsed[0])];
  let peak = c.capital;
  let totalRebalanceCost = 0;

  for (let i = 1; i < dates.length; i += 1) {
    const h = clampH(beta[i - 1], c.h);
    const contracts = historicalHynixContracts(c, i - 1, h);
    const previousContracts = hynixContracts[hynixContracts.length - 1];
    const rebalanceNotional = Math.abs(contracts - previousContracts) * c.multiplier * hynix[i - 1];
    const rebalanceCost = tradeCost(rebalanceNotional, c);
    const samsungPnl = c.samsungContracts * c.multiplier * (samsung[i] - samsung[i - 1]);
    const hynixPnl = -contracts * c.multiplier * (hynix[i] - hynix[i - 1]);
    const next = equity[equity.length - 1] + samsungPnl + hynixPnl - rebalanceCost;
    peak = Math.max(peak, next);
    equity.push(next);
    drawdown.push(next / peak - 1);
    hUsed.push(h);
    hynixContracts.push(contracts);
    totalRebalanceCost += rebalanceCost;
  }

  const { totalReturn, mdd, vol } = performanceStats(equity, drawdown, c.capital);
  const latestH = clampH(lastFinite(beta), c.h);
  const latestPosition = buildPosition(c, latestH);
  return {
    dates,
    equity,
    drawdown,
    hUsed,
    hynixContracts,
    totalReturn,
    mdd,
    vol,
    latestH,
    latestPosition,
    totalRebalanceCost,
  };
}

function computeForward(c, position) {
  const prices = currentPrices();
  const samsungReturn = c.samsungExpected / prices.samsung - 1;
  const hynixReturn = c.hynixExpected / prices.hynix - 1;
  const samsungPnl = c.samsungContracts * c.multiplier * (c.samsungExpected - prices.samsung);
  const hynixPnl = -position.hynixContracts * c.multiplier * (c.hynixExpected - prices.hynix);
  const grossPnl = samsungPnl + hynixPnl;
  const expectedExitNotional =
    c.samsungContracts * c.multiplier * c.samsungExpected +
    position.hynixContracts * c.multiplier * c.hynixExpected;
  const entryCost = tradeCost(position.grossNotional, c);
  const exitCost = tradeCost(expectedExitNotional, c);
  const roundTripCost = entryCost + exitCost;
  const netPnl = grossPnl - roundTripCost;
  return {
    samsungReturn,
    hynixReturn,
    samsungPnl,
    hynixPnl,
    grossPnl,
    expectedExitNotional,
    entryCost,
    exitCost,
    roundTripCost,
    netPnl,
  };
}

function computeMargin(c, position) {
  const required =
    position.samsungExposure * c.samsungMarginRate + position.hynixExposure * c.hynixMarginRate;
  const recommended = required * c.bufferMultiple + tradeCost(position.grossNotional, c);
  return { required, recommended };
}

function renderTop(c, position, forward, margin) {
  const prices = currentPrices();
  s("simSamsungNow").textContent = simFmt.price(prices.samsung);
  s("simSamsungMove").textContent = simFmt.pct(prices.samsungChange);
  s("simHynixNow").textContent = simFmt.price(prices.hynix);
  s("simHynixMove").textContent = simFmt.pct(prices.hynixChange);
  s("simHValue").textContent = `${simFmt.num(c.h, 2)} / ${simFmt.num(position.actualH, 3)}`;
  s("expectedPnl").textContent = simFmt.krw(forward.netPnl);
  s("expectedPnl").classList.toggle("pos", forward.netPnl > 0);
  s("expectedPnl").classList.toggle("neg", forward.netPnl < 0);
  s("expectedRoi").textContent = `${simFmt.pct(forward.netPnl / c.capital)} of account, net`;
  s("requiredMargin").textContent = simFmt.krw(margin.required);
  s("recommendedMargin").textContent = simFmt.krw(margin.recommended);
  s("marginRateText").textContent = `${simFmt.pct(margin.required / c.capital)} of account`;
  s("marginBufferText").textContent = `${simFmt.num(c.bufferMultiple, 2)}x + entry cost`;
}

function renderDetails(c, position, forward, margin, bt, rollingBt) {
  s("positionDetails").innerHTML = [
    ["Contract multiplier", `${c.multiplier}`],
    ["Samsung contracts", `${c.samsungContracts}`],
    ["SK Hynix contracts", `${position.hynixContracts}`],
    ["h source", c.hMode],
    ["Target h / actual h", `${simFmt.num(c.h, 3)} / ${simFmt.num(position.actualH, 3)}`],
    ["h rounding error", simFmt.pct(position.actualH - c.h)],
    ["Samsung long notional", simFmt.krw(position.samsungExposure)],
    ["SK Hynix short notional", simFmt.krw(position.hynixExposure)],
    ["Gross notional", simFmt.krw(position.grossNotional)],
    ["Required margin", simFmt.krw(margin.required)],
    ["Entry cost estimate", simFmt.krw(forward.entryCost)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");

  s("forecastDetails").innerHTML = [
    ["Samsung expected return", simFmt.pct(forward.samsungReturn)],
    ["SK Hynix expected return", simFmt.pct(forward.hynixReturn)],
    ["Samsung leg PnL", simFmt.krw(forward.samsungPnl)],
    ["SK Hynix leg PnL", simFmt.krw(forward.hynixPnl)],
    ["Gross PnL", simFmt.krw(forward.grossPnl)],
    ["Entry cost", simFmt.krw(forward.entryCost)],
    ["Exit cost", simFmt.krw(forward.exitCost)],
    ["Round-trip cost", simFmt.krw(forward.roundTripCost)],
    ["Net PnL", simFmt.krw(forward.netPnl)],
    ["Net account ROI", simFmt.pct(forward.netPnl / c.capital)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");

  s("backtestMetrics").innerHTML = [
    ["Fixed h return", simFmt.pct(bt.totalReturn)],
    ["Fixed h max drawdown", simFmt.pct(bt.mdd)],
    ["Fixed h annualized vol", simFmt.pct(bt.vol)],
    ["Rolling beta return", simFmt.pct(rollingBt.totalReturn)],
    ["Rolling beta max drawdown", simFmt.pct(rollingBt.mdd)],
    ["Rolling beta annualized vol", simFmt.pct(rollingBt.vol)],
    ["Start equity", simFmt.krw(c.capital)],
    ["End equity", simFmt.krw(bt.equity[bt.equity.length - 1])],
    ["Gross notional / account", simFmt.pct(position.grossNotional / c.capital)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");
}

function renderRollingBetaDetails(c, rollingBt) {
  const refs = hReferenceValues();
  s("rollingBetaDetails").innerHTML = [
    ["Signal h", simFmt.num(refs.signal, 3)],
    ["60D Samsung-on-Hynix beta", simFmt.num(refs.beta, 3)],
    ["60D SK-on-Samsung beta", simFmt.num(refs.reverseBeta, 3)],
    ["60D volatility h", simFmt.num(refs.vol, 3)],
    ["Selected h", `${c.hMode} / ${simFmt.num(c.h, 3)}`],
    ["Rolling beta SK contracts", `${rollingBt.latestPosition.hynixContracts}`],
    ["Rolling beta actual h", simFmt.num(rollingBt.latestPosition.actualH, 3)],
    ["2Y rebalance cost", simFmt.krw(rollingBt.totalRebalanceCost)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");
}

function renderCharts(c, bt, rollingBt) {
  if (simCharts.backtest) simCharts.backtest.destroy();
  if (simCharts.sensitivity) simCharts.sensitivity.destroy();

  simCharts.backtest = new Chart(s("backtestChart"), {
    type: "line",
    data: {
      labels: bt.dates,
      datasets: [
        {
          label: "Equity",
          data: bt.equity.map((value) => (value / c.capital - 1) * 100),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "ret",
        },
        {
          label: "Rolling beta equity",
          data: rollingBt.equity.map((value) => (value / c.capital - 1) * 100),
          borderColor: "#11845b",
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: "ret",
        },
        {
          label: "Drawdown",
          data: bt.drawdown.map((value) => value * 100),
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.4,
          yAxisID: "dd",
        },
      ],
    },
    options: simChartOptions("%", {
      ret: { position: "left", grid: { color: "#eef2f6" } },
      dd: { position: "right", grid: { drawOnChartArea: false } },
    }),
  });

  const hValues = [];
  const returns = [];
  const drawdowns = [];
  for (let h = 0.2; h <= 1.4001; h += 0.05) {
    const run = computeBacktest(c, h);
    hValues.push(h.toFixed(2));
    returns.push(run.totalReturn * 100);
    drawdowns.push(run.mdd * 100);
  }
  simCharts.sensitivity = new Chart(s("sensitivityChart"), {
    type: "line",
    data: {
      labels: hValues,
      datasets: [
        {
          label: "Final return",
          data: returns,
          borderColor: "#11845b",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "Max drawdown",
          data: drawdowns,
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.8,
        },
      ],
    },
    options: simChartOptions("%"),
  });
}

function simChartOptions(unit, customScales = null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { boxWidth: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label(ctx) {
            return `${ctx.dataset.label}: ${simFmt.num(ctx.parsed.y, 2)}${unit}`;
          },
        },
      },
    },
    scales: customScales
      ? {
          x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
          ...customScales,
        }
      : {
          x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
          y: {
            ticks: { callback: (value) => `${value}${unit}` },
            grid: { color: "#eef2f6" },
          },
        },
  };
}

function renderScenario(c, position) {
  const rows = [-0.2, -0.1, 0, 0.1, 0.2];
  const cols = [-0.2, -0.1, 0, 0.1, 0.2];
  s("scenarioHead").innerHTML = `<tr><th>S \\ H</th>${cols
    .map((col) => `<th>${simFmt.pct(col, 0)}</th>`)
    .join("")}</tr>`;
  s("scenarioBody").innerHTML = rows
    .map((row) => {
      const cells = cols
        .map((col) => {
          const pnl = position.samsungExposure * row - position.hynixExposure * col;
          const roi = pnl / c.capital;
          const cls = roi > 0 ? "pos" : roi < 0 ? "neg" : "";
          return `<td class="${cls}">${simFmt.krw(pnl)}<br><span class="muted">${simFmt.pct(roi, 1)}</span></td>`;
        })
        .join("");
      return `<tr><th>${simFmt.pct(row, 0)}</th>${cells}</tr>`;
    })
    .join("");
}

function renderHStrategyRows(c) {
  const rows = [];
  for (let h = 0.2; h <= 1.4001; h += 0.1) {
    const p = buildPosition(c, h);
    const required = p.samsungExposure * c.samsungMarginRate + p.hynixExposure * c.hynixMarginRate;
    const cost = tradeCost(p.grossNotional, c) * 2;
    rows.push(
      `<tr>
        <td>${simFmt.num(h, 2)}</td>
        <td>${c.samsungContracts}</td>
        <td>${p.hynixContracts}</td>
        <td>${simFmt.num(p.actualH, 3)}</td>
        <td>${simFmt.krw(p.grossNotional)}</td>
        <td>${simFmt.krw(required)}</td>
        <td>${simFmt.krw(cost)}</td>
      </tr>`,
    );
  }
  s("hStrategyRows").innerHTML = rows.join("");
}

function recalc() {
  if (!sim.latest || !sim.base) return;
  const c = controls();
  const position = buildPosition(c);
  const forward = computeForward(c, position);
  const margin = computeMargin(c, position);
  const bt = computeBacktest(c);
  const rollingBt = computeRollingBetaBacktest(c);
  renderTop(c, position, forward, margin);
  renderDetails(c, position, forward, margin, bt, rollingBt);
  renderRollingBetaDetails(c, rollingBt);
  if (window.Chart) renderCharts(c, bt, rollingBt);
  renderScenario(c, position);
  renderHStrategyRows(c);
}

async function initSimulator() {
  const [latest, base] = await Promise.all([fetchJson("data/latest.json"), fetchJson("data/base.json")]);
  sim.latest = latest;
  sim.base = base;
  s("simGeneratedAt").textContent = new Date(latest.generated_at).toLocaleString("ko-KR");
  s("simPeriod").textContent = `${base.period.start} - ${base.period.end}, ${base.period.observations} sessions`;
  defaultControls();
  s("hRange").addEventListener("input", () => syncH(true));
  s("hInput").addEventListener("input", () => syncH(false));
  s("hMode").addEventListener("change", () => recalc());
  s("productPreset").addEventListener("change", () => {
    s("contractMultiplier").value = s("productPreset").value;
    recalc();
  });
  [
    "contractMultiplier",
    "samsungContracts",
    "accountCapital",
    "samsungExpected",
    "hynixExpected",
    "bufferMultiple",
    "samsungMarginRate",
    "hynixMarginRate",
    "feeBps",
    "slippageBps",
  ].forEach((id) => s(id).addEventListener("input", recalc));
  recalc();
}

window.addEventListener("DOMContentLoaded", () => {
  initSimulator().catch((error) => {
    console.error(error);
    s("simGeneratedAt").textContent = "load failed";
  });
});
