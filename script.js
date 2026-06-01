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

const FOCUS_CITIES = ["San Diego", "Los Angeles", "Riverside"];

const VIEW_META = {
  trajectory: {
    label: "Step 1 of 5",
    question: "How does San Diego's future climate move?",
    annotation: "The path runs from San Diego today to San Diego in your selected future period. Every other city is plotted at its present-day climate — choose 2050 or the 2080s to see how far the path reaches."
  },
  ranking: {
    label: "Step 2 of 5",
    question: "Which city is the closest climate twin?",
    annotation: "Los Angeles, then Riverside — not the desert cities. The ranking re-sorts when you change the scenario, the period, or the weights below."
  },
  map: {
    label: "Step 3 of 5",
    question: "When does San Diego's climate arrive in Los Angeles?",
    annotation: "Drag the year or press play. The marker is San Diego's projected climate; it slides to whichever nearby city — Los Angeles or Riverside — it most resembles that year."
  },
  fingerprint: {
    label: "Step 4 of 5",
    question: "How does San Diego's future compare with its two closest twins?",
    annotation: "San Diego's projection sits beside Los Angeles and Riverside today, season by season. Whiskers show the model range — a city can match on temperature yet still differ on rainfall."
  },
  difference: {
    label: "Step 5 of 5",
    question: "How long does the twin last?",
    annotation: "Each bar is the best match San Diego can find in that scenario and period. Under high emissions by the 2080s, even the closest twin barely fits — San Diego runs off the map of today's cities."
  }
};

const DATA = window.CLIMATE_DATA || {};
const CITIES = DATA.cities || {};
const SD = DATA.sanDiego || { present: { temp: {}, precip: {} }, future: {} };

