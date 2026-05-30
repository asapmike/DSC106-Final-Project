const NS = "http://www.w3.org/2000/svg";

const COLORS = {
  ink: "#15191c",
  muted: "#5f6765",
  line: "#c6d0c8",
  grid: "#dfe6df",
  surface: "#ffffff",
  bg: "#eef5ef",
  accent: "#0f766e",
  accentDark: "#075e59",
  accentSoft: "#d8ebe6",
  rain: "#3f8fbc",
  heat: "#e66f2a",
  heatSoft: "#f7dccd",
  night: "#24313d",
  faint: "#aeb8b1"
};

const SCENARIOS = [
  { code: "SSP1-2.6", label: "Low emissions", detail: "Stronger climate action and lower future warming." },
  { code: "SSP2-4.5", label: "Moderate emissions", detail: "Intermediate emissions and moderate warming." },
  { code: "SSP5-8.5", label: "High emissions", detail: "Very high emissions and stronger warming." }
];

const PERIODS = ["2050", "2080s"];
const SEASONS = ["Winter", "Spring", "Summer", "Fall"];
const METRICS = [
  { key: "index", label: "Overall Match" },
  { key: "tempScore", label: "Temperature Match" },
  { key: "rainScore", label: "Rainfall Match" },
  { key: "heatScore", label: "Summer Heat Match" },
  { key: "winterRainScore", label: "Winter Rain Match" }
];

const VIEW_META = {
  trajectory: {
    label: "Step 1 of 5",
    question: "How does San Diego's future climate move?",
    annotation: "San Diego's path shifts warmer under every scenario. The selected future period is compared with present-day candidate cities."
  },
  ranking: {
    label: "Step 2 of 5",
    question: "Which city is the closest climate twin?",
    annotation: "The closest city is not necessarily Phoenix. The ranking changes when the emissions pathway or period changes."
  },
  map: {
    label: "Step 3 of 5",
    question: "When does San Diego's climate arrive in each city?",
    annotation: "Drag the year, or press play. The travelling marker is the present-day city that San Diego's climate most resembles in that year."
  },
  fingerprint: {
    label: "Step 4 of 5",
    question: "Why is the selected city similar?",
    annotation: "A city can match San Diego on temperature but still differ on rainfall. Seasonal fingerprints reveal that tradeoff."
  },
  difference: {
    label: "Step 5 of 5",
    question: "Where does the match fail?",
    annotation: "Centered bars show mismatch: right means the selected city is warmer or wetter than future San Diego; left means colder or drier."
  }
};

const rawRecords = (window.CLIMATE_DATA && window.CLIMATE_DATA.records ? window.CLIMATE_DATA.records : []).map((record) => ({
  ...record,
  year: record.year === null || record.year === "" ? null : Number(record.year),
  value: record.value === null || record.value === "" ? null : Number(record.value)
}));

const state = {
  scenario: "SSP5-8.5",
  period: "2080s",
  selectedCity: null,
  metric: "index",
  activeView: "trajectory",
  year: 2055,
  playing: false
};

// ───────────────────────── helpers ─────────────────────────
function byId(id) { return document.getElementById(id); }

function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null) node.setAttribute(k, v); });
  if (parent) parent.appendChild(node);
  return node;
}
function addText(parent, text, attrs = {}) {
  const node = svgEl("text", attrs, parent);
  node.textContent = text;
  return node;
}
function clearSvg(svg, width, height) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function recordsOf(type) { return rawRecords.filter((r) => r.record_type === type); }
function profileName(period = state.period, scenario = state.scenario) { return `${period} ${scenario}`; }
function scenarioMeta(code = state.scenario) { return SCENARIOS.find((s) => s.code === code) || SCENARIOS[0]; }

function cityLocations() {
  return recordsOf("city_location").map((r) => ({ city: r.city, lat: Number(r.lat), lon: Number(r.lon) }));
}
function comparisonCities() {
  return [...new Set(recordsOf("climate_twin_similarity").map((r) => r.comparison_city))].filter(Boolean);
}
function seasonalValues(recordType, city, profile, metric, scenario) {
  const values = {};
  rawRecords.forEach((r) => {
    const scenarioMatches = !scenario || r.scenario === scenario;
    if (r.record_type === recordType && r.city === city && r.profile === profile && r.metric === metric && scenarioMatches) {
      values[r.season] = r.value;
    }
  });
  return values;
}
function futureValues(metric, period = state.period, scenario = state.scenario) {
  return seasonalValues("seasonal_future_profile", "San Diego", profileName(period, scenario), metric, scenario);
}
function comparisonValues(city, metric) {
  return seasonalValues("seasonal_comparison_profile", city, `${city} today`, metric, "Historical");
}
function sanDiegoTodayTemp() {
  return seasonalValues("seasonal_temp_profile", "San Diego", "San Diego today", "seasonal_mean_temp_c", "Historical");
}
function sanDiegoTodayPrecipEstimate(scenario = state.scenario) {
  const future = futureValues("seasonal_precip_mm", "2080s", scenario);
  const result = {};
  SEASONS.forEach((season) => {
    const change = rawRecords.find((r) => r.record_type === "precip_change" && r.scenario === scenario && r.season === season);
    const pct = change ? change.value : 0;
    result[season] = future[season] / (1 + pct / 100);
  });
  return result;
}
function mean(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
}
function sum(values) { return values.filter((v) => Number.isFinite(v)).reduce((t, v) => t + v, 0); }
function rmse(values) { return Math.sqrt(mean(values.map((v) => v * v))); }
function completeSeasonal(values) { return SEASONS.every((s) => Number.isFinite(values[s])); }

