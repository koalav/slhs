const btState = {
  latest: null,
  base: null,
  chart: null,
};

const btFmt = {
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
  price(value) {
    if (!Number.isFinite(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
  krw(value) {
    if (!Number.isFinite(value)) return "-";
    const abs = Math.abs(value);
    if (abs >= 100_000_000) return `${btFmt.num(value / 100_000_000, 1)}억원`;
    if (abs >= 10_000) return `${btFmt.num(value / 10_000, 1)}만원`;
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  },
};

function bt(id) {
  return document.getElementById(id);
}

function btReadNumber(id) {
  const value = Number(bt(id).value);
  return Number.isFinite(value) ? value : 0;
}

async function btFetch(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function btControls() {
  return {
    strategy: bt("btStrategy").value,
    entryIndex: Number(bt("btEntrySelect").value),
    multiplier: Math.max(1, Math.round(btReadNumber("btMultiplier"))),
    capital: Math.max(1, btReadNumber("btCapital")),
    samsungContracts: Math.max(0, Math.round(btReadNumber("btSamsungContracts"))),
    hynixContractsInput: Math.max(0, Math.round(btReadNumber("btHynixContracts"))),
    h: Math.min(1.4, Math.max(0.2, btReadNumber("btH"))),
    costBps: Math.max(0, btReadNumber("btCostBps")),
  };
}

function btStats(equity, drawdown, capital) {
  const totalReturn = equity[equity.length - 1] / capital - 1;
  const mdd = Math.min(...drawdown);
  const returns = [];
  for (let i = 1; i < equity.length; i += 1) {
    returns.push(equity[i] / equity[i - 1] - 1);
  }
  const avg = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance =
    returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, returns.length - 1);
  return {
    totalReturn,
    mdd,
    annualizedVol: Math.sqrt(variance) * Math.sqrt(252),
  };
}

function btBuildRun(c) {
  const series = btState.base.series;
  const dates = series.dates;
  const samsung = series.samsung_close;
  const hynix = series.skhynix_close;
  const entryIndex = Math.min(Math.max(0, c.entryIndex), dates.length - 1);
  const entrySamsung = samsung[entryIndex];
  const entryHynix = hynix[entryIndex];
  const exitSamsung = samsung[samsung.length - 1];
  const exitHynix = hynix[hynix.length - 1];

  let samsungContracts = c.strategy === "hynix" ? 0 : c.samsungContracts;
  let hynixContracts = c.strategy === "hynix" ? c.hynixContractsInput : 0;
  let samsungSign = c.strategy === "hynix" ? 0 : 1;
  let hynixSign = c.strategy === "hynix" ? 1 : 0;

  if (c.strategy === "pair") {
    samsungSign = 1;
    hynixSign = -1;
    const samsungNotional = samsungContracts * c.multiplier * entrySamsung;
    const contractNotional = c.multiplier * entryHynix;
    hynixContracts = contractNotional > 0 ? Math.max(0, Math.round((samsungNotional * c.h) / contractNotional)) : 0;
  }

  const entrySamsungNotional = samsungContracts * c.multiplier * entrySamsung;
  const entryHynixNotional = hynixContracts * c.multiplier * entryHynix;
  const grossNotional = entrySamsungNotional + entryHynixNotional;
  const entryCost = grossNotional * (c.costBps / 10_000);
  const labels = dates.slice(entryIndex);
  const equity = [];
  const drawdown = [];
  let peak = c.capital;

  for (let i = entryIndex; i < dates.length; i += 1) {
    const samsungPnl = samsungSign * samsungContracts * c.multiplier * (samsung[i] - entrySamsung);
    const hynixPnl = hynixSign * hynixContracts * c.multiplier * (hynix[i] - entryHynix);
    const exitNotional =
      samsungContracts * c.multiplier * samsung[i] + hynixContracts * c.multiplier * hynix[i];
    const exitCost = exitNotional * (c.costBps / 10_000);
    const value = c.capital + samsungPnl + hynixPnl - entryCost - exitCost;
    peak = Math.max(peak, value);
    equity.push(value);
    drawdown.push(value / peak - 1);
  }

  const samsungPnl = samsungSign * samsungContracts * c.multiplier * (exitSamsung - entrySamsung);
  const hynixPnl = hynixSign * hynixContracts * c.multiplier * (exitHynix - entryHynix);
  const exitNotional =
    samsungContracts * c.multiplier * exitSamsung + hynixContracts * c.multiplier * exitHynix;
  const exitCost = exitNotional * (c.costBps / 10_000);
  const roundTripCost = entryCost + exitCost;
  const grossPnl = samsungPnl + hynixPnl;
  const netPnl = grossPnl - roundTripCost;

  return {
    labels,
    equity,
    drawdown,
    entryIndex,
    entryDate: dates[entryIndex],
    exitDate: dates[dates.length - 1],
    entrySamsung,
    entryHynix,
    exitSamsung,
    exitHynix,
    samsungContracts,
    hynixContracts,
    samsungSign,
    hynixSign,
    entrySamsungNotional,
    entryHynixNotional,
    grossNotional,
    entryCost,
    exitCost,
    roundTripCost,
    samsungPnl,
    hynixPnl,
    grossPnl,
    netPnl,
    ...btStats(equity, drawdown, c.capital),
  };
}

function btRenderTop(c, run) {
  bt("btEntryDate").textContent = run.entryDate;
  bt("btExitDate").textContent = `최신 ${run.exitDate}`;
  bt("btNetPnl").textContent = btFmt.krw(run.netPnl);
  bt("btNetPnl").classList.toggle("pos", run.netPnl > 0);
  bt("btNetPnl").classList.toggle("neg", run.netPnl < 0);
  bt("btNetRoi").textContent = `계좌 대비 ${btFmt.pct(run.netPnl / c.capital)}`;
  bt("btGrossNotional").textContent = btFmt.krw(run.grossNotional);
  bt("btCost").textContent = `왕복 비용 ${btFmt.krw(run.roundTripCost)}`;
  bt("btMdd").textContent = btFmt.pct(run.mdd);
  bt("btEndEquity").textContent = `종료 ${btFmt.krw(run.equity[run.equity.length - 1])}`;
  bt("btSamsungPnl").textContent = btFmt.krw(run.samsungPnl);
  bt("btSamsungPnl").classList.toggle("pos", run.samsungPnl > 0);
  bt("btSamsungPnl").classList.toggle("neg", run.samsungPnl < 0);
  bt("btSamsungReturn").textContent = `가격 ${btFmt.pct(run.exitSamsung / run.entrySamsung - 1)}`;
  bt("btHynixPnl").textContent = btFmt.krw(run.hynixPnl);
  bt("btHynixPnl").classList.toggle("pos", run.hynixPnl > 0);
  bt("btHynixPnl").classList.toggle("neg", run.hynixPnl < 0);
  bt("btHynixReturn").textContent = `가격 ${btFmt.pct(run.exitHynix / run.entryHynix - 1)}`;
}

function btStrategyLabel(value) {
  if (value === "samsung") return "삼성전자 단독 롱";
  if (value === "hynix") return "SK하이닉스 단독 롱";
  return "삼성 롱 / SK 숏";
}

function btRenderDetails(c, run) {
  bt("btDetails").innerHTML = [
    ["전략", btStrategyLabel(c.strategy)],
    ["삼성전자 계약 수", `${run.samsungContracts}`],
    ["SK하이닉스 계약 수", `${run.hynixContracts}`],
    ["계약 승수", `${c.multiplier}`],
    ["h", btFmt.num(c.h, 2)],
    ["삼성전자 진입/현재", `${btFmt.price(run.entrySamsung)} / ${btFmt.price(run.exitSamsung)}`],
    ["SK하이닉스 진입/현재", `${btFmt.price(run.entryHynix)} / ${btFmt.price(run.exitHynix)}`],
    ["삼성전자 진입 명목금액", btFmt.krw(run.entrySamsungNotional)],
    ["SK하이닉스 진입 명목금액", btFmt.krw(run.entryHynixNotional)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");

  bt("btMetrics").innerHTML = [
    ["총손익", btFmt.krw(run.grossPnl)],
    ["왕복 비용", btFmt.krw(run.roundTripCost)],
    ["순손익", btFmt.krw(run.netPnl)],
    ["순손익 수익률", btFmt.pct(run.netPnl / c.capital)],
    ["계좌 수익률", btFmt.pct(run.totalReturn)],
    ["최대낙폭", btFmt.pct(run.mdd)],
    ["연율 변동성", btFmt.pct(run.annualizedVol)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");
}

function btRenderChart(c, run) {
  if (!window.Chart) return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  if (btState.chart) btState.chart.destroy();
  btState.chart = new Chart(bt("btEquityChart"), {
    type: "line",
    data: {
      labels: run.labels,
      datasets: [
        {
          label: "계좌 수익률",
          data: run.equity.map((value) => (value / c.capital - 1) * 100),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "ret",
        },
        {
          label: "낙폭",
          data: run.drawdown.map((value) => value * 100),
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.4,
          yAxisID: "dd",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `${ctx.dataset.label}: ${btFmt.num(ctx.parsed.y, 2)}%`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        ret: { position: "left", grid: { color: "#eef2f6" } },
        dd: { position: "right", grid: { drawOnChartArea: false } },
      },
    },
  });
}

function btRecalc() {
  if (!btState.base) return;
  const c = btControls();
  const run = btBuildRun(c);
  btRenderTop(c, run);
  btRenderDetails(c, run);
  btRenderChart(c, run);
}

function btInitControls() {
  const dates = btState.base.series.dates;
  const entryDefault = Math.max(0, dates.length - 61);
  bt("btEntrySelect").innerHTML = dates
    .map((date, index) => `<option value="${index}" ${index === entryDefault ? "selected" : ""}>${date}</option>`)
    .join("");
  bt("btMultiplier").value = Number(btState.latest.signals.position_1h.futures_multiplier || 10);
  bt("btCapital").value = 100_000_000;
  bt("btSamsungContracts").value = Number(btState.latest.signals.position_1h.samsung_contracts || 11);
  bt("btHynixContracts").value = Number(btState.latest.signals.position_1h.skhynix_contracts || 1);
  bt("btH").value = Number(btState.latest.signals.position_1h.actual_hedge_h || 0.66).toFixed(2);
  bt("btCostBps").value = 2.5;
}

async function btInit() {
  const [latest, base] = await Promise.all([btFetch("data/latest.json"), btFetch("data/base.json")]);
  if (document.fonts?.ready) await document.fonts.ready;
  btState.latest = latest;
  btState.base = base;
  bt("btGeneratedAt").textContent = new Date(base.generated_at).toLocaleString("ko-KR");
  bt("btPeriod").textContent = `${base.period.start} - ${base.period.end}, ${base.period.observations} 거래일`;
  btInitControls();
  [
    "btStrategy",
    "btEntrySelect",
    "btMultiplier",
    "btCapital",
    "btSamsungContracts",
    "btHynixContracts",
    "btH",
    "btCostBps",
  ].forEach((id) => bt(id).addEventListener("input", btRecalc));
  bt("btStrategy").addEventListener("change", btRecalc);
  bt("btEntrySelect").addEventListener("change", btRecalc);
  btRecalc();
}

window.addEventListener("DOMContentLoaded", () => {
  btInit().catch((error) => {
    console.error(error);
    bt("btGeneratedAt").textContent = "로드 실패";
  });
});
