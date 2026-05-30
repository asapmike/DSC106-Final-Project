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
  {
    code: "SSP1-2.6",
    label: "Low emissions",
    detail: "Stronger climate action and lower future warming."
  },
  {
    code: "SSP2-4.5",
    label: "Moderate emissions",
    detail: "Intermediate emissions and moderate warming."
  },
  {
    code: "SSP5-8.5",
    label: "High emissions",
    detail: "Very high emissions and stronger warming."
  }
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

const WEST_MAP = [
  {
    name: "Washington",
    points: [[-124.8, 45.6], [-124.3, 48.5], [-122.7, 49.0], [-117.0, 49.0], [-117.0, 45.6]]
  },
  {
    name: "Oregon",
    points: [[-124.6, 42.0], [-124.8, 45.6], [-117.0, 45.6], [-116.5, 44.3], [-117.0, 42.0]]
  },
  {
    name: "California",
    points: [[-124.4, 42.0], [-123.7, 40.7], [-122.8, 38.9], [-122.4, 37.7], [-121.8, 36.3], [-120.7, 34.5], [-119.5, 34.0], [-117.1, 32.5], [-114.6, 32.7], [-114.1, 34.7], [-120.0, 42.0]]
  },
  {
    name: "Nevada",
    points: [[-120.0, 42.0], [-114.0, 42.0], [-114.0, 35.0], [-114.6, 35.0], [-120.0, 39.0]]
  },
  {
    name: "Arizona",
    points: [[-114.8, 37.0], [-109.0, 37.0], [-109.0, 31.3], [-114.8, 32.0], [-114.1, 34.7]]
  }
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
    question: "Where are these candidate cities?",
    annotation: "Geographic distance is not the same as climate distance. Switch the map metric to see which part of the index is driving each city."
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
  activeView: "trajectory"
};

function byId(id) {
  return document.getElementById(id);
}

function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaleLinear(domain, range) {
  if (window.d3 && typeof window.d3.scaleLinear === "function") {
    return window.d3.scaleLinear().domain(domain).range(range);
  }
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (value) => r0 + ((value - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

function recordsOf(type) {
  return rawRecords.filter((record) => record.record_type === type);
}

function profileName(period = state.period, scenario = state.scenario) {
  return `${period} ${scenario}`;
}

function scenarioMeta(code = state.scenario) {
  return SCENARIOS.find((scenario) => scenario.code === code) || SCENARIOS[0];
}

function cityLocations() {
  return recordsOf("city_location").map((record) => ({
    city: record.city,
    lat: Number(record.lat),
    lon: Number(record.lon)
  }));
}

function comparisonCities() {
  return [...new Set(recordsOf("climate_twin_similarity").map((record) => record.comparison_city))].filter(Boolean);
}

function seasonalValues(recordType, city, profile, metric, scenario) {
  const values = {};
  rawRecords.forEach((record) => {
    const scenarioMatches = !scenario || record.scenario === scenario;
    if (
      record.record_type === recordType &&
      record.city === city &&
      record.profile === profile &&
      record.metric === metric &&
      scenarioMatches
    ) {
      values[record.season] = record.value;
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
    const change = rawRecords.find((record) => (
      record.record_type === "precip_change" &&
      record.scenario === scenario &&
      record.season === season
    ));
    const pct = change ? change.value : 0;
    result[season] = future[season] / (1 + pct / 100);
  });
  return result;
}

function mean(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function sum(values) {
  return values.filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0);
}

function rmse(values) {
  return Math.sqrt(mean(values.map((value) => value * value)));
}

function completeSeasonal(values) {
  return SEASONS.every((season) => Number.isFinite(values[season]));
}

function componentScores(city) {
  const futureTemp = futureValues("seasonal_mean_temp_c");
  const futureRain = futureValues("seasonal_precip_mm");
  const cityTemp = comparisonValues(city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(city, "seasonal_precip_mm");

  if (!completeSeasonal(futureTemp) || !completeSeasonal(futureRain) || !completeSeasonal(cityTemp) || !completeSeasonal(cityRain)) {
    return { city, tempScore: 0, rainScore: 0, heatScore: 0, winterRainScore: 0, index: 0 };
  }

  const tempDistance = rmse(SEASONS.map((season) => cityTemp[season] - futureTemp[season]));
  const rainDistance = rmse(SEASONS.map((season) => (cityRain[season] - futureRain[season]) / Math.max(40, futureRain[season]))) * 100;
  const heatDistance = Math.abs(cityTemp.Summer - futureTemp.Summer);
  const winterRainDistance = Math.abs(cityRain.Winter - futureRain.Winter) / Math.max(80, futureRain.Winter) * 100;

  const tempScore = clamp(100 - tempDistance * 18, 0, 100);
  const rainScore = clamp(100 - rainDistance * 1.1, 0, 100);
  const heatScore = clamp(100 - heatDistance * 14, 0, 100);
  const winterRainScore = clamp(100 - winterRainDistance * 1.2, 0, 100);
  const index = 0.6 * tempScore + 0.3 * rainScore + 0.1 * heatScore;

  return { city, tempScore, rainScore, heatScore, winterRainScore, index };
}

function rankingRows() {
  return comparisonCities()
    .map(componentScores)
    .sort((a, b) => b.index - a.index);
}

function selectedRow() {
  return rankingRows().find((row) => row.city === state.selectedCity) || rankingRows()[0];
}

function ensureSelectedCity() {
  const rows = rankingRows();
  if (!rows.length) {
    state.selectedCity = null;
    return;
  }
  if (!state.selectedCity || !rows.some((row) => row.city === state.selectedCity)) {
    state.selectedCity = rows[0].city;
  }
}

function scoreColor(score) {
  const lightness = clamp(82 - score * 0.38, 34, 82);
  const saturation = clamp(34 + score * 0.35, 34, 72);
  return `hsl(174, ${saturation}%, ${lightness}%)`;
}

function metricLabel(key = state.metric) {
  return (METRICS.find((metric) => metric.key === key) || METRICS[0]).label;
}

function setButtonStates() {
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.scenario === state.scenario));
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
  });
  document.querySelectorAll("[data-metric]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.metric === state.metric));
  });
}