// Generalised scoring: compare any San-Diego seasonal profile against a city.
function scoreForProfile(city, futureTemp, futureRain) {
  const cityTemp = comparisonValues(city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(city, "seasonal_precip_mm");
  if (!completeSeasonal(futureTemp) || !completeSeasonal(futureRain) || !completeSeasonal(cityTemp) || !completeSeasonal(cityRain)) {
    return { city, tempScore: 0, rainScore: 0, heatScore: 0, winterRainScore: 0, index: 0 };
  }
  const tempDistance = rmse(SEASONS.map((s) => cityTemp[s] - futureTemp[s]));
  const rainDistance = rmse(SEASONS.map((s) => (cityRain[s] - futureRain[s]) / Math.max(40, futureRain[s]))) * 100;
  const heatDistance = Math.abs(cityTemp.Summer - futureTemp.Summer);
  const winterRainDistance = Math.abs(cityRain.Winter - futureRain.Winter) / Math.max(80, futureRain.Winter) * 100;
  const tempScore = clamp(100 - tempDistance * 18, 0, 100);
  const rainScore = clamp(100 - rainDistance * 1.1, 0, 100);
  const heatScore = clamp(100 - heatDistance * 14, 0, 100);
  const winterRainScore = clamp(100 - winterRainDistance * 1.2, 0, 100);
  const index = 0.6 * tempScore + 0.3 * rainScore + 0.1 * heatScore;
  return { city, tempScore, rainScore, heatScore, winterRainScore, index };
}
function componentScores(city) {
  return scoreForProfile(city, futureValues("seasonal_mean_temp_c"), futureValues("seasonal_precip_mm"));
}
function rankingRows() {
  return comparisonCities().map(componentScores).sort((a, b) => b.index - a.index);
}
function selectedRow() {
  return rankingRows().find((r) => r.city === state.selectedCity) || rankingRows()[0];
}
function ensureSelectedCity() {
  const rows = rankingRows();
  if (!rows.length) { state.selectedCity = null; return; }
  if (!state.selectedCity || !rows.some((r) => r.city === state.selectedCity)) state.selectedCity = rows[0].city;
}
function scoreColor(score) {
  const lightness = clamp(82 - score * 0.38, 34, 82);
  const saturation = clamp(34 + score * 0.35, 34, 72);
  return `hsl(174, ${saturation}%, ${lightness}%)`;
}
function metricLabel(key = state.metric) { return (METRICS.find((m) => m.key === key) || METRICS[0]).label; }

// ── Time-travel: San Diego's seasonal profile at an arbitrary year ──
function sdAnchors(scenario = state.scenario) {
  return [
    { yr: 2020, temp: sanDiegoTodayTemp(), rain: sanDiegoTodayPrecipEstimate(scenario) },
    { yr: 2050, temp: futureValues("seasonal_mean_temp_c", "2050", scenario), rain: futureValues("seasonal_precip_mm", "2050", scenario) },
    { yr: 2085, temp: futureValues("seasonal_mean_temp_c", "2080s", scenario), rain: futureValues("seasonal_precip_mm", "2080s", scenario) }
  ];
}
function sdProfileAtYear(year, scenario = state.scenario) {
  const a = sdAnchors(scenario);
  const y = clamp(year, a[0].yr, a[a.length - 1].yr);
  let lo = a[0], hi = a[a.length - 1];
  for (let i = 0; i < a.length - 1; i++) { if (y >= a[i].yr && y <= a[i + 1].yr) { lo = a[i]; hi = a[i + 1]; break; } }
  const t = hi.yr === lo.yr ? 0 : (y - lo.yr) / (hi.yr - lo.yr);
  const temp = {}, rain = {};
  SEASONS.forEach((s) => { temp[s] = lerp(lo.temp[s], hi.temp[s], t); rain[s] = lerp(lo.rain[s], hi.rain[s], t); });
  return { temp, rain };
}
function bestTwinAtYear(year) {
  const p = sdProfileAtYear(year);
  return comparisonCities().map((c) => scoreForProfile(c, p.temp, p.rain)).sort((a, b) => b.index - a.index);
}

// ───────────────────────── tooltip ─────────────────────────
let tipEl = null;
function tip() { if (!tipEl) tipEl = byId("tooltip"); return tipEl; }
function showTip(html, evt) {
  const t = tip(); if (!t) return;
  t.innerHTML = html;
  t.classList.add("is-visible");
  moveTip(evt);
}
function moveTip(evt) {
  const t = tip(); if (!t) return;
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
  t.style.left = `${x}px`; t.style.top = `${y}px`;
}
function hideTip() { const t = tip(); if (t) t.classList.remove("is-visible"); }

// ───────────────────────── controls ─────────────────────────
function setButtonStates() {
  document.querySelectorAll("[data-scenario]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scenario === state.scenario)));
  document.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.period === state.period)));
  document.querySelectorAll("[data-metric]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.metric === state.metric)));
}
function initControls() {
  const scenarioButtons = byId("scenarioButtons");
  SCENARIOS.forEach((scenario) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "control-button scenario-button";
    b.dataset.scenario = scenario.code; b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${scenario.code}</span><small>${scenario.label}</small>`;
    b.addEventListener("click", () => { state.scenario = scenario.code; ensureSelectedCity(); updateAll(); });
    scenarioButtons.appendChild(b);
  });
  const periodButtons = byId("periodButtons");
  PERIODS.forEach((period) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "control-button"; b.dataset.period = period;
    b.textContent = period; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { state.period = period; ensureSelectedCity(); updateAll(); });
    periodButtons.appendChild(b);
  });
  const metricButtons = byId("metricButtons");
  METRICS.forEach((metric) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "control-button metric-button"; b.dataset.metric = metric.key;
    b.textContent = metric.label; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { state.metric = metric.key; updateAll(); });
    metricButtons.appendChild(b);
  });
  byId("resetButton").addEventListener("click", () => {
    stopPlay();
    state.scenario = "SSP5-8.5"; state.period = "2080s"; state.metric = "index";
    state.activeView = "trajectory"; state.selectedCity = null; state.year = 2055;
    ensureSelectedCity(); setActiveView(state.activeView); updateAll();
    document.querySelector(".story-steps")?.firstElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Year slider (signature interaction)
  const slider = byId("yearSlider");
  if (slider) {
    slider.value = state.year;
    slider.addEventListener("input", () => { stopPlay(); state.year = Number(slider.value); updateTravel(true); });
  }
  const playBtn = byId("playButton");
  if (playBtn) playBtn.addEventListener("click", () => { state.playing ? stopPlay() : startPlay(); });
}

// ───────────────────────── scroll steps ─────────────────────────
function initScrollSteps() {
  const steps = document.querySelectorAll(".story-step");
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) {
      const view = visible.target.dataset.view;
      if (view && view !== state.activeView) {
        state.activeView = view; setActiveView(view);
        if (view === "ranking") ensureSelectedCity();
        if (view !== "map") stopPlay();
        updateAll();
      }
    }
  }, { rootMargin: "-30% 0px -30% 0px", threshold: [0.1, 0.3, 0.5] });
  steps.forEach((step) => observer.observe(step));
}
function setActiveView(view) {
  const meta = VIEW_META[view] || VIEW_META.trajectory;
  byId("viewLabel").textContent = meta.label;
  byId("activeQuestion").textContent = meta.question;
  byId("activeAnnotation").textContent = meta.annotation;
  document.querySelector(".sticky-stage")?.setAttribute("data-view", view);
  document.querySelectorAll(".story-step").forEach((s) => s.classList.toggle("is-active", s.dataset.view === view));
  document.querySelectorAll(".viz-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === view));
  const stack = document.querySelector(".viz-stack");
  if (stack) stack.scrollTop = 0;
}
function updateSummary() {
  const rows = rankingRows();
  const top = rows[0]; const selected = selectedRow();
  if (!top || !selected) {
    byId("currentFinding").textContent = "No Climate Twin Index records available.";
    byId("currentDetail").textContent = "Check that data.js is present next to index.html.";
    return;
  }
  const scenario = scenarioMeta();
  byId("currentFinding").textContent = `${state.period} ${scenario.label}: closest twin is ${top.city}.`;
  byId("currentDetail").textContent = `${selected.city} is selected with a Climate Twin Index of ${selected.index.toFixed(1)} out of 100. Phoenix is not automatically the best match because seasonal rainfall and temperature pattern are included.`;
  byId("selectedTwinBadge").textContent = `${state.selectedCity}: ${selected.index.toFixed(1)}`;
}

// ───────────────────────── shared chart chrome ─────────────────────────
function climatePointForSeasonal(label, tempValues, precipValues, extra = {}) {
  return { label, avgTemp: mean(SEASONS.map((s) => tempValues[s])), annualPrecip: sum(SEASONS.map((s) => precipValues[s])), ...extra };
}

// ───────────────────────── Step 1: trajectory ─────────────────────────
function drawTrajectory() {
  const svgNode = byId("trajectorySvg");
  const width = 760, height = 430;
  const margin = { top: 32, right: 32, bottom: 58, left: 64 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const svg = d3.select(svgNode);

  const today = climatePointForSeasonal("San Diego today", sanDiegoTodayTemp(), sanDiegoTodayPrecipEstimate(), { type: "sd" });
  const sd2050 = climatePointForSeasonal("San Diego 2050", futureValues("seasonal_mean_temp_c", "2050"), futureValues("seasonal_precip_mm", "2050"), { type: "sd" });
  const sd2080 = climatePointForSeasonal("San Diego 2080s", futureValues("seasonal_mean_temp_c", "2080s"), futureValues("seasonal_precip_mm", "2080s"), { type: "sd" });
  const cityPoints = comparisonCities().map((c) => climatePointForSeasonal(c, comparisonValues(c, "seasonal_mean_temp_c"), comparisonValues(c, "seasonal_precip_mm"), { type: "city", row: componentScores(c) }));
  const sdPoints = [today, sd2050, sd2080];
  const all = [...sdPoints, ...cityPoints];
  const temps = all.map((p) => p.avgTemp), rains = all.map((p) => p.annualPrecip);
  const xDomain = [Math.floor(Math.min(...temps) - 1), Math.ceil(Math.max(...temps) + 1)];
  const yDomain = [Math.floor(Math.min(...rains) - 40), Math.ceil(Math.max(...rains) + 40)];
  const x = d3.scaleLinear(xDomain, [margin.left, width - margin.right]);
  const y = d3.scaleLinear(yDomain, [height - margin.bottom, margin.top]);

  // static chrome once
  if (svg.select(".bg").empty()) {
    svg.append("rect").attr("class", "bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "grid");
    svg.append("path").attr("class", "traj-path").attr("fill", "none").attr("stroke", COLORS.accent).attr("stroke-width", 4).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
    svg.append("g").attr("class", "city-layer");
    svg.append("g").attr("class", "sd-layer");
    svg.append("text").attr("class", "chart-label").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 18).attr("text-anchor", "middle").text("Average seasonal temperature (°C)");
    svg.append("text").attr("class", "chart-label").attr("x", margin.left).attr("y", 20).text("Annual precipitation (mm)");
  }
  const xTicks = [16, 18, 20, 22, 24, 26, 28].filter((t) => t >= xDomain[0] && t <= xDomain[1]);
  const yTicks = [100, 200, 300, 400].filter((t) => t >= yDomain[0] && t <= yDomain[1]);
  const grid = svg.select(".grid");
  grid.selectAll(".gx").data(xTicks).join("line").attr("class", "gx grid-line").attr("y1", margin.top).attr("y2", height - margin.bottom).attr("x1", x).attr("x2", x);
  grid.selectAll(".gxl").data(xTicks).join("text").attr("class", "gxl chart-label").attr("text-anchor", "middle").attr("y", height - 34).attr("x", x).text((d) => `${d}°`);
  grid.selectAll(".gy").data(yTicks).join("line").attr("class", "gy grid-line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y);
  grid.selectAll(".gyl").data(yTicks).join("text").attr("class", "gyl chart-label").attr("text-anchor", "end").attr("x", margin.left - 10).attr("y", (d) => y(d) + 4).text((d) => d);

  // city dots
  const cd = svg.select(".city-layer").selectAll(".cdot").data(cityPoints, (d) => d.label);
  cd.join(
    (enter) => enter.append("circle").attr("class", "cdot").attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip)).attr("r", 0)
      .call((s) => s.transition().duration(600).attr("r", (d) => d.label === state.selectedCity ? 9 : 5.5)),
    (update) => update.call((s) => s.transition().duration(600).attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip)).attr("r", (d) => d.label === state.selectedCity ? 9 : 5.5))
  )
    .attr("fill", (d) => d.label === state.selectedCity ? COLORS.heat : COLORS.surface)
    .attr("stroke", (d) => d.label === state.selectedCity ? COLORS.ink : COLORS.faint)
    .attr("stroke-width", (d) => d.label === state.selectedCity ? 2.5 : 1.5)
    .style("cursor", "pointer")
    .on("mouseenter", (e, d) => showTip(`<strong>${d.label}</strong><span>${d.avgTemp.toFixed(1)}°C · ${d.annualPrecip.toFixed(0)} mm/yr</span><span>Match ${d.row.index.toFixed(0)}/100</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip)
    .on("click", (e, d) => { state.selectedCity = d.label; updateAll(); });

  // city labels (selected + phoenix)
  svg.select(".city-layer").selectAll(".clbl").data(cityPoints.filter((d) => d.label === state.selectedCity || d.label === "Phoenix"), (d) => d.label)
    .join("text").attr("class", "clbl chart-label selected-label").text((d) => d.label)
    .transition().duration(600).attr("x", (d) => x(d.avgTemp) + 11).attr("y", (d) => y(d.annualPrecip) - 8);

  // SD trajectory path with draw-on animation
  const line = d3.line().x((d) => x(d.avgTemp)).y((d) => y(d.annualPrecip));
  const path = svg.select(".traj-path").attr("d", line(sdPoints));
  const len = path.node().getTotalLength();
  path.attr("stroke-dasharray", len).attr("stroke-dashoffset", len)
    .transition().duration(1100).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);

  // SD anchor dots
  svg.select(".sd-layer").selectAll(".sddot").data(sdPoints, (d) => d.label).join(
    (enter) => enter.append("circle").attr("class", "sddot").attr("r", 0).attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip))
      .call((s) => s.transition().delay((d, i) => 250 + i * 320).duration(420).ease(d3.easeBackOut).attr("r", 8)),
    (update) => update.call((s) => s.transition().duration(700).attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip)))
  ).attr("fill", (d, i) => i === 0 ? COLORS.surface : COLORS.accent).attr("stroke", COLORS.ink).attr("stroke-width", 2);

  svg.select(".sd-layer").selectAll(".sdlbl").data(sdPoints, (d) => d.label).join("text")
    .attr("class", "sdlbl chart-label selected-label").text((d) => d.label)
    .transition().duration(700).attr("x", (d) => x(d.avgTemp) + 11).attr("y", (d, i) => y(d.annualPrecip) + (i === 0 ? 18 : -10));
}

