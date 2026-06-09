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
const TRAVEL_MAX_YEAR_BY_PERIOD = {
  "2050": 2050,
  "2080s": 2085
};
const TWIN_TIMELINE_YEARS = [2030, 2040, 2050, 2060, 2070, 2080];
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
    annotation: "The path runs from San Diego today to its selected future period. Every other city sits at its present-day climate. This view only plots annual averages, so the nearest dot is just a first guess, Step 2 compares the full seasonal pattern and can change the answer."
  },
  ranking: {
    label: "Step 2 of 5",
    question: "Which city is the closest climate twin?",
    annotation: "Los Angeles, then Riverside, not the desert cities. The ranking re-sorts when you change the scenario, the period, or the weights below."
  },
  map: {
    label: "Step 3 of 5",
    question: "When does San Diego's climate arrive in Los Angeles?",
    annotation: "Drag the year or press play. The marker starts on San Diego and drifts toward whichever nearby city, Los Angeles or Riverside, its climate grows to resemble that year."
  },
  fingerprint: {
    label: "Step 4 of 5",
    question: "How does San Diego's future compare with its two closest twins?",
    annotation: "San Diego's projection sits beside Los Angeles and Riverside today, season by season. Whiskers show the model range. A city can match on temperature yet still differ on rainfall."
  },
  difference: {
    label: "Step 5 of 5",
    question: "How long does the twin last?",
    annotation: "Each bar is the best match San Diego can find in the selected emissions scenario, one decade at a time. Use the scenario buttons to compare how quickly the closest twin fades."
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
function travelMaxYear(period = state.period) { return TRAVEL_MAX_YEAR_BY_PERIOD[period] || 2085; }

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
let weightRaf = null;
function scheduleWeightUpdate() {
  updateWeightPcts();                       // cheap: update % labels immediately
  if (weightRaf) return;                    // coalesce chart redraws to one per frame
  weightRaf = requestAnimationFrame(() => { weightRaf = null; updateAll(); });
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
function syncYearSlider() {
  const slider = byId("yearSlider");
  const max = travelMaxYear();
  if (slider) {
    const min = Number(slider.min);
    state.year = clamp(state.year, min, max);
    slider.max = String(max);
    slider.value = String(state.year);
  }
  const currentLabel = byId("yearLabel");
  if (currentLabel) currentLabel.textContent = state.year;
  const maxLabel = byId("yearMaxLabel");
  if (maxLabel) maxLabel.textContent = max;
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
    b.addEventListener("click", () => { stopPlay(); state.period = period; ensureSelectedCity(); updateAll(); });
    periodButtons.appendChild(b);
  });

  // Weight sliders, let the reader redefine what "similar" means
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
      input.addEventListener("input", () => { state.weights[wd.key] = Number(input.value) / 100; scheduleWeightUpdate(); });
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
    syncYearSlider();
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
  byId("currentDetail").textContent = `${selected.city} is selected with a Climate Twin Index of ${selected.index.toFixed(1)} out of 100. The desert cities rank lower because the index compares full seasonal patterns and summer heat, not just annual averages.`;
  byId("selectedTwinBadge").textContent = `${state.selectedCity}: ${selected.index.toFixed(1)}`;
}

// ───────────────────────── shared chart chrome ─────────────────────────
function climatePointForSeasonal(label, tempValues, precipValues, extra = {}) {
  return { label, avgTemp: mean(SEASONS.map((s) => tempValues[s])), annualPrecip: sum(SEASONS.map((s) => precipValues[s])), ...extra };
}

