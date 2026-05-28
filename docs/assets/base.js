const baseCharts = [];

const baseFmt = {
  pct(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return `${(value * 100).toFixed(digits)}%`;
  },
  num(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Number(value).toLocaleString("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  price(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
};

function b(id) {
  return document.getElementById(id);
}

async function loadBase() {
  const url = new URL("data/base.json", window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function destroyCharts() {
  while (baseCharts.length) {
    baseCharts.pop().destroy();
  }
}

function lineChart(canvasId, config) {
  if (window.Chart) Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const chart = new Chart(b(canvasId), config);
  baseCharts.push(chart);
}

function commonOptions(unit = "") {
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
            return `${ctx.dataset.label}: ${baseFmt.num(ctx.parsed.y, 2)}${unit}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
      y: { grid: { color: "#eef2f6" } },
    },
  };
}

function renderSummary(payload) {
  const latest = payload.latest;
  const definitionLabels = {
    beta_samsung_on_skhynix: "삼성전자 on SK하이닉스 베타",
    hedge_h: "헤지 h",
    spread: "스프레드",
    vol_hedge_h: "변동성 hedge h",
  };
  const definitionValues = {
    "60D rolling beta from regressing Samsung daily log return on SK Hynix daily log return":
      "삼성전자 일간 로그수익률을 SK하이닉스 일간 로그수익률에 대해 60일 rolling 회귀한 베타",
    "log(Samsung/Samsung_0) - h * log(SK Hynix/SK Hynix_0)":
      "log(삼성전자/시작가) - h * log(SK하이닉스/시작가)",
    "Samsung 60D annualized volatility / SK Hynix 60D annualized volatility":
      "삼성전자 60일 연율화 변동성 / SK하이닉스 60일 연율화 변동성",
  };
  b("baseGeneratedAt").textContent = new Date(payload.generated_at).toLocaleString("ko-KR");
  b("periodText").textContent = `${payload.period.start} - ${payload.period.end}`;
  b("observationText").textContent = `${payload.period.observations} 거래일`;
  b("samsung2y").textContent = baseFmt.pct(latest.samsung_return_2y);
  b("samsungClose").textContent = `종가 ${baseFmt.price(latest.samsung_close)}`;
  b("skhynix2y").textContent = baseFmt.pct(latest.skhynix_return_2y);
  b("skhynixClose").textContent = `종가 ${baseFmt.price(latest.skhynix_close)}`;
  b("baseSpreadZ").textContent = baseFmt.num(latest.spread_zscore_60d, 2);
  b("baseBeta").textContent = baseFmt.num(latest.beta_samsung_on_skhynix_60d, 2);
  b("baseCorr").textContent = baseFmt.num(latest.corr_60d, 2);
  b("baseVolHedge").textContent = `변동성 h ${baseFmt.num(latest.vol_hedge_h_60d, 2)}`;

  b("definitionList").innerHTML = Object.entries(payload.definitions)
    .map(([key, value]) => `<dt>${definitionLabels[key] || key}</dt><dd>${definitionValues[value] || value}</dd>`)
    .join("");
}

function renderBaseCharts(payload) {
  destroyCharts();
  const s = payload.series;
  const labels = s.dates;

  lineChart("rawPriceChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "삼성전자",
          data: s.samsung_close,
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "s",
        },
        {
          label: "SK하이닉스",
          data: s.skhynix_close,
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "h",
        },
      ],
    },
    options: {
      ...commonOptions(" KRW"),
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        s: { position: "left", grid: { color: "#eef2f6" } },
        h: { position: "right", grid: { drawOnChartArea: false } },
      },
    },
  });

  lineChart("normalizedChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "삼성전자",
          data: s.samsung_normalized_return.map((v) => (v === null ? null : v * 100)),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "SK하이닉스",
          data: s.skhynix_normalized_return.map((v) => (v === null ? null : v * 100)),
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.8,
        },
      ],
    },
    options: commonOptions("%"),
  });

  lineChart("baseSpreadChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "스프레드",
          data: s.spread,
          borderColor: "#11845b",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "spread",
        },
        {
          label: "60일 Z값",
          data: s.spread_zscore_60d,
          borderColor: "#b7791f",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "z",
        },
      ],
    },
    options: {
      ...commonOptions(""),
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        spread: { position: "left", grid: { color: "#eef2f6" } },
        z: { position: "right", grid: { drawOnChartArea: false } },
      },
    },
  });

  lineChart("betaChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "삼성전자 on SK하이닉스 베타",
          data: s.beta_samsung_on_skhynix_60d,
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "변동성 hedge h",
          data: s.vol_hedge_h_60d,
          borderColor: "#11845b",
          pointRadius: 0,
          borderWidth: 1.8,
        },
      ],
    },
    options: commonOptions(""),
  });

  lineChart("riskChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "60일 상관",
          data: s.corr_60d,
          borderColor: "#334155",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "corr",
        },
        {
          label: "삼성전자 60일 변동성",
          data: s.samsung_vol_60d.map((v) => (v === null ? null : v * 100)),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "vol",
        },
        {
          label: "SK하이닉스 60일 변동성",
          data: s.skhynix_vol_60d.map((v) => (v === null ? null : v * 100)),
          borderColor: "#c23b31",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "vol",
        },
      ],
    },
    options: {
      ...commonOptions(""),
      scales: {
        x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
        corr: { position: "left", min: -1, max: 1, grid: { color: "#eef2f6" } },
        vol: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { callback: (value) => `${value}%` },
        },
      },
    },
  });

  lineChart("mcapChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "SK/삼성 시총",
          data: s.mcap_ratio.map((v) => (v === null ? null : v * 100)),
          borderColor: "#b7791f",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "20일 평균",
          data: s.mcap_ratio_ma20.map((v) => (v === null ? null : v * 100)),
          borderColor: "#334155",
          pointRadius: 0,
          borderWidth: 1.4,
          borderDash: [6, 4],
        },
      ],
    },
    options: commonOptions("%"),
  });
}

async function refreshBase() {
  const payload = await loadBase();
  if (document.fonts?.ready) await document.fonts.ready;
  renderSummary(payload);
  if (window.Chart) renderBaseCharts(payload);
}

window.addEventListener("DOMContentLoaded", () => {
  refreshBase().catch((error) => {
    console.error(error);
    b("baseGeneratedAt").textContent = "로드 실패";
  });
});