// ───────────────────────── Step 2: ranking ─────────────────────────
function drawRanking() {
  const svgNode = byId("rankingSvg");
  const width = 760, height = 430;
  const margin = { top: 46, right: 64, bottom: 54, left: 128 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const rows = rankingRows();
  const svg = d3.select(svgNode);
  if (!rows.length) { svgNode.innerHTML = ""; addText(svgNode, "No ranking records available.", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-label" }); return; }
  const x = d3.scaleLinear([0, 100], [margin.left, width - margin.right]);
  const rowHeight = (height - margin.top - margin.bottom) / rows.length;
  const barHeight = Math.min(32, rowHeight - 12);
  const dur = 650;

  if (svg.select(".rank-bg").empty()) {
    svg.append("rect").attr("class", "rank-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    [0, 25, 50, 75, 100].forEach((tick) => {
      svg.append("line").attr("class", "grid-line").attr("x1", x(tick)).attr("x2", x(tick)).attr("y1", margin.top).attr("y2", height - margin.bottom);
      svg.append("text").attr("class", "chart-label").attr("x", x(tick)).attr("y", height - 16).attr("text-anchor", "middle").text(tick);
    });
    svg.append("text").attr("class", "chart-label").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 4).attr("text-anchor", "middle").text("Climate Twin Index");
    [["Temperature", COLORS.accent], ["Rainfall", COLORS.rain], ["Summer heat", COLORS.heat]].forEach(([label, color], i) => {
      const lx = margin.left + i * 132;
      svg.append("rect").attr("x", lx).attr("y", 18).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", color);
      svg.append("text").attr("class", "chart-label").attr("x", lx + 18).attr("y", 29).text(label);
    });
  }

  const groups = svg.selectAll(".rank-row").data(rows, (d) => d.city).join((enter) => {
    const g = enter.append("g").attr("class", "rank-row").attr("transform", (d, i) => `translate(0,${margin.top + i * rowHeight + 6})`).attr("tabindex", 0).attr("role", "button");
    g.append("text").attr("class", "city-label chart-label").attr("text-anchor", "end").attr("x", margin.left - 12).attr("y", barHeight / 2 + 5);
    g.append("rect").attr("class", "bar-temp").attr("rx", 8).attr("fill", COLORS.accent).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
    g.append("rect").attr("class", "bar-rain").attr("fill", COLORS.rain).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
    g.append("rect").attr("class", "bar-heat").attr("fill", COLORS.heat).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
    g.append("text").attr("class", "rank-score chart-label selected-label").attr("y", barHeight / 2 + 5);
    g.append("rect").attr("class", "rank-outline").attr("height", barHeight).attr("rx", 8).attr("fill", "none");
    g.append("rect").attr("class", "rank-hit").attr("fill", "transparent").attr("cursor", "pointer").attr("x", margin.left).attr("width", width - margin.left - margin.right).attr("height", barHeight + 8);
    return g;
  });

  groups.transition().duration(dur).ease(d3.easeCubicInOut).attr("transform", (d, i) => `translate(0,${margin.top + i * rowHeight + 6})`);
  groups.select(".city-label").text((d) => d.city).attr("fill", (d) => d.city === state.selectedCity ? COLORS.ink : COLORS.muted).attr("font-weight", (d) => d.city === state.selectedCity ? 900 : 720);
  const t = d3.transition().duration(dur).ease(d3.easeCubicOut);
  groups.select(".bar-temp").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("width", (d) => Math.max(1, x(d.tempScore * 0.6) - x(0)));
  groups.select(".bar-rain").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("x", (d) => x(d.tempScore * 0.6)).attr("width", (d) => Math.max(1, x(d.tempScore * 0.6 + d.rainScore * 0.3) - x(d.tempScore * 0.6)));
  groups.select(".bar-heat").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("x", (d) => x(d.tempScore * 0.6 + d.rainScore * 0.3)).attr("width", (d) => Math.max(1, x(d.index) - x(d.tempScore * 0.6 + d.rainScore * 0.3)));
  groups.select(".rank-score").text((d) => d.index.toFixed(1)).transition(t).attr("x", (d) => x(d.index) + 8);
  groups.select(".rank-outline").attr("x", margin.left).transition(t).attr("width", (d) => Math.max(2, x(d.index) - margin.left)).attr("stroke", (d) => d.city === state.selectedCity ? COLORS.ink : "transparent").attr("stroke-width", (d) => d.city === state.selectedCity ? 2.5 : 0);
  groups.on("click", (e, d) => { state.selectedCity = d.city; updateAll(); })
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.selectedCity = d.city; updateAll(); } })
    .on("mouseenter", (e, d) => showTip(`<strong>${d.city}</strong><span>Temp ${d.tempScore.toFixed(0)} · Rain ${d.rainScore.toFixed(0)} · Heat ${d.heatScore.toFixed(0)}</span><span>Overall ${d.index.toFixed(1)}/100</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip)
    .attr("aria-label", (d) => `${d.city}, Climate Twin Index ${d.index.toFixed(1)}`);
}

// ───────────────────────── Step 3: geographic map + time travel ─────────────────────────
let mapProjection = null;
function drawMap() {
  const svgNode = byId("mapSvg");
  const width = 760, height = 500;
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const svg = d3.select(svgNode);
  svgNode.innerHTML = "";

  const geo = window.WEST_GEO;
  // Ensure exterior rings wind correctly for d3's spherical geometry, otherwise
  // d3 treats each polygon as covering the whole globe and fitExtent collapses.
  if (!geo.__rewound) {
    geo.features.forEach((f) => {
      if (d3.geoArea(f) > 2 * Math.PI) {
        f.geometry.coordinates = f.geometry.coordinates.map((ring) => ring.slice().reverse());
      }
    });
    geo.__rewound = true;
  }
  const projection = d3.geoMercator().fitExtent([[26, 26], [width - 26, height - 26]], geo);
  mapProjection = projection;
  const path = d3.geoPath(projection);

  svg.append("rect").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", "#dceaf2");
  // ocean grid
  const g = svg.append("g");
  // states
  g.append("g").selectAll("path").data(geo.features).join("path").attr("d", path)
    .attr("fill", "#eef4ec").attr("stroke", "#b9c8bd").attr("stroke-width", 1).attr("stroke-linejoin", "round");
  g.append("g").selectAll("text").data(geo.features).join("text")
    .attr("class", "chart-label state-label").attr("text-anchor", "middle")
    .attr("transform", (d) => { const p = projection([d.properties.clon, d.properties.clat]); return `translate(${p[0]},${p[1]})`; })
    .text((d) => d.properties.abbr);

  const locations = cityLocations();
  const rowsByCity = new Map(rankingRows().map((r) => [r.city, r]));

  // travel trail + ghost layers (created empty, populated by updateTravel)
  svg.append("g").attr("class", "trail-layer");
  const cityLayer = svg.append("g").attr("class", "map-cities");

  cityLayer.selectAll(".city-node").data(locations, (d) => d.city).join((enter) => {
    const node = enter.append("g").attr("class", "city-node")
      .attr("transform", (d) => { const p = projection([d.lon, d.lat]); return `translate(${p[0]},${p[1]})`; });
    node.append("circle").attr("class", "city-dot");
    node.append("text").attr("class", "map-label");
    return node;
  });
  cityLayer.selectAll(".city-node").each(function (d) {
    const row = rowsByCity.get(d.city);
    const isSD = d.city === "San Diego";
    const isSel = d.city === state.selectedCity;
    const score = row ? row[state.metric] : undefined;
    const sel = d3.select(this);
    sel.select("circle")
      .attr("r", isSD ? 9 : row ? 5 + row.index / 9 : 5)
      .attr("fill", isSD ? COLORS.heat : row ? scoreColor(score) : COLORS.surface)
      .attr("stroke", isSel || isSD ? COLORS.ink : "#ffffff")
      .attr("stroke-width", isSel || isSD ? 2.6 : 1.6)
      .style("cursor", row ? "pointer" : "default");
    sel.select("text").attr("class", `map-label ${isSel ? "selected-label" : ""}`)
      .attr("x", 9).attr("y", -9).text(row || isSD ? d.city : "")
      .attr("opacity", row || isSD ? 1 : 0);
    sel.attr("tabindex", row ? 0 : -1).attr("role", row ? "button" : "img")
      .attr("aria-label", row ? `${d.city}, ${metricLabel()} ${score.toFixed(1)}` : d.city);
    if (row) {
      sel.on("click", () => { state.selectedCity = d.city; updateAll(); })
        .on("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.selectedCity = d.city; updateAll(); } })
        .on("mouseenter", (e) => showTip(`<strong>${d.city}</strong><span>${metricLabel()} ${score.toFixed(0)}/100</span>`, e))
        .on("mousemove", moveTip).on("mouseleave", hideTip);
    } else { sel.on("mouseenter", null).on("mouseleave", null); }
  });

  // moving "future San Diego" marker
  const ghost = svg.append("g").attr("class", "ghost").style("pointer-events", "none");
  ghost.append("circle").attr("class", "ghost-halo").attr("r", 16).attr("fill", COLORS.heat).attr("opacity", 0.16);
  ghost.append("circle").attr("class", "ghost-core").attr("r", 7).attr("fill", COLORS.heat).attr("stroke", "#fff").attr("stroke-width", 2);
  ghost.append("text").attr("class", "ghost-label map-label selected-label").attr("y", -16).attr("text-anchor", "middle");

  svg.append("text").attr("class", "chart-label selected-label").attr("x", width - 26).attr("y", 26).attr("text-anchor", "end").text(`Color: ${metricLabel()}`);

  updateTravel(false);
}

function updateTravel(animate) {
  if (!mapProjection || state.activeView !== "map") return;
  const svg = d3.select(byId("mapSvg"));
  const ghost = svg.select(".ghost"); if (ghost.empty()) return;
  const rows = bestTwinAtYear(state.year);
  const top = rows[0];
  const locs = new Map(cityLocations().map((l) => [l.city, l]));
  const target = locs.get(top.city) || locs.get("San Diego");
  const [tx, ty] = mapProjection([target.lon, target.lat]);

  const gsel = animate ? ghost.transition().duration(650).ease(d3.easeCubicInOut) : ghost;
  gsel.attr("transform", `translate(${tx},${ty})`);
  ghost.select(".ghost-label").text(`SD ${state.year}`);

  // highlight the current twin city ring
  svg.selectAll(".city-node").select("circle").attr("stroke-width", function (d) {
    const isSD = d.city === "San Diego"; const isSel = d.city === state.selectedCity;
    return d.city === top.city ? 3.4 : (isSel || isSD ? 2.6 : 1.6);
  }).attr("stroke", function (d) {
    const isSD = d.city === "San Diego"; const isSel = d.city === state.selectedCity;
    return d.city === top.city ? COLORS.heat : (isSel || isSD ? COLORS.ink : "#ffffff");
  });

  // trail of visited twins (dashed line San Diego -> current twin)
  const sd = locs.get("San Diego");
  const [sx, sy] = mapProjection([sd.lon, sd.lat]);
  let trail = svg.select(".trail-layer").select(".trail-line");
  if (trail.empty()) trail = svg.select(".trail-layer").append("line").attr("class", "trail-line").attr("stroke", COLORS.heat).attr("stroke-width", 2).attr("stroke-dasharray", "4 6").attr("opacity", 0.6);
  trail.attr("x1", sx).attr("y1", sy).transition().duration(animate ? 650 : 0).attr("x2", tx).attr("y2", ty);

  // readout
  const ro = byId("travelReadout");
  if (ro) {
    if (top.city === "San Diego") ro.innerHTML = `Around <strong>${state.year}</strong>, San Diego still feels like itself.`;
    else ro.innerHTML = `By <strong>${state.year}</strong>, San Diego's climate most resembles <strong>${top.city}</strong> today <span class="ro-score">match ${top.index.toFixed(0)}/100</span>`;
  }
  const yl = byId("yearLabel"); if (yl) yl.textContent = state.year;
}

