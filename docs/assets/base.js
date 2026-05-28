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
  b("baseGeneratedAt").textContent = new Date(payload.generated_at).toLocaleString("ko-KR");
  b("periodText").textContent = `${payload.period.start} - ${payload.period.end}`;
  b("observationText").textContent = `${payload.period.observations} trading sessions`;
  b("samsung2y").textContent = baseFmt.pct(latest.samsung_return_2y);
  b("samsungClose").textContent = `close ${baseFmt.price(latest.samsung_close)}`;
  b("skhynix2y").textContent = baseFmt.pct(latest.skhynix_return_2y);
  b("skhynixClose").textContent = `close ${baseFmt.price(latest.skhynix_close)}`;
  b("baseSpreadZ").textContent = baseFmt.num(latest.spread_zscore_60d, 2);
  b("baseBeta").textContent = baseFmt.num(latest.beta_samsung_on_skhynix_60d, 2);
  b("baseCorr").textContent = baseFmt.num(latest.corr_60d, 2);
  b("baseVolHedge").textContent = `vol h ${baseFmt.num(latest.vol_hedge_h_60d, 2)}`;

  b("definitionList").innerHTML = Object.entries(payload.definitions)
    .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
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
          label: "Samsung",
          data: s.samsung_close,
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "s",
        },
        {
          label: "SK Hynix",
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
          label: "Samsung",
          data: s.samsung_normalized_return.map((v) => (v === null ? null : v * 100)),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "SK Hynix",
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
          label: "Spread",
          data: s.spread,
          borderColor: "#11845b",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "spread",
        },
        {
          label: "60D Z-score",
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
          label: "Beta Samsung on SK Hynix",
          data: s.beta_samsung_on_skhynix_60d,
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "Vol hedge h",
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
          label: "Correlation 60D",
          data: s.corr_60d,
          borderColor: "#334155",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "corr",
        },
        {
          label: "Samsung vol 60D",
          data: s.samsung_vol_60d.map((v) => (v === null ? null : v * 100)),
          borderColor: "#2764c5",
          pointRadius: 0,
          borderWidth: 1.8,
          yAxisID: "vol",
        },
        {
          label: "SK Hynix vol 60D",
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
          label: "SK/Samsung market cap",
          data: s.mcap_ratio.map((v) => (v === null ? null : v * 100)),
          borderColor: "#b7791f",
          pointRadius: 0,
          borderWidth: 1.8,
        },
        {
          label: "20D MA",
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
  renderSummary(payload);
  if (window.Chart) renderBaseCharts(payload);
}

window.addEventListener("DOMContentLoaded", () => {
  refreshBase().catch((error) => {
    console.error(error);
    b("baseGeneratedAt").textContent = "load failed";
  });
});
