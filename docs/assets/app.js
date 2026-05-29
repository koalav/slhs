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
    if (abs >= 1_000_000_000_000) return `${fmt.num(value / 1_000_000_000_000, 1)}조원`;
    if (abs >= 100_000_000) return `${fmt.num(value / 100_000_000, 1)}억원`;
    if (abs >= 10_000) return `${fmt.num(value / 10_000, 1)}만원`;
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  },
  price(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
  count(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
  time(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
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

function actionLabel(action, fallback) {
  const labels = {
    ENTER_1H: "진입",
    TEST_1H: "소규모 테스트",
    WAIT_FOR_REVERSAL: "반전 대기",
    WATCH: "관찰",
    AVOID: "회피",
  };
  return labels[action] || fallback || "-";
}

function normalize(values) {
  const first = values.find((v) => v !== null && v !== undefined);
  if (!first) return values.map(() => null);
  return values.map((v) => (v === null || v === undefined ? null : (v / first - 1) * 100));
}

function applyChartFont() {
  if (window.Chart) Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

async function loadSnapshot() {
  return loadJson("data/latest.json");
}

async function loadResearch() {
  return loadJson("data/research.json");
}

async function loadJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderSummary(snapshot) {
  const score = snapshot.signals.score;
  const metrics = snapshot.signals.metrics;
  const position = snapshot.signals.position_1h;
  const maxScore = score.max || 100;

  el("scoreValue").textContent = `${score.total}/${maxScore}`;
  el("scoreBar").style.width = `${Math.min(100, (score.total / maxScore) * 100)}%`;
  el("actionLabel").textContent = actionLabel(score.action, score.action_label);
  el("actionLabel").className = `pill ${actionClass(score.action)}`;
  el("mcapRatio").textContent = fmt.pct(metrics.mcap_ratio, 1);
  el("mcapRatioMa").textContent = `20일 평균 ${fmt.pct(metrics.mcap_ratio_ma20, 1)}`;
  el("spreadZ").textContent = fmt.num(metrics.spread_zscore, 2);
  el("spreadRequired").textContent = score.required.spread_reversal_confirmed
    ? "반전 확인"
    : "반전 대기";
  el("actualHedge").textContent = fmt.num(position.actual_hedge_h, 3);
  el("grossNotional").textContent = `총 노출 ${fmt.krw(position.gross_notional_krw)}`;
  el("beta60").textContent = fmt.num(metrics.ols_beta60, 3);
  el("betaHint").textContent = `변동성 h ${fmt.num(metrics.vol_hedge_h, 3)}`;
  el("marginEstimate").textContent = fmt.krw(position.margin_estimate_krw);
  el("cashBuffer").textContent = `권장 ${fmt.krw(position.recommended_cash_3x_margin_krw)}`;

  const components = score.components;
  const labels = {
    value_gap: "가치 격차",
    spread_oversold: "스프레드 과매도",
    spread_reversal: "스프레드 반전",
    earnings_revision: "실적 수정",
    hynix_fade: "SK하이닉스 둔화",
  };
  el("scoreComponents").innerHTML = Object.entries(components)
    .map(([key, value]) => `<dt>${labels[key] || key}</dt><dd>${value}</dd>`)
    .join("");
}

function renderStrategy(snapshot) {
  const metrics = snapshot.signals.metrics;
  const position = snapshot.signals.position_1h;
  const score = snapshot.signals.score;
  const consensus = snapshot.signals.consensus;
  el("strategyState").textContent = score.required.spread_reversal_confirmed
    ? "반전 확인"
    : "반전 대기";

  const rows = [
    ["스프레드 / 20일", `${fmt.num(metrics.spread, 3)} / ${fmt.num(metrics.spread_ma20, 3)}`],
    ["Z값 / 10일 저점", `${fmt.num(metrics.spread_zscore, 2)} / ${fmt.num(metrics.spread_zscore_min10, 2)}`],
    ["베타 / 변동성 h", `${fmt.num(metrics.ols_beta60, 3)} / ${fmt.num(metrics.vol_hedge_h, 3)}`],
    ["상관 / SK 거래회전", `${fmt.num(metrics.corr60, 3)} / ${fmt.pct(metrics.skhynix_turnover, 2)}`],
    ["계약", `삼성 ${position.samsung_contracts}L / 하이닉스 ${position.skhynix_contracts}S`],
    ["증거금 / 권장", `${fmt.krw(position.margin_estimate_krw)} / ${fmt.krw(position.recommended_cash_3x_margin_krw)}`],
    ["만기", `${position.next_expiry}, DTE ${position.business_days_to_expiry}`],
    ["목표가 페어 신호", consensus.available ? fmt.pct(consensus.target_pair_signal) : "-"],
  ];

  el("strategyRows").innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
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
      const name = key === "samsung" ? "삼성전자" : "SK하이닉스";
      return `<tr>
        <td>${name}</td>
        <td>${fmt.price(item.price)}</td>
        <td>${changeHtml}</td>
        <td>${fmt.count(item.intraday_volume)}</td>
        <td>${fmt.krw(item.intraday_trading_value_krw)}</td>
        <td>${fmt.krw(item.market_cap_krw)}</td>
        <td>${fmt.num(item.pbr, 2)}</td>
        <td>${fmt.time(item.updated_at)}</td>
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
  el("consensusDate").textContent = consensus.available
    ? `스냅샷 ${consensus.latest_date}, 기준 ${consensus.reference_date || "-"}`
    : "데이터 없음";
  if (!consensus.available) {
    el("consensusRows").innerHTML = "<tr><td colspan=\"4\">CSV 데이터가 없습니다.</td></tr>";
    return;
  }
  const rows = [
    [
      "목표가",
      fmt.price(consensus.samsung_target_price),
      fmt.price(consensus.skhynix_target_price),
      "현재가 대비 업사이드 비교",
    ],
    [
      "목표가 업사이드",
      fmt.pct(consensus.samsung_target_upside),
      fmt.pct(consensus.skhynix_target_upside),
      fmt.pct(consensus.target_pair_signal),
    ],
    [
      "2026 영업이익 수정률",
      fmt.pct(consensus.samsung_op_2026_revision),
      fmt.pct(consensus.skhynix_op_2026_revision),
      fmt.pct(consensus.revision_diff),
    ],
    ["메모", consensus.raw_note || "-", "-", "수동/시드 데이터"],
  ];
  el("consensusRows").innerHTML = rows
    .map(
      ([label, samsung, hynix, diff]) => `<tr>
        <td>${label}</td>
        <td>${samsung}</td>
        <td>${hynix}</td>
        <td>${diff}</td>
      </tr>`,
    )
    .join("");
}

function renderResearchBrief(payload) {
  if (!payload) {
    el("researchBrief").innerHTML = "<dt>상태</dt><dd>로드 실패</dd>";
    return;
  }
  const coverage = Object.fromEntries(payload.coverage.map((item) => [item.key, item]));
  const latestArticle = [...(payload.major_articles || [])].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  )[0];
  const latestEarnings = [...(payload.earnings_trend || [])].reverse()[0];
  const rows = [
    ["예상 목표가", `${coverage.expected_target_price?.rows || 0}건`],
    ["실적 추이", `${coverage.earnings_trend?.rows || 0}건`],
    ["주요 기사", `${coverage.major_articles?.rows || 0}건`],
    ["글로벌 요소", `${coverage.global_memory_factors?.rows || 0}건`],
    ["최근 기사", latestArticle ? `${latestArticle.date} ${latestArticle.publisher}` : "-"],
    ["최근 실적", latestEarnings ? `${latestEarnings.period} ${latestEarnings.company}` : "-"],
  ];
  el("researchBrief").innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");
}

function renderCharts(snapshot) {
  applyChartFont();
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
          label: "삼성전자",
          data: samsungNorm,
          borderColor: "#2764c5",
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "SK하이닉스",
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
          label: "스프레드",
          data: series.spread,
          borderColor: "#11845b",
          yAxisID: "y",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: "Z값",
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
  el("refreshState").textContent = snapshot.data_warning ? "샘플" : "스냅샷";
  el("refreshState").className = `pill ${snapshot.data_warning ? "warn" : "good"}`;
}

async function refresh() {
  try {
    const [snapshot, research] = await Promise.all([
      loadSnapshot(),
      loadResearch().catch(() => null),
    ]);
    if (document.fonts?.ready) await document.fonts.ready;
    renderMeta(snapshot);
    renderSummary(snapshot);
    renderStrategy(snapshot);
    renderMarket(snapshot);
    renderRisk(snapshot);
    renderConsensus(snapshot);
    renderResearchBrief(research);
    if (window.Chart) {
      renderCharts(snapshot);
    }
  } catch (error) {
    el("refreshState").textContent = "로드 실패";
    el("refreshState").className = "pill bad";
    console.error(error);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  refresh();
  setInterval(refresh, 60_000);
});