let playTimer = null;
function startPlay() {
  const slider = byId("yearSlider"); const btn = byId("playButton");
  if (!slider) return;
  state.playing = true; if (btn) { btn.classList.add("is-playing"); btn.textContent = "❚❚ Pause"; }
  if (Number(slider.value) >= Number(slider.max)) { slider.value = slider.min; state.year = Number(slider.min); }
  playTimer = setInterval(() => {
    let v = Number(slider.value) + 1;
    if (v > Number(slider.max)) { v = Number(slider.max); stopPlay(); }
    slider.value = v; state.year = v; updateTravel(true);
  }, 140);
}
function stopPlay() {
  state.playing = false; const btn = byId("playButton");
  if (btn) { btn.classList.remove("is-playing"); btn.textContent = "▶ Play"; }
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
}

// ───────────────────────── Step 4: seasonal fingerprint (animated) ─────────────────────────
function drawFingerprint() {
  const svgNode = byId("fingerprintSvg");
  const width = 760, height = 500;
  const margin = { left: 56, right: 28 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const svg = d3.select(svgNode);
  const selected = selectedRow(); if (!selected) return;

  const futureTemp = futureValues("seasonal_mean_temp_c");
  const futureRain = futureValues("seasonal_precip_mm");
  const cityTemp = comparisonValues(selected.city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(selected.city, "seasonal_precip_mm");

  if (svg.select(".fp-bg").empty()) {
    svg.append("rect").attr("class", "fp-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "fp-temp");
    svg.append("g").attr("class", "fp-rain");
    svg.append("g").attr("class", "fp-legend");
  }
  const legend = svg.select(".fp-legend"); legend.selectAll("*").remove();
  legend.append("rect").attr("x", width - 246).attr("y", 16).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", COLORS.accent);
  legend.append("text").attr("class", "chart-label").attr("x", width - 226).attr("y", 26).text(`San Diego ${profileName()}`);
  legend.append("rect").attr("x", width - 246).attr("y", 39).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", COLORS.heat);
  legend.append("text").attr("class", "chart-label").attr("x", width - 226).attr("y", 49).text(`${selected.city} today`);

  drawGroupedBars(svg.select(".fp-temp"), { x: margin.left, y: 48, width: width - margin.left - margin.right, height: 170 }, futureTemp, cityTemp, "Seasonal temperature (°C)", COLORS.accent, COLORS.heat, selected.city);
  drawGroupedBars(svg.select(".fp-rain"), { x: margin.left, y: 278, width: width - margin.left - margin.right, height: 170 }, futureRain, cityRain, "Seasonal precipitation (mm)", COLORS.rain, COLORS.heat, selected.city);
}
function drawGroupedBars(g, box, future, city, label, futureColor, cityColor, cityName) {
  const values = SEASONS.flatMap((s) => [future[s], city[s]]).filter(Number.isFinite);
  const maxValue = Math.max(...values) * 1.18 || 1;
  const y = d3.scaleLinear([0, maxValue], [box.y + box.height, box.y]);
  const groupWidth = box.width / SEASONS.length;
  const barWidth = Math.min(34, groupWidth * 0.24);
  const t = d3.transition().duration(700).ease(d3.easeCubicOut);

  // gridlines
  g.selectAll(".fpgrid").data([0, maxValue / 2, maxValue]).join("line").attr("class", "fpgrid grid-line").attr("x1", box.x).attr("x2", box.x + box.width).attr("y1", y).attr("y2", y);
  g.selectAll(".fpgl").data([0, maxValue / 2, maxValue]).join("text").attr("class", "fpgl chart-label").attr("text-anchor", "end").attr("x", box.x - 10).attr("y", (d) => y(d) + 4).text((d) => d.toFixed(0));
  g.selectAll(".fptitle").data([label]).join("text").attr("class", "fptitle chart-label selected-label").attr("x", box.x).attr("y", box.y - 14).text((d) => d);
  g.selectAll(".fpseason").data(SEASONS).join("text").attr("class", "fpseason chart-label").attr("text-anchor", "middle").attr("x", (s, i) => box.x + groupWidth * i + groupWidth / 2).attr("y", box.y + box.height + 24).text((s) => s);

  const data = SEASONS.map((s, i) => ({ s, i, fv: future[s], cv: city[s], center: box.x + groupWidth * i + groupWidth / 2 }));
  // future bars
  g.selectAll(".fbar").data(data, (d) => d.s).join(
    (enter) => enter.append("rect").attr("class", "fbar").attr("rx", 7).attr("fill", futureColor).attr("x", (d) => d.center - barWidth - 4).attr("width", barWidth).attr("y", y(0)).attr("height", 0)
  ).attr("fill", futureColor).attr("x", (d) => d.center - barWidth - 4).attr("width", barWidth)
    .transition(t).attr("y", (d) => y(d.fv)).attr("height", (d) => y(0) - y(d.fv));
  // city bars
  g.selectAll(".cbar").data(data, (d) => d.s).join(
    (enter) => enter.append("rect").attr("class", "cbar").attr("rx", 7).attr("fill", cityColor).attr("x", (d) => d.center + 4).attr("width", barWidth).attr("y", y(0)).attr("height", 0)
  ).attr("fill", cityColor).attr("x", (d) => d.center + 4).attr("width", barWidth)
    .transition(t).attr("y", (d) => y(d.cv)).attr("height", (d) => y(0) - y(d.cv));

  // morph overlay line connecting city values (the "fingerprint" curve)
  const lineGen = d3.line().curve(d3.curveCardinal).x((d) => d.center + 4 + barWidth / 2).y((d) => y(d.cv));
  g.selectAll(".fpline").data([data]).join(
    (enter) => enter.append("path").attr("class", "fpline").attr("fill", "none").attr("stroke", cityColor).attr("stroke-width", 2.4).attr("opacity", 0.75)
  ).transition(t).attr("d", lineGen);
  // hover targets
  g.selectAll(".fphit").data(data, (d) => d.s).join(
    (enter) => enter.append("rect").attr("class", "fphit").attr("fill", "transparent")
  ).attr("x", (d) => d.center - groupWidth / 2).attr("width", groupWidth).attr("y", box.y).attr("height", box.height).style("cursor", "default")
    .on("mouseenter", (e, d) => showTip(`<strong>${d.s}</strong><span>SD ${profileName()}: ${d.fv.toFixed(label.includes("temp") ? 1 : 0)}</span><span>${cityName}: ${d.cv.toFixed(label.includes("temp") ? 1 : 0)}</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip);
}

// ───────────────────────── Step 5: difference ─────────────────────────
function drawDifference() {
  const svgNode = byId("differenceSvg");
  const width = 760, height = 500;
  const margin = { top: 42, right: 56, bottom: 42, left: 144 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const svg = d3.select(svgNode);
  const selected = selectedRow(); if (!selected) return;

  const futureTemp = futureValues("seasonal_mean_temp_c");
  const futureRain = futureValues("seasonal_precip_mm");
  const cityTemp = comparisonValues(selected.city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(selected.city, "seasonal_precip_mm");
  const rows = [
    ...SEASONS.map((s) => ({ label: `${s} temp`, value: cityTemp[s] - futureTemp[s], unit: "°C", color: COLORS.heat })),
    ...SEASONS.map((s) => ({ label: `${s} rain`, value: (cityRain[s] - futureRain[s]) / Math.max(20, futureRain[s]) * 100, unit: "%", color: COLORS.rain }))
  ];
  const maxAbs = Math.max(8, Math.ceil(Math.max(...rows.map((r) => Math.abs(r.value))) / 10) * 10);
  const x = d3.scaleLinear([-maxAbs, maxAbs], [margin.left, width - margin.right]);
  const rowHeight = (height - margin.top - margin.bottom) / rows.length;
  const t = d3.transition().duration(650).ease(d3.easeCubicOut);

  if (svg.select(".diff-bg").empty()) { svg.append("rect").attr("class", "diff-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg); svg.append("g").attr("class", "diff-axes"); svg.append("g").attr("class", "diff-rows"); svg.append("text").attr("class", "diff-title chart-label selected-label").attr("x", margin.left).attr("y", 24); }
  svg.select(".diff-title").text(`${selected.city} today minus San Diego ${profileName()}`);
  const axes = svg.select(".diff-axes");
  axes.selectAll(".dax").data([-maxAbs, 0, maxAbs]).join("line").attr("class", (d) => `dax ${d === 0 ? "zero-line" : "grid-line"}`).attr("x1", x).attr("x2", x).attr("y1", margin.top - 10).attr("y2", height - margin.bottom);
  axes.selectAll(".daxl").data([-maxAbs, 0, maxAbs]).join("text").attr("class", "daxl chart-label").attr("text-anchor", "middle").attr("x", x).attr("y", height - 15).text((d) => d);

  const g = svg.select(".diff-rows").selectAll(".diff-row").data(rows, (d) => d.label).join((enter) => {
    const row = enter.append("g").attr("class", "diff-row");
    row.append("text").attr("class", "rlbl chart-label").attr("text-anchor", "end").attr("x", margin.left - 12);
    row.append("rect").attr("class", "rbar").attr("rx", 7).attr("opacity", 0.88).attr("x", x(0)).attr("width", 0);
    row.append("text").attr("class", "rval chart-label selected-label");
    return row;
  });
  g.attr("transform", (d, i) => `translate(0,${margin.top + i * rowHeight + 5})`);
  g.select(".rlbl").text((d) => d.label).attr("y", rowHeight / 2 + 4);
  g.select(".rbar").attr("fill", (d) => d.color).attr("height", Math.max(14, rowHeight - 10)).transition(t)
    .attr("x", (d) => Math.min(x(0), x(d.value))).attr("width", (d) => Math.max(2, Math.abs(x(d.value) - x(0))));
  g.select(".rval").attr("y", rowHeight / 2 + 4).text((d) => `${d.value > 0 ? "+" : ""}${d.value.toFixed(d.unit === "°C" ? 1 : 0)}${d.unit}`)
    .attr("text-anchor", (d) => d.value >= 0 ? "start" : "end").transition(t).attr("x", (d) => d.value >= 0 ? x(d.value) + 7 : x(d.value) - 7);
}

// ───────────────────────── orchestration ─────────────────────────
function drawAll() {
  drawTrajectory(); drawRanking(); drawMap(); drawFingerprint(); drawDifference();
}
function updateAll() {
  ensureSelectedCity(); setButtonStates(); updateSummary(); drawAll();
}
function boot() {
  if (!rawRecords.length) {
    byId("currentFinding").textContent = "Dataset did not load.";
    byId("currentDetail").textContent = "Check that data.js is present next to index.html.";
    return;
  }
  initControls(); initScrollSteps(); ensureSelectedCity(); setActiveView(state.activeView); updateAll();
}
boot();
