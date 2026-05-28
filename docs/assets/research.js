const researchCharts = {};

const rf = {
  pct(value, digits = 1) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(digits)}%`;
  },
  num(value, digits = 1) {
    if (!Number.isFinite(value)) return "-";
    return Number(value).toLocaleString("ko-KR", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  },
  krw(value) {
    if (!Number.isFinite(value)) return "-";
    return Math.round(value).toLocaleString("ko-KR");
  },
};

function r(id) {
  return document.getElementById(id);
}

async function loadResearch() {
  const url = new URL("data/research.json", window.location.href);
  url.searchParams.set("t", Date.now().toString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function directionClass(value) {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "";
}

function renderCoverage(payload) {
  r("coverageGrid").innerHTML = payload.coverage
    .map(
      (item) => `<article class="metric-card">
        <span>${item.label}</span>
        <strong>${item.available ? "OK" : "Missing"}</strong>
        <small>${item.rows} rows</small>
      </article>`,
    )
    .join("");
}

function renderTables(payload) {
  r("targetRows").innerHTML = payload.target_prices
    .map(
      (row) => `<tr>
        <td>${row.date}</td>
        <td>${row.company}</td>
        <td><a href="${row.source_url}" target="_blank" rel="noreferrer">${row.source}</a></td>
        <td>${rf.krw(row.target_price_krw)}</td>
        <td class="${directionClass(row.upside_pct)}">${rf.pct(row.upside_pct)}</td>
      </tr>`,
    )
    .join("");

  r("earningsRows").innerHTML = payload.earnings_trend
    .map(
      (row) => `<tr>
        <td>${row.period}</td>
        <td>${row.period_type}</td>
        <td>${row.company}</td>
        <td>${rf.num(row.revenue_krw_t)}</td>
        <td>${rf.num(row.operating_profit_krw_t)}</td>
        <td>${Number.isFinite(row.op_margin_pct) ? `${rf.num(row.op_margin_pct)}%` : "-"}</td>
      </tr>`,
    )
    .join("");

  r("articleRows").innerHTML = payload.major_articles
    .map(
      (row) => `<article class="article-item">
        <div class="article-meta">
          <span>${row.date}</span>
          <span>${row.publisher}</span>
          <span class="${directionClass(row.direction)}">dir ${row.direction}</span>
        </div>
        <h3><a href="${row.source_url}" target="_blank" rel="noreferrer">${row.title}</a></h3>
        <p>${row.summary}</p>
      </article>`,
    )
    .join("");

  r("globalRows").innerHTML = payload.global_factors
    .map(
      (row) => `<tr>
        <td>${row.date}</td>
        <td>${row.category}</td>
        <td>${row.company}</td>
        <td>${row.metric}</td>
        <td>${row.value}${row.unit && row.unit !== "text" ? row.unit : ""}</td>
        <td class="${directionClass(row.direction)}">${row.direction}</td>
      </tr>`,
    )
    .join("");
}

function renderCharts(payload) {
  if (researchCharts.target) researchCharts.target.destroy();
  if (researchCharts.earnings) researchCharts.earnings.destroy();

  const targetRows = payload.target_prices.filter((row) => Number.isFinite(row.upside_pct));
  researchCharts.target = new Chart(r("targetChart"), {
    type: "bar",
    data: {
      labels: targetRows.map((row) => `${row.company.replace(" Electronics", "")} / ${row.source.split(" ")[0]}`),
      datasets: [
        {
          label: "Upside",
          data: targetRows.map((row) => row.upside_pct * 100),
          backgroundColor: targetRows.map((row) => (row.upside_pct >= 0 ? "#bde6d2" : "#f0c6c1")),
          borderColor: targetRows.map((row) => (row.upside_pct >= 0 ? "#11845b" : "#c23b31")),
          borderWidth: 1,
        },
      ],
    },
    options: chartOptions("%"),
  });

  const earnings = payload.earnings_trend.filter((row) => Number.isFinite(row.operating_profit_krw_t));
  researchCharts.earnings = new Chart(r("earningsChart"), {
    type: "bar",
    data: {
      labels: earnings.map((row) => `${row.period} ${row.company.replace(" Electronics", "")}`),
      datasets: [
        {
          label: "Operating profit",
          data: earnings.map((row) => row.operating_profit_krw_t),
          backgroundColor: earnings.map((row) =>
            row.company.includes("Samsung") ? "#cfe0ff" : "#f8d7d4",
          ),
          borderColor: earnings.map((row) =>
            row.company.includes("Samsung") ? "#2764c5" : "#c23b31",
          ),
          borderWidth: 1,
        },
      ],
    },
    options: chartOptions("T"),
  });
}

function chartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(ctx) {
            return `${ctx.dataset.label}: ${rf.num(ctx.parsed.y, 1)}${unit}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { maxRotation: 45, minRotation: 0 }, grid: { display: false } },
      y: { grid: { color: "#eef2f6" } },
    },
  };
}

async function initResearch() {
  const payload = await loadResearch();
  r("researchGeneratedAt").textContent = new Date(payload.generated_at).toLocaleString("ko-KR");
  renderCoverage(payload);
  renderTables(payload);
  if (window.Chart) renderCharts(payload);
}

window.addEventListener("DOMContentLoaded", () => {
  initResearch().catch((error) => {
    console.error(error);
    r("researchGeneratedAt").textContent = "load failed";
  });
});
