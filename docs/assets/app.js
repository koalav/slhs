const state = {
  priceChart: null,
  spreadChart: null,
};

const fmt = {
  pct(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return `${(value * 100).toFixed(digits)}%`;
  },
  num(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Number(value).toLocaleString("ko-KR", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  },
  krw(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000_000) return `${fmt.num(value / 1_000_000_000_000, 1)}T KRW`;
    if (abs >= 1_000_000_000) return `${fmt.num(value / 1_000_000_000, 1)}B KRW`;
    if (abs >= 1_000_000) return `${fmt.num(value / 1_000_000, 1)}M KRW`;
    if (abs >= 1_000) return `${fmt.num(value / 1_000, 1)}K KRW`;
    return `${Math.round(value).toLocaleString("ko-KR")} KRW`;
  },
  price(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
};

function el(id) {
  return document.getElementById(id);
}

function setClassBySign(node, value) {
  node.classList.toggle("pos", value > 0);
  node.classList.toggle("neg", value < 0);
}

function actionClass(action) {
  if (action === "ENTER_1H" || action === "TEST_1H") return "good";
  if (action === "WAIT_FOR_REVERSAL" || action === "WATCH") return "warn";
  return "bad";
}

function normalize(values) {
  const first = values.find((v) => v !== null && v !== undefined);
  if (!first) return values.map(() => null);
  return values.map((v) => (v === null || v === undefined ? null : (v / first - 1) * 100));
}

async function loadSnapshot() {
  const url = new URL("data/latest.json", window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderSummary(snapshot) {
  const score = snapshot.signals.score;
  const metrics = snapshot.signals.metrics;
  const position = snapshot.signals.position_1h;

  el("scoreValue").textContent = `${score.total}`;
  el("scoreBar").style.width = `${Math.min(100, score.total)}%`;
  el("actionLabel").textContent = score.action_label;
  el("actionLabel").className = `pill ${actionClass(score.action)}`;
  el("mcapRatio").textContent = fmt.pct(metrics.mcap_ratio, 1);
  el("mcapRatioMa").textContent = `20D MA ${fmt.pct(metrics.mcap_ratio_ma20, 1)}`;
  el("spreadZ").textContent = fmt.num(metrics.spread_zscore, 2);
  el("spreadRequired").textContent = score.required.spread_reversal_confirmed
    ? "reversal confirmed"
    : "waiting for reversal";
  el("actualHedge").textContent = fmt.num(position.actual_hedge_h, 3);
  el("grossNotional").textContent = `gross ${fmt.krw(position.gross_notional_krw)}`;

  const components = score.components;
  const labels = {
    value_gap: "Value gap",
    spread_oversold: "Spread oversold",
    spread_reversal: "Spread reversal",
    earnings_revision: "Earnings revision",
    hbm_event: "HBM event",
    hynix_fade: "Hynix fade",
  };
  el("scoreComponents").innerHTML = Object.entries(components)
    .map(([key, value]) => `<dt>${labels[key] || key}</dt><dd>${value}</dd>`)
    .join("");
}

function renderMarket(snapshot) {
  const equities = snapshot.market.equities;
  el("dataSource").textContent = (snapshot.market.source || []).join(", ");
  el("marketRows").innerHTML = ["samsung", "skhynix"]
    .map((key) => {
      const item = equities[key];
      const change = item.change_pct;
      const changeHtml = `<span class="${change >= 0 ? "pos" : "neg"}">${fmt.pct(change)}</span>`;
      return `<tr>
        <td>${item.name}</td>
        <td>${fmt.price(item.price)}</td>
        <td>${changeHtml}</td>
        <td>${fmt.krw(item.market_cap_krw)}</td>
        <td>${fmt.num(item.pbr, 2)}</td>
      </tr>`;
    })
    .join("");
}

function renderRisk(snapshot) {
  const position = snapshot.signals.position_1h;
  el("expiryInfo").textContent = `${position.next_expiry}, DTE ${position.business_days_to_expiry}`;
  el("stressRows").innerHTML = position.stress
    .map((row) => {
      const pnl = row.estimated_1h_pnl_krw;
      return `<tr>
        <td>${fmt.pct(row.weighted_spread_move, 0)}</td>
        <td class="${pnl >= 0 ? "pos" : "neg"}">${fmt.krw(pnl)}</td>
      </tr>`;
    })
    .join("");
}

function renderConsensus(snapshot) {
  const consensus = snapshot.signals.consensus;
  el("consensusDate").textContent = consensus.available ? consensus.latest_date : "not available";
  if (!consensus.available) {
    el("consensusDetails").innerHTML = "<dt>Status</dt><dd>no CSV rows</dd>";
    return;
  }
  const rows = [
    ["Samsung target upside", fmt.pct(consensus.samsung_target_upside)],
    ["SK Hynix target upside", fmt.pct(consensus.skhynix_target_upside)],
    ["Target pair signal", fmt.pct(consensus.target_pair_signal)],
    ["Samsung OP revision", fmt.pct(consensus.samsung_op_2026_revision)],
    ["SK Hynix OP revision", fmt.pct(consensus.skhynix_op_2026_revision)],
    ["Revision diff", fmt.pct(consensus.revision_diff)],
  ];
  el("consensusDetails").innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");
}

function renderEvents(snapshot) {
  const tape = snapshot.signals.hbm_events;
  el("eventScore").textContent = tape.available ? `score ${tape.score}, net ${tape.net_score}` : "not available";
  const rows = tape.events || [];
  el("eventRows").innerHTML = rows.length
    ? rows
        .map((event) => {
          const dir = event.direction > 0 ? "+1" : event.direction < 0 ? "-1" : "0";
          return `<tr>
            <td>${event.date}</td>
            <td>${event.company}</td>
            <td class="${event.direction > 0 ? "pos" : event.direction < 0 ? "neg" : ""}">${dir}</td>
            <td>${event.note}</td>
          </tr>`;
        })
        .join("")
    : "<tr><td colspan=\"4\">No recent events</td></tr>";
}

function renderCharts(snapshot) {
  const series = snapshot.signals.series;
  const labels = series.dates;
  const samsungNorm = normalize(series.samsung_close);
  const hynixNorm = normalize(series.skhynix_close);

  const priceConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Samsung",
          data: samsungNorm,
          borderColor: "#2764c5",
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "SK Hynix",
          data: hynixNorm,
          borderColor: "#c23b31",
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: chartOptions("%"),
  };

  const spreadConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Spread",
          data: series.spread,
          borderColor: "#11845b",
          yAxisID: "y",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Z-score",
          data: series.spread_zscore,
          borderColor: "#b7791f",
          yAxisID: "z",
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...chartOptions(""),
      scales: {
        x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
        y: { position: "left", grid: { color: "#eef2f6" } },
        z: { position: "right", grid: { drawOnChartArea: false } },
      },
    },
  };

  if (state.priceChart) state.priceChart.destroy();
  if (state.spreadChart) state.spreadChart.destroy();
  state.priceChart = new Chart(el("priceChart"), priceConfig);
  state.spreadChart = new Chart(el("spreadChart"), spreadConfig);
}

function chartOptions(suffix) {
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
            const value = ctx.parsed.y;
            return `${ctx.dataset.label}: ${fmt.num(value, 2)}${suffix}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { callback: (value) => `${value}${suffix}` }, grid: { color: "#eef2f6" } },
    },
  };
}

function renderMeta(snapshot) {
  const generated = new Date(snapshot.generated_at);
  el("generatedAt").textContent = generated.toLocaleString("ko-KR");
  el("refreshState").textContent = snapshot.data_warning ? "fixture" : "live snapshot";
  el("refreshState").className = `pill ${snapshot.data_warning ? "warn" : "good"}`;
}

async function refresh() {
  try {
    const snapshot = await loadSnapshot();
    renderMeta(snapshot);
    renderSummary(snapshot);
    renderMarket(snapshot);
    renderRisk(snapshot);
    renderConsensus(snapshot);
    renderEvents(snapshot);
    if (window.Chart) {
      renderCharts(snapshot);
    }
  } catch (error) {
    el("refreshState").textContent = "load failed";
    el("refreshState").className = "pill bad";
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  refresh();
  setInterval(refresh, 60_000);
});