const state = {
  scenario: "SSP5-8.5",
  period: "2080s",
  selectedCity: null,
  metric: "index",
  activeView: "trajectory",
  year: 2055,
  playing: false,
  weights: { temp: 0.6, rain: 0.3, heat: 0.1 }
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

function profileName(period = state.period, scenario = state.scenario) { return `${period} ${scenario}`; }
function scenarioMeta(code = state.scenario) { return SCENARIOS.find((s) => s.code === code) || SCENARIOS[0]; }
function metricField(metric) { return metric && metric.indexOf("temp") !== -1 ? "temp" : "precip"; }

function cityLocations() {
  return Object.entries(CITIES).map(([city, d]) => ({ city, lat: d.lat, lon: d.lon }));
}
function comparisonCities() {
  return Object.keys(CITIES).filter((c) => c !== "San Diego");
}
function futureProfile(period = state.period, scenario = state.scenario) {
  return (SD.future[scenario] && SD.future[scenario][period]) || null;
}
function futureValues(metric, period = state.period, scenario = state.scenario) {
  const f = futureProfile(period, scenario);
  return f ? f[metricField(metric)].median : {};
}
function futureBand(metric, period = state.period, scenario = state.scenario) {
  const f = futureProfile(period, scenario);
  if (!f) return null;
  const m = f[metricField(metric)];
  return { lo: m.lo, hi: m.hi };
}
function comparisonValues(city, metric) {
  const c = CITIES[city];
  return c ? c.present[metricField(metric)] : {};
}
function sanDiegoTodayTemp() { return SD.present.temp; }
function sanDiegoTodayPrecip() { return SD.present.precip; }
function mean(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
}
function sum(values) { return values.filter((v) => Number.isFinite(v)).reduce((t, v) => t + v, 0); }
function rmse(values) { return Math.sqrt(mean(values.map((v) => v * v))); }
function completeSeasonal(values) { return SEASONS.every((s) => Number.isFinite(values[s])); }

function normWeights() {
  const w = state.weights; const s = w.temp + w.rain + w.heat;
  if (!(s > 0)) return { temp: 1 / 3, rain: 1 / 3, heat: 1 / 3 };
  return { temp: w.temp / s, rain: w.rain / s, heat: w.heat / s };
}
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
  const w = normWeights();
  const index = w.temp * tempScore + w.rain * rainScore + w.heat * heatScore;
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
    { yr: 2020, temp: sanDiegoTodayTemp(), rain: sanDiegoTodayPrecip() },
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
const WEIGHT_DEFS = [
  { key: "temp", label: "Temperature", color: COLORS.accent },
  { key: "rain", label: "Rainfall", color: COLORS.rain },
  { key: "heat", label: "Summer heat", color: COLORS.heat }
];
function updateWeightPcts() {
  const w = normWeights();
  document.querySelectorAll("[data-weight-pct]").forEach((el) => { el.textContent = Math.round(w[el.dataset.weightPct] * 100) + "%"; });
}
function syncWeightSliders() {
  document.querySelectorAll("[data-weight]").forEach((el) => { el.value = String(Math.round(state.weights[el.dataset.weight] * 100)); });
  updateWeightPcts();
}
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

  // Weight sliders — let the reader redefine what "similar" means
  const weightWrap = byId("weightSliders");
  if (weightWrap) {
    WEIGHT_DEFS.forEach((wd) => {
      const row = document.createElement("label");
      row.className = "weight-row";
      const name = document.createElement("span");
      name.className = "weight-name";
      name.innerHTML = `<span class="weight-dot" style="background:${wd.color}"></span>${wd.label}`;
      const input = document.createElement("input");
      input.type = "range"; input.min = "0"; input.max = "100"; input.step = "5";
      input.dataset.weight = wd.key;
      input.value = String(Math.round(state.weights[wd.key] * 100));
      input.setAttribute("aria-label", `${wd.label} weight`);
      const pct = document.createElement("span");
      pct.className = "weight-pct"; pct.dataset.weightPct = wd.key;
      input.addEventListener("input", () => { state.weights[wd.key] = Number(input.value) / 100; updateWeightPcts(); updateAll(); });
      row.appendChild(name); row.appendChild(input); row.appendChild(pct);
      weightWrap.appendChild(row);
    });
    updateWeightPcts();
  }

  byId("resetButton").addEventListener("click", () => {
    stopPlay();
    state.scenario = "SSP5-8.5"; state.period = "2080s"; state.metric = "index";
    state.activeView = "trajectory"; state.selectedCity = null; state.year = 2055;
    state.weights = { temp: 0.6, rain: 0.3, heat: 0.1 }; syncWeightSliders();
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

  const today = climatePointForSeasonal("San Diego today", sanDiegoTodayTemp(), sanDiegoTodayPrecip(), { type: "sd" });
  const sdFuture = climatePointForSeasonal(`San Diego ${state.period}`, futureValues("seasonal_mean_temp_c", state.period), futureValues("seasonal_precip_mm", state.period), { type: "sd" });
  const cityPoints = comparisonCities().map((c) => climatePointForSeasonal(c, comparisonValues(c, "seasonal_mean_temp_c"), comparisonValues(c, "seasonal_precip_mm"), { type: "city", row: componentScores(c) }));
  const sdPoints = [today, sdFuture];
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
    svg.append("g").attr("class", "uncertainty-layer");
    svg.append("path").attr("class", "traj-path").attr("fill", "none").attr("stroke", COLORS.accent).attr("stroke-width", 4).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
    svg.append("g").attr("class", "city-layer");
    svg.append("g").attr("class", "sd-layer");
    svg.append("text").attr("class", "chart-label").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 18).attr("text-anchor", "middle").text("Average seasonal temperature (°C)");
    svg.append("text").attr("class", "chart-label").attr("x", margin.left).attr("y", 20).text("Annual precipitation (mm)");
  }
  const xTicks = [14, 16, 18, 20, 22, 24, 26, 28, 30].filter((t) => t >= xDomain[0] && t <= xDomain[1]);
  const yTicks = [200, 400, 600, 800, 1000, 1200].filter((t) => t >= yDomain[0] && t <= yDomain[1]);
  const grid = svg.select(".grid");
  grid.selectAll(".gx").data(xTicks).join("line").attr("class", "gx grid-line").attr("y1", margin.top).attr("y2", height - margin.bottom).attr("x1", x).attr("x2", x);
  grid.selectAll(".gxl").data(xTicks).join("text").attr("class", "gxl chart-label").attr("text-anchor", "middle").attr("y", height - 34).attr("x", x).text((d) => `${d}°`);
  grid.selectAll(".gy").data(yTicks).join("line").attr("class", "gy grid-line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y);
  grid.selectAll(".gyl").data(yTicks).join("text").attr("class", "gyl chart-label").attr("text-anchor", "end").attr("x", margin.left - 10).attr("y", (d) => y(d) + 4).text((d) => d);

  // model-uncertainty boxes on the future anchors (p10–p90 spread across the CMIP6 ensemble)
  const bandBoxes = [state.period].map((P) => {
    const tb = futureBand("seasonal_mean_temp_c", P), pb = futureBand("seasonal_precip_mm", P);
    if (!tb || !pb) return null;
    const lo = climatePointForSeasonal("", tb.lo, pb.lo), hi = climatePointForSeasonal("", tb.hi, pb.hi);
    return { P, x0: x(lo.avgTemp), x1: x(hi.avgTemp), ylo: y(lo.annualPrecip), yhi: y(hi.annualPrecip) };
  }).filter(Boolean);
  svg.select(".uncertainty-layer").selectAll(".ubox").data(bandBoxes, (d) => d.P).join(
    (enter) => enter.append("rect").attr("class", "ubox").attr("rx", 10).attr("fill", COLORS.accent).attr("opacity", 0.1).attr("stroke", COLORS.accent).attr("stroke-opacity", 0.4).attr("stroke-dasharray", "3 4")
  ).transition().duration(700)
    .attr("x", (d) => Math.min(d.x0, d.x1)).attr("width", (d) => Math.max(2, Math.abs(d.x1 - d.x0)))
    .attr("y", (d) => Math.min(d.ylo, d.yhi)).attr("height", (d) => Math.max(2, Math.abs(d.ylo - d.yhi)));

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

  // city labels — every comparison city, marked "today"
  svg.select(".city-layer").selectAll(".clbl").data(cityPoints, (d) => d.label)
    .join("text").attr("class", (d) => `clbl chart-label ${d.label === state.selectedCity ? "selected-label" : "today-label"}`).text((d) => `${d.label} today`)
    .transition().duration(600).attr("x", (d) => x(d.avgTemp) + 9).attr("y", (d) => y(d.annualPrecip) - 7);

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
  const w = normWeights();
  const seg1 = (d) => w.temp * d.tempScore;
  const seg2 = (d) => w.temp * d.tempScore + w.rain * d.rainScore;
  groups.select(".bar-temp").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("width", (d) => Math.max(1, x(seg1(d)) - x(0)));
  groups.select(".bar-rain").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("x", (d) => x(seg1(d))).attr("width", (d) => Math.max(1, x(seg2(d)) - x(seg1(d))));
  groups.select(".bar-heat").attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78).transition(t).attr("x", (d) => x(seg2(d))).attr("width", (d) => Math.max(1, x(d.index) - x(seg2(d))));
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
  // Close-up zoom on the three nearest twins: San Diego, Los Angeles, Riverside.
  // Fit to a MultiPoint of the padded corners (winding-immune, unlike a Polygon).
  const focusLocs = cityLocations().filter((l) => FOCUS_CITIES.includes(l.city));
  const fLons = focusLocs.map((l) => l.lon), fLats = focusLocs.map((l) => l.lat);
  const padLon = 1.0, padLat = 0.7;
  const focusGeo = { type: "MultiPoint", coordinates: [
    [Math.min(...fLons) - padLon, Math.min(...fLats) - padLat],
    [Math.max(...fLons) + padLon, Math.max(...fLats) + padLat]
  ] };
  const projection = d3.geoMercator().fitExtent([[26, 26], [width - 26, height - 26]], focusGeo);
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

  const locations = cityLocations().filter((l) => FOCUS_CITIES.includes(l.city));
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
  const rows = bestTwinAtYear(state.year).filter((r) => FOCUS_CITIES.includes(r.city));
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

  const twins = rankingRows().slice(0, 2);            // the two closest twins (Los Angeles, Riverside by default)
  if (!twins.length) return;
  const twinColors = [COLORS.heat, COLORS.rain];
  const mkSeries = (metric) => [
    { name: `San Diego ${profileName()}`, values: futureValues(metric), color: COLORS.accent, band: futureBand(metric) },
    ...twins.map((tw, i) => ({ name: `${tw.city} today`, values: comparisonValues(tw.city, metric), color: twinColors[i] }))
  ];

  if (svg.select(".fp-bg").empty()) {
    svg.append("rect").attr("class", "fp-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "fp-temp");
    svg.append("g").attr("class", "fp-rain");
    svg.append("g").attr("class", "fp-legend");
  }
  const legend = svg.select(".fp-legend"); legend.selectAll("*").remove();
  const legendItems = [{ name: `San Diego ${profileName()}`, color: COLORS.accent }, ...twins.map((tw, i) => ({ name: `${tw.city} today`, color: twinColors[i] }))];
  legendItems.forEach((it, i) => {
    const ly = 18 + i * 19;
    legend.append("rect").attr("x", width - 252).attr("y", ly - 10).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", it.color);
    legend.append("text").attr("class", "chart-label").attr("x", width - 234).attr("y", ly).text(it.name);
  });
  const wy = 18 + legendItems.length * 19;
  legend.append("line").attr("x1", width - 246).attr("x2", width - 246).attr("y1", wy - 9).attr("y2", wy + 5).attr("stroke", COLORS.ink).attr("stroke-width", 1.4).attr("opacity", 0.78);
  legend.append("text").attr("class", "chart-label").attr("x", width - 234).attr("y", wy + 2).text("Model range (p10–p90)");

  drawGroupedBars(svg.select(".fp-temp"), { x: margin.left, y: 64, width: width - margin.left - margin.right, height: 156 }, mkSeries("seasonal_mean_temp_c"), "Seasonal temperature (°C)");
  drawGroupedBars(svg.select(".fp-rain"), { x: margin.left, y: 290, width: width - margin.left - margin.right, height: 156 }, mkSeries("seasonal_precip_mm"), "Seasonal precipitation (mm)");
}
function drawGroupedBars(g, box, series, label) {
  const allVals = series.flatMap((s) => SEASONS.flatMap((se) => [s.values[se], s.band ? s.band.hi[se] : undefined]));
  const maxValue = Math.max(...allVals.filter(Number.isFinite)) * 1.18 || 1;
  const y = d3.scaleLinear([0, maxValue], [box.y + box.height, box.y]);
  const groupWidth = box.width / SEASONS.length;
  const n = series.length;
  const slot = Math.min(34, (groupWidth * 0.74) / n);
  const bw = Math.max(6, slot - 3);
  const t = d3.transition().duration(700).ease(d3.easeCubicOut);
  const isTemp = label.includes("temp");

  g.selectAll(".fpgrid").data([0, maxValue / 2, maxValue]).join("line").attr("class", "fpgrid grid-line").attr("x1", box.x).attr("x2", box.x + box.width).attr("y1", y).attr("y2", y);
  g.selectAll(".fpgl").data([0, maxValue / 2, maxValue]).join("text").attr("class", "fpgl chart-label").attr("text-anchor", "end").attr("x", box.x - 10).attr("y", (d) => y(d) + 4).text((d) => d.toFixed(0));
  g.selectAll(".fptitle").data([label]).join("text").attr("class", "fptitle chart-label selected-label").attr("x", box.x).attr("y", box.y - 14).text((d) => d);
  g.selectAll(".fpseason").data(SEASONS).join("text").attr("class", "fpseason chart-label").attr("text-anchor", "middle").attr("x", (se, i) => box.x + groupWidth * i + groupWidth / 2).attr("y", box.y + box.height + 24).text((se) => se);

  const bars = [];
  SEASONS.forEach((se, si) => {
    const center = box.x + groupWidth * si + groupWidth / 2;
    const totalW = slot * n;
    series.forEach((s, k) => bars.push({
      key: `${se}-${k}`, se, color: s.color, v: s.values[se],
      band: s.band ? { lo: s.band.lo[se], hi: s.band.hi[se] } : null,
      x: center - totalW / 2 + k * slot
    }));
  });

  g.selectAll(".gbar").data(bars, (d) => d.key).join(
    (enter) => enter.append("rect").attr("class", "gbar").attr("rx", 5).attr("y", y(0)).attr("height", 0)
  ).attr("fill", (d) => d.color).attr("x", (d) => d.x).attr("width", bw)
    .transition(t).attr("y", (d) => y(d.v)).attr("height", (d) => Math.max(0, y(0) - y(d.v)));

  // p10–p90 model-uncertainty whiskers on the San Diego (future) bar
  const wbars = bars.filter((d) => d.band);
  const cx = (d) => d.x + bw / 2;
  g.selectAll(".gwhisk").data(wbars, (d) => d.key).join((e) => e.append("line").attr("class", "gwhisk"))
    .attr("stroke", COLORS.ink).attr("stroke-width", 1.4).attr("opacity", 0.78)
    .attr("x1", cx).attr("x2", cx).transition(t).attr("y1", (d) => y(d.band.lo)).attr("y2", (d) => y(d.band.hi));
  g.selectAll(".gcaplo").data(wbars, (d) => d.key).join((e) => e.append("line").attr("class", "gcaplo"))
    .attr("stroke", COLORS.ink).attr("stroke-width", 1.4).attr("opacity", 0.78)
    .attr("x1", (d) => cx(d) - 4).attr("x2", (d) => cx(d) + 4).transition(t).attr("y1", (d) => y(d.band.lo)).attr("y2", (d) => y(d.band.lo));
  g.selectAll(".gcaphi").data(wbars, (d) => d.key).join((e) => e.append("line").attr("class", "gcaphi"))
    .attr("stroke", COLORS.ink).attr("stroke-width", 1.4).attr("opacity", 0.78)
    .attr("x1", (d) => cx(d) - 4).attr("x2", (d) => cx(d) + 4).transition(t).attr("y1", (d) => y(d.band.hi)).attr("y2", (d) => y(d.band.hi));

  // per-season hover targets
  g.selectAll(".fphit").data(SEASONS, (s) => s).join((e) => e.append("rect").attr("class", "fphit").attr("fill", "transparent"))
    .attr("x", (s, i) => box.x + groupWidth * i).attr("width", groupWidth).attr("y", box.y).attr("height", box.height).style("cursor", "default")
    .on("mouseenter", (e, s) => {
      const dg = isTemp ? 1 : 0;
      const lines = series.map((ser) => `<span>${ser.name}: ${Number.isFinite(ser.values[s]) ? ser.values[s].toFixed(dg) : "—"}${isTemp ? "°" : " mm"}</span>`).join("");
      showTip(`<strong>${s}</strong>${lines}`, e);
    })
    .on("mousemove", moveTip).on("mouseleave", hideTip);
}

// ───────────────────────── Step 5: how long does the twin last? ─────────────────────────
function drawDifference() {
  const svgNode = byId("differenceSvg");
  const width = 760, height = 500;
  const margin = { top: 76, right: 30, bottom: 70, left: 58 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const svg = d3.select(svgNode);

  // best achievable twin (max Climate Twin Index over present-day cities) for each scenario × period
  const combos = [];
  SCENARIOS.forEach((sc) => PERIODS.forEach((per) => {
    const ft = futureValues("seasonal_mean_temp_c", per, sc.code);
    const fr = futureValues("seasonal_precip_mm", per, sc.code);
    const best = comparisonCities().map((c) => scoreForProfile(c, ft, fr)).sort((a, b) => b.index - a.index)[0];
    combos.push({ scenario: sc.code, scenarioLabel: sc.label, period: per, index: best ? best.index : 0, city: best ? best.city : "—" });
  }));

  const x0 = d3.scaleBand().domain(SCENARIOS.map((s) => s.code)).range([margin.left, width - margin.right]).paddingInner(0.3).paddingOuter(0.12);
  const x1 = d3.scaleBand().domain(PERIODS).range([0, x0.bandwidth()]).padding(0.2);
  const y = d3.scaleLinear([0, 100], [height - margin.bottom, margin.top]);
  const color = (v) => d3.interpolateRgb(COLORS.heat, COLORS.accent)(clamp(v / 100, 0, 1));
  const t = d3.transition().duration(700).ease(d3.easeCubicOut);
  const bx = (d) => x0(d.scenario) + x1(d.period);
  const isCurrent = (d) => d.scenario === state.scenario && d.period === state.period;

  if (svg.select(".decay-bg").empty()) {
    svg.append("rect").attr("class", "decay-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "decay-grid");
    svg.append("g").attr("class", "decay-bars");
    svg.append("g").attr("class", "decay-axis");
    svg.append("text").attr("class", "decay-title chart-label selected-label").attr("x", margin.left).attr("y", 30).text("How good is San Diego's best-matching twin?");
    svg.append("text").attr("class", "decay-sub chart-label").attr("x", margin.left).attr("y", 50).attr("opacity", 0.75).text("Highest Climate Twin Index among all present-day cities — by scenario and period");
    svg.append("text").attr("class", "chart-label").attr("transform", `translate(16,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Best match (0–100)");
  }

  const grid = svg.select(".decay-grid");
  grid.selectAll("line").data([0, 25, 50, 75, 100]).join("line").attr("class", "grid-line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y);
  grid.selectAll("text").data([0, 25, 50, 75, 100]).join("text").attr("class", "chart-label").attr("text-anchor", "end").attr("x", margin.left - 8).attr("y", (d) => y(d) + 4).text((d) => d);

  const axis = svg.select(".decay-axis");
  axis.selectAll(".scglabel").data(SCENARIOS).join("text").attr("class", "scglabel chart-label selected-label").attr("text-anchor", "middle")
    .attr("x", (s) => x0(s.code) + x0.bandwidth() / 2).attr("y", height - margin.bottom + 38).text((s) => s.code);
  axis.selectAll(".scglabel2").data(SCENARIOS).join("text").attr("class", "scglabel2 chart-label").attr("text-anchor", "middle").attr("opacity", 0.7)
    .attr("x", (s) => x0(s.code) + x0.bandwidth() / 2).attr("y", height - margin.bottom + 54).text((s) => s.label);

  const groups = svg.select(".decay-bars").selectAll(".decay-group").data(combos, (d) => d.scenario + d.period).join((enter) => {
    const grp = enter.append("g").attr("class", "decay-group").style("cursor", "pointer");
    grp.append("rect").attr("class", "decay-bar").attr("rx", 6).attr("y", y(0)).attr("height", 0);
    grp.append("text").attr("class", "decay-city chart-label").attr("text-anchor", "middle");
    grp.append("text").attr("class", "decay-score chart-label selected-label").attr("text-anchor", "middle");
    grp.append("text").attr("class", "decay-per chart-label").attr("text-anchor", "middle").attr("opacity", 0.75);
    return grp;
  });
  groups.select(".decay-bar").attr("x", bx).attr("width", x1.bandwidth()).attr("fill", (d) => color(d.index))
    .attr("stroke", (d) => isCurrent(d) ? COLORS.ink : "none").attr("stroke-width", (d) => isCurrent(d) ? 3 : 0)
    .transition(t).attr("y", (d) => y(d.index)).attr("height", (d) => Math.max(0, y(0) - y(d.index)));
  groups.select(".decay-city").attr("x", (d) => bx(d) + x1.bandwidth() / 2).text((d) => d.city).transition(t).attr("y", (d) => y(d.index) - 22);
  groups.select(".decay-score").attr("x", (d) => bx(d) + x1.bandwidth() / 2).text((d) => d.index.toFixed(0)).transition(t).attr("y", (d) => y(d.index) - 8);
  groups.select(".decay-per").attr("x", (d) => bx(d) + x1.bandwidth() / 2).attr("y", height - margin.bottom + 18).text((d) => d.period);
  groups.on("click", (e, d) => { state.scenario = d.scenario; state.period = d.period; ensureSelectedCity(); updateAll(); })
    .on("mouseenter", (e, d) => showTip(`<strong>${d.scenarioLabel} · ${d.period}</strong><span>Closest twin: ${d.city}</span><span>Best match ${d.index.toFixed(0)}/100</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip);
}

// ───────────────────────── orchestration ─────────────────────────
function drawAll() {
  drawTrajectory(); drawRanking(); drawMap(); drawFingerprint(); drawDifference();
}
function updateAll() {
  ensureSelectedCity(); setButtonStates(); updateSummary(); drawAll();
}
function boot() {
  if (!Object.keys(CITIES).length) {
    byId("currentFinding").textContent = "Dataset did not load.";
    byId("currentDetail").textContent = "Check that data.js is present next to index.html.";
    return;
  }
  initControls(); initScrollSteps(); ensureSelectedCity(); setActiveView(state.activeView); updateAll();
}
boot();