// Nudge overlapping scatter labels apart vertically (cheap iterative de-collision).
function declutterLabels(labels, gap, minY, maxY) {
  for (let iter = 0; iter < 60; iter++) {
    labels.sort((a, b) => a.y - b.y);
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && Math.abs(b.y - a.y) < gap) {
          const push = (gap - Math.abs(b.y - a.y)) / 2 + 0.4;
          a.y -= push; b.y += push; moved = true;
        }
      }
    }
    labels.forEach((d) => { d.y = clamp(d.y, minY, maxY); });
    if (!moved) break;
  }
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
    svg.append("g").attr("class", "label-layer");
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

  // model-uncertainty boxes on the future anchors (p10 to p90 spread across the CMIP6 ensemble)
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
  // All comparison cities are plotted uniformly here. Step 1 deliberately names no winner,
  // because annual averages alone are a misleading guide (the nearest dot is often a desert
  // city whose seasonal pattern and summer heat make it a poor twin). Step 2 picks the twin.
  const cd = svg.select(".city-layer").selectAll(".cdot").data(cityPoints, (d) => d.label);
  cd.join(
    (enter) => enter.append("circle").attr("class", "cdot").attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip)).attr("r", 0)
      .call((s) => s.transition().duration(600).attr("r", 6)),
    (update) => update.call((s) => s.transition().duration(600).attr("cx", (d) => x(d.avgTemp)).attr("cy", (d) => y(d.annualPrecip)).attr("r", 6))
  )
    .attr("fill", COLORS.surface)
    .attr("stroke", COLORS.faint)
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("mouseenter", (e, d) => showTip(`<strong>${d.label}</strong><span>${d.avgTemp.toFixed(1)}°C · ${d.annualPrecip.toFixed(0)} mm/yr</span><span>Match ${d.row.index.toFixed(0)}/100</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip)
    .on("click", (e, d) => { state.selectedCity = d.label; updateAll(); });

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

  // unified, de-cluttered labels with leader lines (fixes overlap when cities sit close in climate space)
  const labelData = [
    ...cityPoints.map((d) => ({ text: `${d.label} today`, ax: x(d.avgTemp), ay: y(d.annualPrecip), strong: false })),
    ...sdPoints.map((d, i) => ({ text: d.label, ax: x(d.avgTemp), ay: y(d.annualPrecip), strong: true, below: i === 0 }))
  ];
  labelData.forEach((d) => {
    d.w = d.text.length * (d.strong ? 6.7 : 5.9) + 4;
    d.right = d.ax + 12 + d.w <= width - 6;
    d.x = d.right ? d.ax + 10 : d.ax - 10 - d.w;
    d.y = d.ay + (d.below ? 17 : -7);
  });
  declutterLabels(labelData, 14, margin.top + 6, height - margin.bottom - 4);
  const ll = svg.select(".label-layer");
  ll.selectAll(".llead").data(labelData).join("line").attr("class", "llead")
    .attr("stroke", COLORS.faint).attr("stroke-width", 1)
    .attr("opacity", (d) => (Math.abs((d.y - 4) - d.ay) > 9 || !d.right) ? 0.55 : 0)
    .attr("x1", (d) => d.ax).attr("y1", (d) => d.ay)
    .attr("x2", (d) => d.right ? d.x - 2 : d.x + d.w + 2).attr("y2", (d) => d.y - 4);
  ll.selectAll(".llbl").data(labelData).join("text")
    .attr("class", (d) => `llbl chart-label ${d.strong ? "selected-label" : "today-label"}`)
    .attr("text-anchor", "start").attr("x", (d) => d.x).attr("y", (d) => d.y).text((d) => d.text);
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
    const score = row ? row.index : undefined;
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
      .attr("aria-label", row ? `${d.city}, climate match ${score.toFixed(1)}` : d.city);
    if (row) {
      sel.on("click", () => { state.selectedCity = d.city; updateAll(); })
        .on("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.selectedCity = d.city; updateAll(); } })
        .on("mouseenter", (e) => showTip(`<strong>${d.city}</strong><span>Climate match ${score.toFixed(0)}/100</span>`, e))
        .on("mousemove", moveTip).on("mouseleave", hideTip);
    } else { sel.on("mouseenter", null).on("mouseleave", null); }
  });

  // moving "future San Diego" marker
  const ghost = svg.append("g").attr("class", "ghost").style("pointer-events", "none");
  ghost.append("circle").attr("class", "ghost-halo").attr("r", 16).attr("fill", COLORS.heat).attr("opacity", 0.16);
  ghost.append("circle").attr("class", "ghost-core").attr("r", 7).attr("fill", COLORS.heat).attr("stroke", "#fff").attr("stroke-width", 2);
  ghost.append("text").attr("class", "ghost-label map-label selected-label").attr("y", -16).attr("text-anchor", "middle");

  svg.append("text").attr("class", "chart-label selected-label").attr("x", width - 26).attr("y", 26).attr("text-anchor", "end").text("Darker = closer climate match");

  updateTravel(false);
}

function updateTravel(animate) {
  if (!mapProjection || state.activeView !== "map") return;
  const svg = d3.select(byId("mapSvg"));
  const ghost = svg.select(".ghost"); if (ghost.empty()) return;

  // San Diego's climate at this year, scored against the three map cities (itself + its two
  // nearest twins). "San Diego" scores its own present-day climate, so it reads 100 at the
  // start and falls as the projection warms away from today.
  const prof = sdProfileAtYear(state.year);
  const locs = new Map(cityLocations().map((l) => [l.city, l]));
  const cands = FOCUS_CITIES
    .map((city) => ({ city, index: scoreForProfile(city, prof.temp, prof.rain).index, loc: locs.get(city) }))
    .filter((c) => c.loc);

  // Place the marker at a similarity-weighted blend of the three city points, so it starts
  // on San Diego and glides toward whichever city its climate grows to resemble.
  const T = 6;
  const ws = cands.map((c) => Math.exp(c.index / T));
  const wsum = ws.reduce((a, b) => a + b, 0) || 1;
  let tx = 0, ty = 0;
  cands.forEach((c, i) => { const [px, py] = mapProjection([c.loc.lon, c.loc.lat]); tx += (ws[i] / wsum) * px; ty += (ws[i] / wsum) * py; });

  const self = cands.find((c) => c.city === "San Diego");
  const others = cands.filter((c) => c.city !== "San Diego").sort((a, b) => b.index - a.index);
  const topOther = others[0];
  const stillSelf = self && topOther && self.index >= topOther.index;

  const gsel = animate ? ghost.transition().duration(650).ease(d3.easeCubicInOut) : ghost;
  gsel.attr("transform", `translate(${tx},${ty})`);
  ghost.select(".ghost-label").text(`SD ${state.year}`);

  // recolor and re-ring the city dots by their match to San Diego at THIS year, so the whole
  // map responds to the slider (the lead twin gets the orange ring)
  svg.selectAll(".city-node").select("circle").each(function (d) {
    const c = cands.find((k) => k.city === d.city);
    const isSD = d.city === "San Diego";
    const isLead = !stillSelf && topOther && d.city === topOther.city;
    d3.select(this)
      .attr("fill", isSD ? COLORS.heat : (c ? scoreColor(c.index) : COLORS.surface))
      .attr("r", isSD ? 9 : (c ? 5 + c.index / 9 : 5))
      .attr("stroke", isLead ? COLORS.heat : (isSD ? COLORS.ink : "#ffffff"))
      .attr("stroke-width", isLead ? 3.4 : (isSD ? 2.6 : 1.6));
  });

  // trail from San Diego to the marker (how far the climate has drifted)
  const sd = locs.get("San Diego");
  const [sx, sy] = mapProjection([sd.lon, sd.lat]);
  let trail = svg.select(".trail-layer").select(".trail-line");
  if (trail.empty()) trail = svg.select(".trail-layer").append("line").attr("class", "trail-line").attr("stroke", COLORS.heat).attr("stroke-width", 2).attr("stroke-dasharray", "4 6").attr("opacity", 0.6);
  trail.attr("x1", sx).attr("y1", sy).transition().duration(animate ? 650 : 0).attr("x2", tx).attr("y2", ty);

  // readout
  const ro = byId("travelReadout");
  if (ro) {
    if (stillSelf) ro.innerHTML = `Around <strong>${state.year}</strong>, San Diego's climate still feels like its own.`;
    else ro.innerHTML = `By <strong>${state.year}</strong>, San Diego's climate most resembles <strong>${topOther.city}</strong> today <span class="ro-score">match ${topOther.index.toFixed(0)}/100</span>`;
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

  const ranked = rankingRows();
  if (!ranked.length) return;
  const names = ranked.map((r) => r.city);
  // Primary = the selected city (defaults to the top twin, Los Angeles); secondary = next-best twin.
  const primary = (state.selectedCity && names.includes(state.selectedCity)) ? state.selectedCity : names[0];
  const secondary = names.find((c) => c !== primary) || names[0];
  const twinCities = [primary, secondary];
  const twinColors = [COLORS.heat, COLORS.rain];
  const mkSeries = (metric) => [
    { name: `San Diego ${profileName()}`, values: futureValues(metric), color: COLORS.accent, band: futureBand(metric) },
    ...twinCities.map((c, i) => ({ name: `${c} today`, values: comparisonValues(c, metric), color: twinColors[i] }))
  ];

  if (svg.select(".fp-bg").empty()) {
    svg.append("rect").attr("class", "fp-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "fp-temp");
    svg.append("g").attr("class", "fp-rain");
    svg.append("g").attr("class", "fp-legend");
  }
  const legend = svg.select(".fp-legend"); legend.selectAll("*").remove();
  const legendItems = [{ name: `San Diego ${profileName()}`, color: COLORS.accent }, ...twinCities.map((c, i) => ({ name: `${c} today`, color: twinColors[i] }))];
  legendItems.forEach((it, i) => {
    const ly = 18 + i * 19;
    legend.append("rect").attr("x", width - 252).attr("y", ly - 10).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", it.color);
    legend.append("text").attr("class", "chart-label").attr("x", width - 234).attr("y", ly).text(it.name);
  });
  const wy = 18 + legendItems.length * 19;
  legend.append("line").attr("x1", width - 246).attr("x2", width - 246).attr("y1", wy - 9).attr("y2", wy + 5).attr("stroke", COLORS.ink).attr("stroke-width", 1.4).attr("opacity", 0.78);
  legend.append("text").attr("class", "chart-label").attr("x", width - 234).attr("y", wy + 2).text("Model range (p10 to p90)");

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

  // p10 to p90 model-uncertainty whiskers on the San Diego (future) bar
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

  // Best achievable twin by decade for the currently selected emissions scenario.
  const scenario = scenarioMeta();
  const rows = TWIN_TIMELINE_YEARS.map((year) => {
    const prof = sdProfileAtYear(year, state.scenario);
    const best = comparisonCities().map((c) => scoreForProfile(c, prof.temp, prof.rain)).sort((a, b) => b.index - a.index)[0];
    return {
      scenario: state.scenario,
      scenarioLabel: scenario.label,
      year,
      period: year <= travelMaxYear("2050") ? "2050" : "2080s",
      index: best ? best.index : 0,
      city: best ? best.city : "—"
    };
  });

  const x = d3.scaleBand().domain(TWIN_TIMELINE_YEARS).range([margin.left, width - margin.right]).padding(0.24);
  const y = d3.scaleLinear([0, 100], [height - margin.bottom, margin.top]);
  const color = (v) => d3.interpolateRgb(COLORS.heat, COLORS.accent)(clamp(v / 100, 0, 1));
  const t = d3.transition().duration(700).ease(d3.easeCubicOut);
  const bx = (d) => x(d.year);
  const isCurrent = (d) => d.year === state.year;

  if (svg.select(".decay-bg").empty()) {
    svg.append("rect").attr("class", "decay-bg").attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);
    svg.append("g").attr("class", "decay-grid");
    svg.append("g").attr("class", "decay-bars");
    svg.append("g").attr("class", "decay-axis");
    svg.append("text").attr("class", "decay-title chart-label selected-label").attr("x", margin.left).attr("y", 30).text("How good is San Diego's best-matching twin?");
    svg.append("text").attr("class", "decay-sub chart-label").attr("x", margin.left).attr("y", 50).attr("opacity", 0.75);
    svg.append("text").attr("class", "chart-label").attr("transform", `translate(16,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Best match (0 to 100)");
    const dleg = svg.append("g").attr("class", "decay-legend");
    dleg.append("rect").attr("x", width - 204).attr("y", 22).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", COLORS.heat);
    dleg.append("text").attr("class", "chart-label").attr("x", width - 188).attr("y", 32).text("weak");
    dleg.append("rect").attr("x", width - 138).attr("y", 22).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", COLORS.accent);
    dleg.append("text").attr("class", "chart-label").attr("x", width - 122).attr("y", 32).text("strong match");
  }

  const grid = svg.select(".decay-grid");
  grid.selectAll("line").data([0, 25, 50, 75, 100]).join("line").attr("class", "grid-line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y).attr("y2", y);
  grid.selectAll("text").data([0, 25, 50, 75, 100]).join("text").attr("class", "chart-label").attr("text-anchor", "end").attr("x", margin.left - 8).attr("y", (d) => y(d) + 4).text((d) => d);

  const axis = svg.select(".decay-axis");
  axis.selectAll("*").remove();
  axis.selectAll(".decade-label").data(TWIN_TIMELINE_YEARS).join("text").attr("class", "decade-label chart-label selected-label").attr("text-anchor", "middle")
    .attr("x", (year) => x(year) + x.bandwidth() / 2).attr("y", height - margin.bottom + 24).text((year) => year);
  axis.append("text").attr("class", "chart-label").attr("text-anchor", "middle").attr("opacity", 0.7)
    .attr("x", (margin.left + width - margin.right) / 2).attr("y", height - margin.bottom + 50).text(`Selected scenario: ${state.scenario} · ${scenario.label}`);
  svg.select(".decay-sub").text(`Highest Climate Twin Index among all present-day cities, by decade under ${scenario.label}`);

  const groups = svg.select(".decay-bars").selectAll(".decay-group").data(rows, (d) => d.year).join((enter) => {
    const grp = enter.append("g").attr("class", "decay-group").style("cursor", "pointer");
    grp.append("rect").attr("class", "decay-bar").attr("rx", 6).attr("y", y(0)).attr("height", 0);
    grp.append("text").attr("class", "decay-city chart-label").attr("text-anchor", "middle");
    grp.append("text").attr("class", "decay-score chart-label selected-label").attr("text-anchor", "middle");
    grp.append("rect").attr("class", "decay-hit").attr("fill", "transparent").style("pointer-events", "all");
    return grp;
  });
  groups.select(".decay-bar").attr("x", bx).attr("width", x.bandwidth()).attr("fill", (d) => color(d.index))
    .attr("stroke", (d) => isCurrent(d) ? COLORS.ink : "none").attr("stroke-width", (d) => isCurrent(d) ? 3 : 0)
    .transition(t).attr("y", (d) => y(d.index)).attr("height", (d) => Math.max(0, y(0) - y(d.index)));
  groups.select(".decay-city").attr("x", (d) => bx(d) + x.bandwidth() / 2).text((d) => d.city).transition(t).attr("y", (d) => y(d.index) - 22);
  groups.select(".decay-score").attr("x", (d) => bx(d) + x.bandwidth() / 2).text((d) => d.index.toFixed(0)).transition(t).attr("y", (d) => y(d.index) - 8);
  groups.select(".decay-per").remove();
  groups.select(".decay-hit").attr("x", bx).attr("y", margin.top).attr("width", x.bandwidth()).attr("height", height - margin.top - margin.bottom + 28);
  groups.on("click", (e, d) => { state.year = d.year; state.period = d.period; state.selectedCity = d.city; ensureSelectedCity(); updateAll(); })
    .on("mouseenter", (e, d) => showTip(`<strong>${d.scenarioLabel} · ${d.year}</strong><span>Closest twin: ${d.city}</span><span>Best match ${d.index.toFixed(0)}/100</span>`, e))
    .on("mousemove", moveTip).on("mouseleave", hideTip);
}

// ───────────────────────── orchestration ─────────────────────────
function drawAll() {
  drawTrajectory(); drawRanking(); drawMap(); drawFingerprint(); drawDifference();
}
function updateAll() {
  ensureSelectedCity(); setButtonStates(); syncYearSlider(); updateSummary(); drawAll();
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