function initControls() {
  const scenarioButtons = byId("scenarioButtons");
  SCENARIOS.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button scenario-button";
    button.dataset.scenario = scenario.code;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span>${scenario.code}</span><small>${scenario.label}</small>`;
    button.addEventListener("click", () => {
      state.scenario = scenario.code;
      ensureSelectedCity();
      updateAll();
    });
    scenarioButtons.appendChild(button);
  });

  const periodButtons = byId("periodButtons");
  PERIODS.forEach((period) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.dataset.period = period;
    button.textContent = period;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.period = period;
      ensureSelectedCity();
      updateAll();
    });
    periodButtons.appendChild(button);
  });

  const metricButtons = byId("metricButtons");
  METRICS.forEach((metric) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button metric-button";
    button.dataset.metric = metric.key;
    button.textContent = metric.label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.metric = metric.key;
      updateAll();
    });
    metricButtons.appendChild(button);
  });

  byId("resetButton").addEventListener("click", () => {
    state.scenario = "SSP5-8.5";
    state.period = "2080s";
    state.metric = "index";
    state.activeView = "trajectory";
    state.selectedCity = null;
    ensureSelectedCity();
    setActiveView(state.activeView);
    updateAll();
    // scroll back to top of story
    document.querySelector(".story-steps")?.firstElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function initScrollSteps() {
  const steps = document.querySelectorAll(".story-step");
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) {
      const view = visible.target.dataset.view;
      if (view && view !== state.activeView) {
        state.activeView = view;
        setActiveView(view);
        if (view === "ranking") ensureSelectedCity();
        updateAll();
      }
    }
  }, {
    rootMargin: "-30% 0px -30% 0px",
    threshold: [0.1, 0.3, 0.5]
  });

  steps.forEach((step) => observer.observe(step));
}

function setActiveView(view) {
  const meta = VIEW_META[view] || VIEW_META.trajectory;
  byId("viewLabel").textContent = meta.label;
  byId("activeQuestion").textContent = meta.question;
  byId("activeAnnotation").textContent = meta.annotation;
  document.querySelector(".sticky-stage")?.setAttribute("data-view", view);

  document.querySelectorAll(".story-step").forEach((step) => {
    step.classList.toggle("is-active", step.dataset.view === view);
  });
  document.querySelectorAll(".viz-panel").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.classList.toggle("is-active", active);
  });

  // Reset scroll so every panel starts from the top
  const stack = document.querySelector(".viz-stack");
  if (stack) stack.scrollTop = 0;
}

function updateSummary() {
  const rows = rankingRows();
  const top = rows[0];
  const selected = selectedRow();
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

function drawAxes(svg, width, height, margin, xTicks, yTicks, x, y, options = {}) {
  xTicks.forEach((tick) => {
    const tx = x(tick);
    svgEl("line", { x1: tx, x2: tx, y1: margin.top, y2: height - margin.bottom, class: "grid-line" }, svg);
    addText(svg, options.xFormat ? options.xFormat(tick) : String(tick), { x: tx, y: height - 14, "text-anchor": "middle", class: "chart-label" });
  });
  yTicks.forEach((tick) => {
    const ty = y(tick);
    svgEl("line", { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: "grid-line" }, svg);
    addText(svg, options.yFormat ? options.yFormat(tick) : String(tick), { x: margin.left - 10, y: ty + 4, "text-anchor": "end", class: "chart-label" });
  });
}

function climatePointForSeasonal(label, tempValues, precipValues, extra = {}) {
  return {
    label,
    avgTemp: mean(SEASONS.map((season) => tempValues[season])),
    annualPrecip: sum(SEASONS.map((season) => precipValues[season])),
    ...extra
  };
}

function drawTrajectory() {
  const svg = byId("trajectorySvg");
  const width = 760;
  const height = 430;
  const margin = { top: 32, right: 32, bottom: 58, left: 64 };
  clearSvg(svg, width, height);

  const today = climatePointForSeasonal("San Diego today", sanDiegoTodayTemp(), sanDiegoTodayPrecipEstimate(), { type: "sd" });
  const sd2050 = climatePointForSeasonal("San Diego 2050", futureValues("seasonal_mean_temp_c", "2050"), futureValues("seasonal_precip_mm", "2050"), { type: "sd" });
  const sd2080 = climatePointForSeasonal("San Diego 2080s", futureValues("seasonal_mean_temp_c", "2080s"), futureValues("seasonal_precip_mm", "2080s"), { type: "sd" });
  const cityPoints = comparisonCities().map((city) => climatePointForSeasonal(
    city,
    comparisonValues(city, "seasonal_mean_temp_c"),
    comparisonValues(city, "seasonal_precip_mm"),
    { type: "city", row: componentScores(city) }
  ));
  const points = [today, sd2050, sd2080, ...cityPoints];
  const temps = points.map((point) => point.avgTemp);
  const rains = points.map((point) => point.annualPrecip);
  const xDomain = [Math.floor(Math.min(...temps) - 1), Math.ceil(Math.max(...temps) + 1)];
  const yDomain = [Math.floor(Math.min(...rains) - 40), Math.ceil(Math.max(...rains) + 40)];
  const x = scaleLinear(xDomain, [margin.left, width - margin.right]);
  const y = scaleLinear(yDomain, [height - margin.bottom, margin.top]);
  const xTicks = [16, 18, 20, 22, 24, 26, 28].filter((tick) => tick >= xDomain[0] && tick <= xDomain[1]);
  const yTicks = [100, 200, 300, 400].filter((tick) => tick >= yDomain[0] && tick <= yDomain[1]);

  svgEl("rect", { x: 0, y: 0, width, height, rx: 18, fill: COLORS.bg }, svg);
  drawAxes(svg, width, height, margin, xTicks, yTicks, x, y, {
    xFormat: (tick) => `${tick}C`,
    yFormat: (tick) => `${tick}mm`
  });
  addText(svg, "Average seasonal temperature", { x: (margin.left + width - margin.right) / 2, y: height - 18, "text-anchor": "middle", class: "chart-label" });
  addText(svg, "Annual precipitation", { x: margin.left, y: 20, class: "chart-label" });

  cityPoints.forEach((point) => {
    const selected = point.label === state.selectedCity;
    svgEl("circle", {
      cx: x(point.avgTemp),
      cy: y(point.annualPrecip),
      r: selected ? 9 : 5.5,
      fill: selected ? COLORS.heat : COLORS.surface,
      stroke: selected ? COLORS.ink : COLORS.faint,
      "stroke-width": selected ? 2.5 : 1.5
    }, svg);
    if (selected || point.label === "Phoenix") {
      addText(svg, point.label, { x: x(point.avgTemp) + 10, y: y(point.annualPrecip) - 8, class: "chart-label selected-label" });
    }
  });

  const sdPoints = [today, sd2050, sd2080];
  const pathD = "M " + sdPoints.map((point) => `${x(point.avgTemp)},${y(point.annualPrecip)}`).join(" L ");
  const trajPath = svgEl("path", {
    d: pathD,
    fill: "none",
    stroke: COLORS.accent,
    "stroke-width": 4,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }, svg);

  // Animate the path drawing with stroke-dashoffset
  const totalLen = trajPath.getTotalLength();
  trajPath.style.strokeDasharray = totalLen;
  trajPath.style.strokeDashoffset = totalLen;
  trajPath.style.transition = "none";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      trajPath.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)";
      trajPath.style.strokeDashoffset = "0";
    });
  });

  [today, sd2050, sd2080].forEach((point, index) => {
    const circle = svgEl("circle", { cx: x(point.avgTemp), cy: y(point.annualPrecip), r: 8, fill: index === 0 ? COLORS.surface : COLORS.accent, stroke: COLORS.ink, "stroke-width": 2 }, svg);
    // Stagger dot pop-in
    circle.style.opacity = "0";
    circle.style.transform = `scale(0)`;
    circle.style.transformOrigin = `${x(point.avgTemp)}px ${y(point.annualPrecip)}px`;
    circle.style.transition = "none";
    const delay = 200 + index * 320;
    setTimeout(() => {
      circle.style.transition = "opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)";
      circle.style.opacity = "1";
      circle.style.transform = "scale(1)";
    }, delay);
    addText(svg, point.label, { x: x(point.avgTemp) + 11, y: y(point.annualPrecip) + (index === 0 ? 18 : -10), class: "chart-label selected-label" });
  });
}

function drawRanking() {
  const svgNode = byId("rankingSvg");
  const width = 760;
  const height = 430;
  const margin = { top: 46, right: 64, bottom: 54, left: 128 };
  svgNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgNode.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const rows = rankingRows();
  if (!rows.length) {
    svgNode.innerHTML = "";
    addText(svgNode, "No ranking records available.", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-label" });
    return;
  }

  const svg = d3.select(svgNode);
  const x = d3.scaleLinear([0, 100], [margin.left, width - margin.right]);
  const rowHeight = (height - margin.top - margin.bottom) / rows.length;
  const barHeight = Math.min(32, rowHeight - 12);
  const dur = 650;

  // ── One-time static chrome ─────────────────────────────────────────────────
  if (svg.select(".rank-bg").empty()) {
    svg.append("rect").attr("class", "rank-bg").attr("x", 0).attr("y", 0)
      .attr("width", width).attr("height", height).attr("rx", 18).attr("fill", COLORS.bg);

    [0, 25, 50, 75, 100].forEach((tick) => {
      const tx = x(tick);
      svg.append("line").attr("class", "grid-line")
        .attr("x1", tx).attr("x2", tx).attr("y1", margin.top).attr("y2", height - margin.bottom);
      svg.append("text").attr("class", "chart-label")
        .attr("x", tx).attr("y", height - 16).attr("text-anchor", "middle").text(String(tick));
    });

    svg.append("text").attr("class", "chart-label")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 4).attr("text-anchor", "middle").text("Climate Twin Index");

    const legend = [["Temperature", COLORS.accent], ["Rainfall", COLORS.rain], ["Summer heat", COLORS.heat]];
    legend.forEach(([label, color], i) => {
      const lx = margin.left + i * 132;
      svg.append("rect").attr("x", lx).attr("y", 18).attr("width", 12).attr("height", 12).attr("rx", 3).attr("fill", color);
      svg.append("text").attr("class", "chart-label").attr("x", lx + 18).attr("y", 29).text(label);
    });
  }

  // ── Data-bound rows ────────────────────────────────────────────────────────
  const groups = svg.selectAll(".rank-row")
    .data(rows, (d) => d.city)
    .join(
      (enter) => {
        const g = enter.append("g").attr("class", "rank-row")
          .attr("transform", (d, i) => `translate(0,${margin.top + i * rowHeight + 6})`)
          .attr("tabindex", 0).attr("role", "button");

        g.append("text").attr("class", "city-label chart-label").attr("text-anchor", "end").attr("x", margin.left - 12).attr("y", barHeight / 2 + 5);
        // Three bar segments (start at width=0 for enter animation)
        g.append("rect").attr("class", "bar-temp").attr("rx", 8)
          .attr("fill", COLORS.accent).attr("y", 0).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
        g.append("rect").attr("class", "bar-rain")
          .attr("fill", COLORS.rain).attr("y", 0).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
        g.append("rect").attr("class", "bar-heat")
          .attr("fill", COLORS.heat).attr("y", 0).attr("height", barHeight).attr("x", x(0)).attr("width", 0);
        // Score label
        g.append("text").attr("class", "rank-score chart-label selected-label").attr("y", barHeight / 2 + 5);
        // Invisible hit area for click
        g.append("rect").attr("class", "rank-hit").attr("fill", "transparent").attr("cursor", "pointer")
          .attr("x", margin.left).attr("y", 0).attr("width", width - margin.left - margin.right).attr("height", barHeight + 8);

        return g;
      }
    );

  // Animate row positions when order changes
  groups.transition().duration(dur).ease(d3.easeCubicInOut)
    .attr("transform", (d, i) => `translate(0,${margin.top + i * rowHeight + 6})`);

  // City name + selection highlight
  groups.select(".city-label")
    .text((d) => d.city)
    .attr("fill", (d) => d.city === state.selectedCity ? COLORS.ink : COLORS.muted)
    .attr("font-weight", (d) => d.city === state.selectedCity ? 900 : 720);

  // Animate bar widths
  const t = d3.transition().duration(dur).ease(d3.easeCubicOut);

  groups.select(".bar-temp")
    .attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78)
    .transition(t)
    .attr("width", (d) => Math.max(1, x(d.tempScore * 0.6) - x(0)));

  groups.select(".bar-rain")
    .attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78)
    .transition(t)
    .attr("x", (d) => x(d.tempScore * 0.6))
    .attr("width", (d) => Math.max(1, x(d.tempScore * 0.6 + d.rainScore * 0.3) - x(d.tempScore * 0.6)));

  groups.select(".bar-heat")
    .attr("opacity", (d) => d.city === state.selectedCity ? 1 : 0.78)
    .transition(t)
    .attr("x", (d) => x(d.tempScore * 0.6 + d.rainScore * 0.3))
    .attr("width", (d) => Math.max(1, x(d.index) - x(d.tempScore * 0.6 + d.rainScore * 0.3)));

  // Score label slides with the bar end
  groups.select(".rank-score")
    .text((d) => d.index.toFixed(1))
    .transition(t)
    .attr("x", (d) => x(d.index) + 8);

  // Selection ring (SVG outline rect) — drawn last so it's on top
  groups.selectAll(".rank-outline").data((d) => [d]).join(
    (enter) => enter.append("rect").attr("class", "rank-outline rank-bar")
      .attr("y", 0).attr("height", barHeight).attr("rx", 8).attr("fill", "none")
  )
    .attr("x", margin.left)
    .attr("width", (d) => Math.max(2, x(d.index) - margin.left))
    .attr("stroke", (d) => d.city === state.selectedCity ? COLORS.ink : "transparent")
    .attr("stroke-width", (d) => d.city === state.selectedCity ? 2.5 : 0);

  // Interaction
  groups.on("click", (event, d) => {
    state.selectedCity = d.city;
    updateAll();
  }).on("keydown", (event, d) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      state.selectedCity = d.city;
      updateAll();
    }
  }).attr("aria-label", (d) => `${d.city}, Climate Twin Index ${d.index.toFixed(1)}`);
}

function drawMap() {
  const svg = byId("mapSvg");
  const width = 760;
  const height = 500;
  const margin = { top: 24, right: 28, bottom: 30, left: 28 };
  clearSvg(svg, width, height);

  const locations = cityLocations();
  const rowsByCity = new Map(rankingRows().map((row) => [row.city, row]));
  const sanDiego = locations.find((city) => city.city === "San Diego");
  const selected = locations.find((city) => city.city === state.selectedCity);
  const lonDomain = [-125.2, -108.6];
  const latDomain = [31.0, 49.2];
  const x = scaleLinear(lonDomain, [margin.left, width - margin.right]);
  const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  const y = scaleLinear([mercatorY(latDomain[0]), mercatorY(latDomain[1])], [height - margin.bottom, margin.top]);
  const project = (lon, lat) => [x(lon), y(mercatorY(lat))];
  const polygonPoints = (points) => points.map(([lon, lat]) => project(lon, lat).join(",")).join(" ");

  svgEl("rect", { x: 0, y: 0, width, height, rx: 18, fill: COLORS.bg }, svg);
  svgEl("rect", { x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom, rx: 16, fill: "#e2eee9", opacity: 0.68 }, svg);

  [-124, -120, -116, -112].forEach((lon) => {
    const [gx] = project(lon, 35);
    svgEl("line", { x1: gx, x2: gx, y1: margin.top, y2: height - margin.bottom, class: "grid-line", opacity: 0.55 }, svg);
    addText(svg, `${Math.abs(lon)}W`, { x: gx, y: height - 9, "text-anchor": "middle", class: "chart-label" });
  });
  [32, 36, 40, 44, 48].forEach((lat) => {
    const [, gy] = project(-118, lat);
    svgEl("line", { x1: margin.left, x2: width - margin.right, y1: gy, y2: gy, class: "grid-line", opacity: 0.55 }, svg);
    addText(svg, `${lat}N`, { x: 8, y: gy + 4, class: "chart-label" });
  });

  WEST_MAP.forEach((stateShape) => {
    svgEl("polygon", {
      points: polygonPoints(stateShape.points),
      fill: "#f7faf5",
      stroke: COLORS.line,
      "stroke-width": 1.6
    }, svg);
    const centerLon = mean(stateShape.points.map((point) => point[0]));
    const centerLat = mean(stateShape.points.map((point) => point[1]));
    const [tx, ty] = project(centerLon, centerLat);
    addText(svg, stateShape.name, { x: tx, y: ty, "text-anchor": "middle", class: "chart-label state-label" });
  });

  const coastPoints = [
    [-124.7, 48.4], [-124.1, 46.2], [-124.4, 42.0], [-123.7, 40.6], [-122.8, 38.9],
    [-122.4, 37.7], [-121.8, 36.3], [-120.7, 34.5], [-119.5, 34.0], [-117.2, 32.6]
  ].map(([lon, lat]) => project(lon, lat).join(",")).join(" ");
  svgEl("polyline", { points: coastPoints, fill: "none", stroke: "#6caea0", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.74 }, svg);

  if (sanDiego && selected) {
    const [sx, sy] = project(sanDiego.lon, sanDiego.lat);
    const [tx, ty] = project(selected.lon, selected.lat);
    svgEl("line", {
      x1: sx, y1: sy,
      x2: tx, y2: ty,
      stroke: COLORS.ink, "stroke-width": 2.2, "stroke-dasharray": "5 7", opacity: 0.68
    }, svg);
  }

  locations.forEach((city) => {
    const row = rowsByCity.get(city.city);
    const isSanDiego = city.city === "San Diego";
    const isSelected = city.city === state.selectedCity;
    const score = row ? row[state.metric] : undefined;
    const radius = isSanDiego ? 10 : row ? 5 + row.index / 9 : 5;
    const [cx, cy] = project(city.lon, city.lat);
    const group = svgEl("g", {
      tabindex: row ? "0" : "-1",
      role: row ? "button" : "img",
      "aria-label": row ? `${city.city}, ${metricLabel()} ${score.toFixed(1)}` : city.city
    }, svg);
    svgEl("circle", {
      cx,
      cy,
      r: radius,
      fill: isSanDiego ? COLORS.heat : row ? scoreColor(score) : COLORS.surface,
      stroke: isSelected || isSanDiego ? COLORS.ink : COLORS.surface,
      "stroke-width": isSelected || isSanDiego ? 2.7 : 1.7,
      class: `city-dot ${isSelected ? "selected" : ""}`
    }, group);
    if (row || isSanDiego) {
      addText(group, isSanDiego ? "San Diego" : city.city, { x: cx + 10, y: cy - 9, class: `map-label ${isSelected ? "selected-label" : ""}` });
    }
    if (row) {
      group.addEventListener("click", () => {
        state.selectedCity = city.city;
        updateAll();
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.selectedCity = city.city;
          updateAll();
        }
      });
    }
  });

  addText(svg, `Color: ${metricLabel()}`, { x: width - 28, y: 28, "text-anchor": "end", class: "chart-label selected-label" });
  addText(svg, "Simplified West Coast / Southwest basemap", { x: margin.left + 8, y: 28, class: "chart-label selected-label" });
}

function drawFingerprint() {
  const svg = byId("fingerprintSvg");
  const width = 760;
  const height = 500;
  const margin = { top: 34, right: 28, bottom: 52, left: 56 };
  clearSvg(svg, width, height);

  const selected = selectedRow();
  if (!selected) return;

  const futureTemp = futureValues("seasonal_mean_temp_c");
  const futureRain = futureValues("seasonal_precip_mm");
  const cityTemp = comparisonValues(selected.city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(selected.city, "seasonal_precip_mm");

  svgEl("rect", { x: 0, y: 0, width, height, rx: 18, fill: COLORS.bg }, svg);
  drawGroupedBars(svg, { x: margin.left, y: 48, width: width - margin.left - margin.right, height: 170 }, futureTemp, cityTemp, "Seasonal temperature (C)", COLORS.accent, COLORS.heat);
  drawGroupedBars(svg, { x: margin.left, y: 278, width: width - margin.left - margin.right, height: 170 }, futureRain, cityRain, "Seasonal precipitation (mm)", COLORS.rain, COLORS.heat);
  addText(svg, `San Diego ${profileName()}`, { x: width - 226, y: 26, class: "chart-label" });
  svgEl("rect", { x: width - 246, y: 16, width: 12, height: 12, rx: 3, fill: COLORS.accent }, svg);
  addText(svg, `${selected.city} today`, { x: width - 226, y: 49, class: "chart-label" });
  svgEl("rect", { x: width - 246, y: 39, width: 12, height: 12, rx: 3, fill: COLORS.heat }, svg);
}

function drawGroupedBars(svg, box, future, city, label, futureColor, cityColor) {
  const values = SEASONS.flatMap((season) => [future[season], city[season]]).filter(Number.isFinite);
  const maxValue = Math.max(...values) * 1.18;
  const y = scaleLinear([0, maxValue], [box.y + box.height, box.y]);
  const groupWidth = box.width / SEASONS.length;
  const barWidth = Math.min(34, groupWidth * 0.24);

  [0, maxValue / 2, maxValue].forEach((tick) => {
    const ty = y(tick);
    svgEl("line", { x1: box.x, x2: box.x + box.width, y1: ty, y2: ty, class: "grid-line" }, svg);
    addText(svg, tick.toFixed(0), { x: box.x - 10, y: ty + 4, "text-anchor": "end", class: "chart-label" });
  });
  addText(svg, label, { x: box.x, y: box.y - 14, class: "chart-label selected-label" });

  SEASONS.forEach((season, index) => {
    const center = box.x + groupWidth * index + groupWidth / 2;
    const futureValue = future[season];
    const cityValue = city[season];
    svgEl("rect", { x: center - barWidth - 4, y: y(futureValue), width: barWidth, height: y(0) - y(futureValue), rx: 7, fill: futureColor }, svg);
    svgEl("rect", { x: center + 4, y: y(cityValue), width: barWidth, height: y(0) - y(cityValue), rx: 7, fill: cityColor }, svg);
    addText(svg, season, { x: center, y: box.y + box.height + 24, "text-anchor": "middle", class: "chart-label" });
  });
}

function drawDifference() {
  const svg = byId("differenceSvg");
  const width = 760;
  const height = 500;
  const margin = { top: 42, right: 56, bottom: 42, left: 144 };
  clearSvg(svg, width, height);

  const selected = selectedRow();
  if (!selected) return;

  const futureTemp = futureValues("seasonal_mean_temp_c");
  const futureRain = futureValues("seasonal_precip_mm");
  const cityTemp = comparisonValues(selected.city, "seasonal_mean_temp_c");
  const cityRain = comparisonValues(selected.city, "seasonal_precip_mm");
  const rows = [
    ...SEASONS.map((season) => ({ label: `${season} temp`, value: cityTemp[season] - futureTemp[season], unit: "C", color: COLORS.heat })),
    ...SEASONS.map((season) => ({ label: `${season} rain`, value: (cityRain[season] - futureRain[season]) / Math.max(20, futureRain[season]) * 100, unit: "%", color: COLORS.rain }))
  ];
  const maxAbs = Math.max(8, Math.ceil(Math.max(...rows.map((row) => Math.abs(row.value))) / 10) * 10);
  const x = scaleLinear([-maxAbs, maxAbs], [margin.left, width - margin.right]);
  const rowHeight = (height - margin.top - margin.bottom) / rows.length;

  svgEl("rect", { x: 0, y: 0, width, height, rx: 18, fill: COLORS.bg }, svg);
  [-maxAbs, 0, maxAbs].forEach((tick) => {
    const tx = x(tick);
    svgEl("line", { x1: tx, x2: tx, y1: margin.top - 10, y2: height - margin.bottom, class: tick === 0 ? "zero-line" : "grid-line" }, svg);
    addText(svg, String(tick), { x: tx, y: height - 15, "text-anchor": "middle", class: "chart-label" });
  });
  addText(svg, `${selected.city} today minus San Diego ${profileName()}`, { x: margin.left, y: 24, class: "chart-label selected-label" });

  rows.forEach((row, index) => {
    const y = margin.top + index * rowHeight + 5;
    const x0 = x(0);
    const x1 = x(row.value);
    addText(svg, row.label, { x: margin.left - 12, y: y + rowHeight / 2 + 4, "text-anchor": "end", class: "chart-label" });
    svgEl("rect", {
      x: Math.min(x0, x1),
      y,
      width: Math.max(2, Math.abs(x1 - x0)),
      height: Math.max(14, rowHeight - 10),
      rx: 7,
      fill: row.color,
      opacity: 0.86
    }, svg);
    addText(svg, `${row.value > 0 ? "+" : ""}${row.value.toFixed(row.unit === "C" ? 1 : 0)}${row.unit}`, {
      x: row.value >= 0 ? x1 + 7 : x1 - 7,
      y: y + rowHeight / 2 + 4,
      "text-anchor": row.value >= 0 ? "start" : "end",
      class: "chart-label selected-label"
    });
  });
}

function drawAll() {
  drawTrajectory();
  drawRanking();
  drawMap();
  drawFingerprint();
  drawDifference();
}

function updateAll() {
  ensureSelectedCity();
  setButtonStates();
  updateSummary();
  drawAll();
}

function boot() {
  if (!rawRecords.length) {
    byId("currentFinding").textContent = "Dataset did not load.";
    byId("currentDetail").textContent = "Check that data.js is present next to index.html.";
    return;
  }
  initControls();
  initScrollSteps();
  ensureSelectedCity();
  setActiveView(state.activeView);
  updateAll();
}

boot();
