import { TREES, DEFAULT_CONFIG, STATS } from "./data.js";
import {
  DAY, RESOURCES, Lab, buildCatalog, simulate, levelsAt, blocker, labLevelAt, isTreeComplete,
  statTotals, researchDuration, formatDuration,
} from "./sim.js";

const STORAGE_KEY = "lastz-research-sim:v1";
const PLAY_KEY = "lastz-research-sim:play:v1";
const TAB_KEY = "lastz-research-sim:tab";
const catalog = buildCatalog(TREES);
const treeById = new Map(TREES.map((t) => [t.id, t]));
const totalLevels = catalog.nodes.reduce((sum, n) => sum + n.maxLevel, 0);
const RES_LABEL = { food: "Food", wood: "Wood", steel: "Steel", badges: "Badges" };

const ICONS = {
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 014 0v1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  clock: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 3.5V6l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  cross: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bolt: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7 1L2.5 7H6l-1 4 4.5-6H6z" fill="currentColor"/></svg>',
};

// ---------- helpers ----------

const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat("en-US");
const fmtPct = (x) => `${Math.round(x * 100)}%`;

function compact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return fmt.format(Math.round(n));
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v; // static, trusted markup only (icons)
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function icon(name) {
  return el("span", { class: "ico", html: ICONS[name] });
}

function chip(kind, iconName, text) {
  return el("span", { class: `chip ${kind}` }, iconName ? icon(iconName) : null, text);
}

function clock(minute) {
  const day = Math.floor(minute / DAY);
  const h = Math.floor((minute % DAY) / 60);
  const m = Math.floor(minute % 60);
  return `Day ${day + 1} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function effectText(stat, value) {
  const s = STATS[stat];
  const v = Math.round(value * 10) / 10;
  return `+${fmt.format(v)}${s.unit}`;
}

function costText(cost) {
  const parts = RESOURCES.filter((r) => cost[r] > 0).map((r) => `${compact(cost[r])} ${RES_LABEL[r].toLowerCase()}`);
  return parts.length ? parts.join(" · ") : "Free";
}

function nodesOf(treeId) {
  return catalog.nodes.filter((n) => n.treeId === treeId);
}

// ---------- config ----------

const clone = (x) => JSON.parse(JSON.stringify(x));

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state lasts for this visit only */
  }
}

function loadConfig() {
  const config = clone(DEFAULT_CONFIG);
  const saved = readStorage(STORAGE_KEY);
  if (saved && typeof saved === "object") {
    for (const key of Object.keys(config)) {
      if (!(key in saved)) continue;
      if (typeof config[key] === "object" && !Array.isArray(config[key])) Object.assign(config[key], saved[key]);
      else config[key] = saved[key];
    }
    // Keep the priority list in sync with the tree list.
    const known = config.priority.filter((id) => treeById.has(id));
    config.priority = [...new Set([...known, ...TREES.map((t) => t.id)])];
  }
  return config;
}

let config = loadConfig();

const FIELD_GROUPS = [
  {
    legend: "Run",
    fields: [{ path: "days", label: "Days to simulate", hint: "Auto plan only", min: 7, max: 730, step: 1 }],
  },
  {
    legend: "Laboratory",
    fields: [
      { path: "labStartLevel", label: "Starting Laboratory level", min: 1, max: 30, step: 1 },
      { path: "hoursPerLabLevel", label: "Hours per Laboratory upgrade", hint: "How often your Laboratory gains a level", min: 1, max: 2000, step: 1 },
      { path: "queues", label: "Research queues", min: 1, max: 3, step: 1 },
      { path: "secondQueueDay", label: "Second Laboratory opens on day", hint: "Adds one queue. 0 = never", min: 0, max: 730, step: 1 },
    ],
  },
  {
    legend: "Boosts",
    fields: [
      { path: "baseResearchSpeed", label: "Research speed bonus %", hint: "From VIP, heroes, skins. Research nodes add more", min: 0, max: 500, step: 1 },
      { path: "speedupMinutesPerDay", label: "Research speedups per day", hint: "Minutes. Auto plan spends them right away", min: 0, max: 100000, step: 5 },
      { path: "allianceHelps", label: "Alliance helps per research", min: 0, max: 50, step: 1 },
      { path: "helpMinutes", label: "Minutes per help", hint: "Each help also removes at least 1% of the timer", min: 0, max: 60, step: 1 },
    ],
  },
  {
    legend: "Income per day",
    fields: RESOURCES.map((r) => ({
      path: `income.${r}`,
      label: r === "badges" ? "Research Badges" : RES_LABEL[r],
      min: 0,
      max: 1e10,
      step: r === "badges" ? 1 : 10000,
    })),
  },
  {
    legend: "Starting stock",
    fields: RESOURCES.map((r) => ({
      path: `startingStock.${r}`,
      label: r === "badges" ? "Research Badges" : RES_LABEL[r],
      min: 0,
      max: 1e11,
      step: r === "badges" ? 1 : 10000,
    })),
  },
];

const getPath = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function buildSettings() {
  const form = $("#settings");
  form.replaceChildren(el("p", { class: "hint settings-note", id: "settings-note" }));

  for (const group of FIELD_GROUPS) {
    const fs = el("fieldset", {}, el("legend", {}, group.legend));
    for (const f of group.fields) {
      const id = `f-${f.path.replace(".", "-")}`;
      const input = el("input", {
        id,
        type: "number",
        inputmode: "numeric",
        min: f.min,
        max: f.max,
        step: f.step,
        value: getPath(config, f.path),
      });
      input.addEventListener("input", () => {
        const v = Number(input.value);
        if (input.value === "" || !Number.isFinite(v)) return;
        setPath(config, f.path, Math.min(f.max, Math.max(f.min, v)));
        scheduleRun();
      });
      fs.append(
        el("div", { class: "field" },
          el("label", { for: id }, f.label, f.hint ? el("small", {}, f.hint) : null),
          input)
      );
    }
    form.append(fs);
  }

  const strategy = el("select", { id: "f-strategy" },
    el("option", { value: "priority" }, "Follow my tree order"),
    el("option", { value: "fastest" }, "Shortest timer first"),
    el("option", { value: "roundRobin" }, "Rotate between trees"));
  strategy.value = config.strategy;
  strategy.addEventListener("change", () => {
    config.strategy = strategy.value;
    scheduleRun();
  });

  form.append(el("fieldset", {},
    el("legend", {}, "Auto plan order"),
    el("label", { for: "f-strategy", class: "hint" }, "When a queue is free, start"),
    strategy,
    el("p", { class: "hint" }, "Tree order (also breaks ties for the other rules). If the top choice is unaffordable, the next affordable research starts."),
    el("ol", { class: "priority", id: "priority" })));

  form.append(el("div", { class: "settings-actions" },
    el("button", {
      type: "button",
      class: "btn",
      onclick: () => {
        config = clone(DEFAULT_CONFIG);
        buildSettings();
        run();
      },
    }, "Reset settings")));

  renderPriority();
  renderSettingsNote();
}

function renderSettingsNote() {
  const note = $("#settings-note");
  if (!note) return;
  note.textContent = activeTab === "play"
    ? "Income, boosts, helps and queues apply to your game right away. Starting stock and Laboratory level apply when you restart."
    : "Changes rerun the auto plan instantly.";
}

function renderPriority() {
  const list = $("#priority");
  list.replaceChildren(
    ...config.priority.map((id, i) =>
      el("li", {},
        el("span", {}, treeById.get(id).name),
        el("button", { type: "button", "aria-label": `Move ${treeById.get(id).name} up`, disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
        el("button", { type: "button", "aria-label": `Move ${treeById.get(id).name} down`, disabled: i === config.priority.length - 1, onclick: () => move(i, 1) }, "↓"))
    )
  );
  function move(i, dir) {
    const p = config.priority;
    [p[i], p[i + dir]] = [p[i + dir], p[i]];
    renderPriority();
    const buttons = $("#priority").children[i + dir].querySelectorAll("button");
    (dir < 0 ? buttons[0] : buttons[1]).focus();
    scheduleRun();
  }
}

// ---------- tabs ----------

let activeTab = "auto";

function setTab(tab, { focus = false } = {}) {
  activeTab = tab;
  for (const name of ["auto", "play"]) {
    const btn = $(`#tab-${name}`);
    btn.setAttribute("aria-selected", String(name === tab));
    btn.tabIndex = name === tab ? 0 : -1;
    $(`#view-${name}`).hidden = name !== tab;
  }
  if (focus) $(`#tab-${tab}`).focus();
  writeStorage(TAB_KEY, tab);
  renderSettingsNote();
  if (tab === "play") renderPlay();
  else if (result) renderChart();
}

function wireTabs() {
  for (const name of ["auto", "play"]) $(`#tab-${name}`).addEventListener("click", () => setTab(name));
  $(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    setTab(activeTab === "auto" ? "play" : "auto", { focus: true });
  });
}

// ---------- auto plan ----------

let result = null;
let cumulativePower = []; // power after each event
let selectedDay = config.days;
let runTimer = null;

function scheduleRun() {
  clearTimeout(runTimer);
  runTimer = setTimeout(run, 120);
}

function run() {
  const wasAtEnd = !result || selectedDay >= result.daily.length - 1;
  writeStorage(STORAGE_KEY, config);
  result = simulate(catalog, config);
  let p = 0;
  cumulativePower = result.events.map((e) => (p += catalog.byId.get(e.nodeId).power));
  selectedDay = wasAtEnd ? config.days : Math.min(selectedDay, config.days);
  const slider = $("#day");
  slider.max = config.days;
  slider.value = selectedDay;
  renderKpis();
  renderChart();
  renderTreeTable();
  renderDay();
  if (playLab) {
    playLab.config = config;
    renderPlay();
  }
  refreshDetail();
}

function renderKpis() {
  const r = result;
  const end = r.daily[r.daily.length - 1];
  const done = Object.entries(r.treeDone).sort((a, b) => a[1] - b[1]);
  const lastDone = done[done.length - 1];
  const idleShare = r.queueMinutes ? r.idleQueueMinutes / r.queueMinutes : 0;

  const tiles = [
    ["Levels researched", fmt.format(r.events.length), `of ${fmt.format(totalLevels)} across ${TREES.length} trees`],
    ["Trees complete", `${done.length} / ${TREES.length}`, lastDone ? `Latest: ${treeById.get(lastDone[0]).name}, day ${Math.ceil(lastDone[1] / DAY)}` : "None yet"],
    ["Research power", fmt.format(r.power), `${fmt.format(Math.round(r.power / config.days))} per day on average`],
    ["Research speed", `+${end.researchSpeed.toFixed(1)}%`, `Laboratory Lv ${end.labLevel} at the end`],
    ["Queues idle", fmtPct(idleShare), r.queueMinutes
      ? `${fmtPct(r.idleBy.resources / r.queueMinutes)} short on resources · ${fmtPct(r.idleBy.locked / r.queueMinutes)} waiting for unlocks`
      : ""],
  ];
  $("#kpis").replaceChildren(
    ...tiles.map(([label, value, sub]) =>
      el("div", { class: "kpi" }, el("div", { class: "eyebrow" }, label), el("div", { class: "value" }, value), el("div", { class: "sub" }, sub)))
  );
}

// ---------- chart ----------

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

function dayTicks(days, count) {
  const target = days / count;
  const step = [1, 2, 5, 7, 10, 14, 15, 20, 30, 50, 60, 90, 100, 120, 180].find((s) => s >= target) || 365;
  const ticks = [];
  for (let d = 0; d <= days; d += step) ticks.push(d);
  return ticks;
}

let chartGeom = null;

function renderChart() {
  const box = $("#chart-box");
  if (!box.clientWidth) return; // hidden tab
  const chart = $("#chart");
  const W = Math.max(box.clientWidth, 280);
  const H = W < 520 ? 220 : 280;
  const m = { l: 52, r: W < 520 ? 16 : 76, t: 22, b: 28 };
  const days = config.days;
  const daily = result.daily;
  const yMax = niceMax(Math.max(...daily.map((d) => d.power)) * 1.05);
  const x = (d) => m.l + (d / days) * (W - m.l - m.r);
  const y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);

  chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
  chart.replaceChildren();

  const gAxis = svg("g", { class: "axis" });
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i;
    gAxis.append(svg("line", { class: "grid-line", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    const t = svg("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = compact(v);
    gAxis.append(t);
  }
  for (const d of dayTicks(days, W < 520 ? 4 : 6)) {
    const t = svg("text", { x: x(d), y: H - 8, "text-anchor": "middle" });
    t.textContent = String(d);
    gAxis.append(t);
  }
  chart.append(gAxis);

  const pts = daily.map((d) => [x(d.day), y(d.power)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  chart.append(svg("path", { class: "power-area", d: `${line}L${x(days)},${y(0)}L${x(0)},${y(0)}Z` }));
  chart.append(svg("path", { class: "power-line", d: line }));

  const milestones = Object.entries(result.treeDone).map(([treeId, minute]) => {
    const idx = result.events.findIndex((e) => e.minute === minute && e.treeId === treeId);
    return { treeId, day: minute / DAY, power: cumulativePower[idx] ?? 0 };
  });
  for (const ms of milestones) {
    const cx = x(ms.day);
    const cy = y(ms.power);
    chart.append(svg("rect", { class: "milestone", x: cx - 4.5, y: cy - 4.5, width: 9, height: 9, transform: `rotate(45 ${cx} ${cy})` }));
  }

  const last = daily[daily.length - 1];
  chart.append(svg("circle", { class: "end-dot", cx: x(last.day), cy: y(last.power), r: 4.5 }));
  if (W >= 520) {
    const t = svg("text", { class: "end-label", x: x(last.day) + 9, y: y(last.power) + 4 });
    t.textContent = compact(last.power);
    chart.append(t);
  }

  const scrub = svg("line", { class: "scrub-line", y1: m.t, y2: H - m.b });
  const cursor = svg("line", { class: "cursor-line", y1: m.t, y2: H - m.b, visibility: "hidden" });
  chart.append(scrub, cursor);

  chartGeom = { x, y, m, W, H, days, milestones, scrub, cursor };
  positionScrub();
}

function positionScrub() {
  if (!chartGeom) return;
  const sx = chartGeom.x(selectedDay);
  chartGeom.scrub.setAttribute("x1", sx);
  chartGeom.scrub.setAttribute("x2", sx);
}

function dayFromPointer(event) {
  const rect = $("#chart").getBoundingClientRect();
  const { m, W, days } = chartGeom;
  const px = ((event.clientX - rect.left) / rect.width) * W;
  const d = Math.round(((px - m.l) / (W - m.l - m.r)) * days);
  return Math.min(days, Math.max(0, d));
}

function showTooltip(day) {
  if (!chartGeom) return;
  const { x, y, W, cursor, milestones } = chartGeom;
  const snap = result.daily[day];
  cursor.setAttribute("x1", x(day));
  cursor.setAttribute("x2", x(day));
  cursor.setAttribute("visibility", "visible");

  const tip = $("#tooltip");
  const finished = milestones.filter((ms) => ms.day > day - 1 && ms.day <= day);
  tip.replaceChildren(el("div", {},
    el("div", { class: "tt-row" }, el("strong", {}, fmt.format(snap.power)), el("span", {}, `Day ${day}`)),
    el("div", { class: "tt-row" }, el("span", {}, "Levels researched"), el("span", { class: "num" }, fmt.format(snap.completed))),
    el("div", { class: "tt-row" }, el("span", {}, "Laboratory"), el("span", { class: "num" }, `Lv ${snap.labLevel}`)),
    el("div", { class: "tt-row" }, el("span", {}, "Research speed"), el("span", { class: "num" }, `+${snap.researchSpeed.toFixed(1)}%`)),
    finished.length
      ? el("div", { class: "tt-done" }, `Completed: ${finished.map((f) => treeById.get(f.treeId).name).join(", ")}`)
      : null));
  tip.hidden = false;
  const box = $("#chart-box");
  const scale = box.clientWidth / W;
  const px = x(day) * scale;
  const tipW = tip.offsetWidth;
  const left = px + 14 + tipW > box.clientWidth ? px - 14 - tipW : px + 14;
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${Math.max(0, y(snap.power) * scale - tip.offsetHeight - 10)}px`;
}

function hideTooltip() {
  $("#tooltip").hidden = true;
  chartGeom?.cursor.setAttribute("visibility", "hidden");
}

function wireChart() {
  const chart = $("#chart");
  chart.addEventListener("pointermove", (e) => showTooltip(dayFromPointer(e)));
  chart.addEventListener("pointerleave", hideTooltip);
  chart.addEventListener("click", (e) => selectDay(dayFromPointer(e)));
  chart.addEventListener("focus", () => showTooltip(selectedDay));
  chart.addEventListener("blur", hideTooltip);
  chart.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 7 : 1;
    if (e.key === "ArrowLeft") selectDay(Math.max(0, selectedDay - step));
    else if (e.key === "ArrowRight") selectDay(Math.min(config.days, selectedDay + step));
    else return;
    e.preventDefault();
    showTooltip(selectedDay);
  });
  new ResizeObserver(() => result && renderChart()).observe($("#chart-box"));
}

// ---------- tree table ----------

function renderTreeTable() {
  const lab = labLevelAt(config, config.days * DAY);
  const busyTrees = new Set(result.inProgress.map((q) => catalog.byId.get(q.nodeId).treeId));
  const rows = config.priority.map((id) => treeById.get(id)).map((tree) => {
    const nodes = nodesOf(tree.id);
    const max = nodes.reduce((s, n) => s + n.maxLevel, 0);
    const got = nodes.reduce((s, n) => s + (result.levels[n.id] || 0), 0);
    let status;
    if (tree.id in result.treeDone) {
      status = chip("done", "check", `Done on day ${Math.ceil(result.treeDone[tree.id] / DAY)}`);
    } else if (busyTrees.has(tree.id) || nodes.some((n) => !blocker(catalog, n, result.levels, lab))) {
      status = chip("active", "clock", "In progress");
    } else {
      const reasons = nodes.map((n) => blocker(catalog, n, result.levels, lab)).filter((b) => b && b !== "maxed");
      status = chip("locked", "lock", reasons[0] || "Locked");
    }
    const meter = el("div", { class: `meter${got === max ? " done" : ""}` }, el("i", { style: `width:${(got / max) * 100}%` }));
    return el("tr", {},
      el("td", { class: "tree-name" }, tree.name),
      el("td", { class: "col-cost" }, chip(tree.currency, null, tree.currency === "badges" ? "Badges" : "Resources")),
      el("td", {}, el("div", { class: "progress-cell" }, meter, el("span", { class: "num" }, `${got}/${max}`))),
      el("td", {}, status));
  });
  $("#tree-table tbody").replaceChildren(...rows);
  $("#trees-sub").textContent = `Listed in your research order · after ${config.days} days`;
}

// ---------- shared tree map ----------

// view: { levels, labLevel, complete, state(node) -> { cls, label, note } }
function renderTreeMap(container, view, mode) {
  container.replaceChildren(
    ...config.priority.map((id) => treeById.get(id)).map((tree) => {
      const nodes = nodesOf(tree.id);
      const got = nodes.reduce((s, n) => s + (view.levels[n.id] || 0), 0);
      const max = nodes.reduce((s, n) => s + n.maxLevel, 0);
      const rootBlock = blocker(catalog, nodes[0], view.levels, view.labLevel, view.complete);
      const treeLock = !view.levels[nodes[0].id] && rootBlock && rootBlock !== "maxed" ? rootBlock : null;

      const card = el("div", { class: `tree${view.complete.get(tree.id) ? " is-done" : ""}` },
        el("div", { class: "tree-head" },
          el("h3", {}, tree.name),
          el("span", { class: "num" }, `${got}/${max}`)),
        el("p", { class: "tree-desc" }, tree.description),
        treeLock ? el("p", { class: "tree-lock" }, icon("lock"), `Needs ${treeLock}`) : null);

      tree.tiers.forEach((_, t) => {
        const row = el("div", { class: "tier" });
        for (const node of nodes.filter((n) => n.tier === t)) {
          const lvl = view.levels[node.id] || 0;
          const st = view.state(node);
          row.append(el("button", {
            type: "button",
            class: `node ${st.cls}`,
            "aria-label": `${node.name}, level ${lvl} of ${node.maxLevel}. ${st.label}. Open details.`,
            onclick: () => openDetail(node.id, mode),
          },
            el("span", { class: "n-name" }, node.name),
            el("span", { class: "n-lvl" },
              el("span", {}, `${lvl}/${node.maxLevel}`),
              st.badge ? el("span", { class: "n-badge" }, st.badge) : null),
            el("span", { class: "meter" }, el("i", { style: `width:${(lvl / node.maxLevel) * 100}%` })),
            st.note && !treeLock ? el("span", { class: "n-why" }, st.note) : null));
        }
        card.append(row);
      });
      return card;
    })
  );
}

// ---------- auto plan: day view ----------

function autoView(day) {
  const minute = day * DAY;
  const levels = levelsAt(result.events, minute);
  const labLevel = labLevelAt(config, minute);
  const complete = new Map(TREES.map((t) => [t.id, isTreeComplete(catalog, t.id, levels)]));
  const busy = new Map(result.events.filter((e) => e.start <= minute && e.minute > minute).map((e) => [e.nodeId, e]));
  // Research still running when the run ends.
  if (day === config.days) for (const q of result.inProgress) busy.set(q.nodeId, q);
  const speed = config.baseResearchSpeed + (statTotals(catalog, levels).researchSpeed || 0);
  return {
    minute, levels, labLevel, complete, busy, speed,
    state(node) {
      const lvl = levels[node.id] || 0;
      if (lvl >= node.maxLevel) return { cls: "maxed", label: "Maxed" };
      if (busy.has(node.id)) return { cls: "busy", label: `Researching level ${lvl + 1}`, badge: `→${lvl + 1}` };
      const why = blocker(catalog, node, levels, labLevel, complete);
      if (why) return { cls: "locked", label: `Locked: needs ${why}`, note: why };
      return { cls: "open", label: "Unlocked" };
    },
  };
}

function selectDay(day) {
  selectedDay = day;
  $("#day").value = day;
  renderDay();
  refreshDetail();
}

function renderDay() {
  const day = selectedDay;
  const view = autoView(day);
  const snap = result.daily[day];

  $("#day-title").textContent = day;
  $("#day-readout").textContent = `Day ${day}`;
  positionScrub();

  $("#stock").replaceChildren(
    el("span", {}, "Laboratory ", el("b", {}, `Lv ${view.labLevel}`)),
    ...["food", "wood", "steel"].map((r) => el("span", {}, `${RES_LABEL[r]} `, el("b", {}, compact(snap.stock[r])))),
    el("span", {}, "Badges ", el("b", {}, fmt.format(Math.floor(snap.stock.badges)))),
    el("span", {}, "Research speed ", el("b", {}, `+${view.speed.toFixed(1)}%`))
  );

  renderTreeMap($("#tree-map"), view, "auto");

  const upto = result.events.filter((e) => e.minute <= view.minute);
  const shown = upto.slice(-25).reverse();
  renderLog($("#log tbody"), shown, "Nothing finished yet. Move the day slider forward.");
  $("#log-sub").textContent = upto.length > shown.length
    ? `Latest ${shown.length} of ${fmt.format(upto.length)} levels finished by day ${day}`
    : `${upto.length} levels finished by day ${day}`;
}

function renderLog(tbody, events, emptyText) {
  if (!events.length) {
    tbody.replaceChildren(el("tr", {}, el("td", { colspan: 4, class: "muted" }, emptyText)));
    return;
  }
  tbody.replaceChildren(
    ...events.map((e) =>
      el("tr", {},
        el("td", { class: "num muted" }, clock(e.minute)),
        el("td", {}, `${e.name} `, el("span", { class: "muted" }, `→ Lv ${e.level}`)),
        el("td", { class: "muted" }, treeById.get(e.treeId).name),
        el("td", { class: "num" }, formatDuration(e.duration))))
  );
}

// ---------- auto plan: playback ----------

let playing = null;
function togglePlayback() {
  const btn = $("#play");
  if (playing) {
    cancelAnimationFrame(playing);
    playing = null;
    btn.textContent = "Play";
    return;
  }
  if (selectedDay >= config.days) selectDay(0);
  btn.textContent = "Pause";
  const daysPerSecond = Math.max(config.days / 8, 5);
  const startDay = selectedDay;
  const t0 = performance.now();
  const tick = (now) => {
    const day = Math.min(config.days, Math.floor(startDay + ((now - t0) / 1000) * daysPerSecond));
    if (day !== selectedDay) selectDay(day);
    if (day >= config.days) {
      playing = null;
      btn.textContent = "Play";
      return;
    }
    playing = requestAnimationFrame(tick);
  };
  playing = requestAnimationFrame(tick);
}

// ---------- play it yourself ----------

let playLab = null;
let lastMessage = "";

function loadPlay() {
  const saved = readStorage(PLAY_KEY);
  return (saved && Lab.fromJSON(catalog, config, saved)) || new Lab(catalog, config);
}

function savePlay() {
  writeStorage(PLAY_KEY, playLab.toJSON());
}

function playView() {
  const lab = playLab;
  const complete = lab.completeTrees();
  const speed = lab.researchSpeed();
  return {
    levels: lab.levels,
    labLevel: lab.labLevel,
    complete,
    speed,
    state(node) {
      const s = lab.status(node, { complete, speed });
      const lvl = lab.levels[node.id] || 0;
      switch (s.state) {
        case "maxed": return { cls: "maxed", label: "Maxed" };
        case "busy": {
          const q = lab.queues.find((q) => q.nodeId === node.id);
          return { cls: "busy", label: `Researching level ${lvl + 1}`, badge: formatDuration(q.remaining) };
        }
        case "locked": return { cls: "locked", label: s.reason, note: s.reason.replace(/^Needs /, "") };
        case "short": {
          const r = Object.keys(s.shortfall)[0];
          return { cls: "short", label: `Not enough ${RES_LABEL[r].toLowerCase()}`, note: `Need ${compact(s.shortfall[r])} ${RES_LABEL[r].toLowerCase()}` };
        }
        case "queueFull": return { cls: "open", label: "Unlocked, all queues busy" };
        default: return { cls: "ready", label: `Ready: level ${lvl + 1} in ${formatDuration(s.duration)}`, badge: "Ready" };
      }
    },
  };
}

function playAction(fn) {
  const before = playLab.events.length;
  fn();
  const finished = playLab.events.slice(before);
  if (finished.length) {
    const names = finished.slice(-3).map((e) => `${e.name} Lv ${e.level}`);
    lastMessage = `Finished: ${names.join(", ")}${finished.length > 3 ? ` and ${finished.length - 3} more` : ""}.`;
  }
  savePlay();
  renderPlay();
  refreshDetail();
}

function skip(minutes) {
  playAction(() => playLab.advanceTo(playLab.t + minutes));
}

function startResearch(nodeId) {
  const node = catalog.byId.get(nodeId);
  playAction(() => {
    const s = playLab.start(node);
    lastMessage = `Started ${node.name} Lv ${s.level}.`;
  });
}

function slotCount() {
  return config.queues + (config.secondQueueDay > 0 ? 1 : 0);
}

function renderPlay() {
  if (!playLab || activeTab !== "play") return;
  const lab = playLab;
  const view = playView();

  $("#p-clock").textContent = clock(lab.t);
  const nextLab = lab.labLevel < config.labMaxLevel
    ? `next in ${formatDuration((Math.floor(lab.t / (config.hoursPerLabLevel * 60)) + 1) * config.hoursPerLabLevel * 60 - lab.t)}`
    : "max level";
  const autoSnap = result?.daily[Math.min(Math.floor(lab.day), config.days)];
  $("#p-stats").replaceChildren(
    el("div", {}, el("span", { class: "eyebrow" }, "Laboratory"), el("b", { class: "num" }, `Lv ${lab.labLevel}`), el("small", {}, nextLab)),
    el("div", {}, el("span", { class: "eyebrow" }, "Research speed"), el("b", { class: "num" }, `+${view.speed.toFixed(1)}%`), el("small", {}, "shortens new timers")),
    el("div", {}, el("span", { class: "eyebrow" }, "Speedups"), el("b", { class: "num" }, formatDuration(lab.speedupPool)), el("small", {}, `+${formatDuration(config.speedupMinutesPerDay)} each day`)),
    el("div", {}, el("span", { class: "eyebrow" }, "Your power"), el("b", { class: "num" }, fmt.format(lab.power)),
      el("small", {}, autoSnap ? `Auto plan: ${fmt.format(autoSnap.power)} by day ${autoSnap.day}` : `${lab.events.length} levels`))
  );

  $("#p-res").replaceChildren(
    ...RESOURCES.map((r) =>
      el("div", { class: "res" },
        el("span", { class: "eyebrow" }, RES_LABEL[r]),
        el("b", { class: "num" }, r === "badges" ? fmt.format(Math.floor(lab.stock[r])) : compact(lab.stock[r])),
        el("small", {}, `+${compact(config.income[r])}/day`)))
  );

  const slots = [];
  for (let i = 0; i < Math.max(slotCount(), lab.queues.length); i++) {
    const q = lab.queues[i];
    if (q) {
      const node = catalog.byId.get(q.nodeId);
      const done = 1 - q.remaining / q.duration;
      const canFinish = lab.speedupPool >= q.remaining;
      slots.push(el("div", { class: "slot busy" },
        el("div", { class: "slot-head" },
          el("button", { type: "button", class: "linkish", onclick: () => openDetail(q.nodeId, "play") }, `${node.name} → Lv ${q.level}`),
          el("span", { class: "num" }, `${formatDuration(q.remaining)} left`)),
        el("div", { class: "meter" }, el("i", { style: `width:${Math.max(0, Math.min(1, done)) * 100}%` })),
        el("div", { class: "slot-foot" },
          el("span", { class: "muted" }, treeById.get(node.treeId).name),
          el("button", {
            type: "button",
            class: "btn small",
            disabled: lab.speedupPool <= 0,
            onclick: () => playAction(() => playLab.speedUp(i)),
          }, icon("bolt"), canFinish ? `Finish now (${formatDuration(q.remaining)})` : `Use ${formatDuration(lab.speedupPool)} speedups`))));
    } else if (i < lab.queueCount) {
      slots.push(el("div", { class: "slot free" },
        el("b", {}, "Free queue"),
        el("span", { class: "muted" }, "Pick a research marked Ready below.")));
    } else {
      slots.push(el("div", { class: "slot closed" },
        icon("lock"),
        el("span", { class: "muted" }, `Second Laboratory opens on day ${config.secondQueueDay}`)));
    }
  }
  $("#p-queues").replaceChildren(...slots);

  $("#p-next").disabled = !lab.queues.length;
  $("#p-message").textContent = lastMessage;

  renderTreeMap($("#p-map"), view, "play");
  renderLog($("#p-log tbody"), lab.events.slice(-25).reverse(), "Nothing researched yet. Start a research marked Ready, then skip time ahead.");
  $("#p-log-sub").textContent = `${fmt.format(lab.events.length)} of ${fmt.format(totalLevels)} levels researched`;
}

let restartArmed = null;
function wirePlay() {
  for (const btn of document.querySelectorAll("[data-skip]")) {
    btn.addEventListener("click", () => skip(Number(btn.dataset.skip)));
  }
  $("#p-next").addEventListener("click", () => {
    const next = playLab.nextFinish();
    if (next !== null) playAction(() => playLab.advanceTo(next));
  });
  $("#p-restart").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!restartArmed) {
      btn.textContent = "Click again to restart";
      restartArmed = setTimeout(() => {
        restartArmed = null;
        btn.textContent = "Restart";
      }, 3000);
      return;
    }
    clearTimeout(restartArmed);
    restartArmed = null;
    btn.textContent = "Restart";
    playLab = new Lab(catalog, config);
    lastMessage = "New game started on day 1.";
    savePlay();
    renderPlay();
  });
}

// ---------- detail dialog ----------

let detail = null; // { nodeId, mode }

function openDetail(nodeId, mode) {
  detail = { nodeId, mode };
  renderDetail();
  const dlg = $("#detail");
  if (!dlg.open) dlg.showModal();
}

function refreshDetail() {
  if (detail && $("#detail").open) renderDetail();
}

function finishedAt(events, nodeId, level) {
  return events.find((e) => e.nodeId === nodeId && e.level === level);
}

function renderDetail() {
  const node = catalog.byId.get(detail.nodeId);
  const tree = treeById.get(node.treeId);
  const stat = STATS[node.stat];
  const isPlay = detail.mode === "play";
  const view = isPlay ? playView() : autoView(selectedDay);
  const events = isPlay ? playLab.events : result.events;
  const lvl = view.levels[node.id] || 0;
  const busyQ = isPlay ? playLab.queues.find((q) => q.nodeId === node.id) : view.busy.get(node.id);

  // Requirements for the next level.
  const reqs = [];
  for (const id of tree.requires) {
    reqs.push({ ok: view.complete.get(id), text: `Finish ${treeById.get(id).name}` });
  }
  reqs.push({ ok: view.labLevel >= node.labRequired, text: `Laboratory Lv ${node.labRequired}`, now: `now Lv ${view.labLevel}` });
  for (const p of node.prereqs) {
    const have = view.levels[p.id] || 0;
    reqs.push({ ok: have >= p.level, text: `${catalog.byId.get(p.id).name} Lv ${p.level}`, now: `now Lv ${have}`, nodeId: p.id });
  }

  // Action area (play) or context line (auto).
  let action;
  if (lvl >= node.maxLevel) {
    action = el("p", { class: "d-state done" }, icon("check"), "Maxed. Every level of this research is done.");
  } else if (isPlay) {
    const s = playLab.status(node);
    if (s.state === "ready") {
      action = el("button", { type: "button", class: "btn primary big", onclick: () => startResearch(node.id) },
        `Research Lv ${s.level} · ${formatDuration(s.duration)}`);
    } else if (s.state === "busy") {
      const i = playLab.queues.indexOf(busyQ);
      action = el("div", { class: "d-action-row" },
        el("p", { class: "d-state busy" }, icon("clock"), `Researching Lv ${busyQ.level} · ${formatDuration(busyQ.remaining)} left`),
        el("button", { type: "button", class: "btn small", disabled: playLab.speedupPool <= 0, onclick: () => playAction(() => playLab.speedUp(i)) },
          icon("bolt"), playLab.speedupPool >= busyQ.remaining ? "Finish now" : `Use ${formatDuration(playLab.speedupPool)} speedups`));
    } else if (s.state === "short") {
      const need = Object.entries(s.shortfall).map(([r, v]) => `${compact(v)} more ${RES_LABEL[r].toLowerCase()}`);
      action = el("p", { class: "d-state short" }, icon("cross"), `Can't start Lv ${s.level} yet: you need ${need.join(" and ")}. Skip time ahead to collect income.`);
    } else if (s.state === "queueFull") {
      action = el("p", { class: "d-state short" }, icon("clock"), "All research queues are busy. Finish or speed up a research first.");
    } else {
      action = el("p", { class: "d-state locked" }, icon("lock"), `Locked. ${s.reason}.`);
    }
  } else {
    action = el("p", { class: "d-state muted" }, busyQ
      ? `On day ${selectedDay} of the auto plan, level ${lvl + 1} is being researched.`
      : `On day ${selectedDay} of the auto plan this research is at level ${lvl}.`);
  }

  const rows = [];
  for (let L = 1; L <= node.maxLevel; L++) {
    const unlocks = node.unlocks.filter((u) => u.level === L).map((u) => catalog.byId.get(u.id).name);
    const ev = finishedAt(events, node.id, L);
    let when;
    if (L <= lvl) when = el("span", { class: "when done" }, icon("check"), ev ? clock(ev.minute) : "Done");
    else if (busyQ && L === lvl + 1) when = el("span", { class: "when busy" }, "In progress");
    else if (L === lvl + 1) when = el("span", { class: "when next" }, "Next");
    else if (!isPlay && ev) when = el("span", { class: "when muted" }, clock(ev.minute));
    else when = el("span", { class: "when muted" }, "–");
    rows.push(el("tr", { class: L <= lvl ? "is-done" : L === lvl + 1 ? "is-next" : "" },
      el("td", { class: "num" }, L),
      el("td", {},
        el("b", { class: "num" }, effectText(node.stat, node.perLevel * L)),
        unlocks.length ? el("div", { class: "d-unlock" }, `Required for ${unlocks.join(", ")}`) : null),
      el("td", { class: "d-cost" }, costText(node.cost(L))),
      el("td", { class: "num" }, formatDuration(researchDuration(node.time(L), view.speed))),
      el("td", {}, when)));
  }

  const leadsTo = node.unlocks.map((u) => `${catalog.byId.get(u.id).name} (needs Lv ${u.level})`);

  $("#detail-body").replaceChildren(
    el("div", { class: "d-head" },
      el("div", {},
        el("div", { class: "eyebrow" }, `${tree.name} · Tier ${node.tier + 1} · ${tree.currency === "badges" ? "Badge research" : "Resource research"}`),
        el("h2", { id: "detail-title" }, node.name)),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => $("#detail").close() }, icon("cross"))),
    el("p", { class: "d-desc" }, node.description),
    el("div", { class: "d-effect" },
      el("div", {},
        el("span", { class: "eyebrow" }, "Each level"),
        el("b", {}, `${stat.label} ${effectText(node.stat, node.perLevel)}`),
        el("small", {}, stat.desc)),
      el("div", {},
        el("span", { class: "eyebrow" }, `Now · Lv ${lvl} of ${node.maxLevel}`),
        el("b", {}, lvl ? `${stat.label} ${effectText(node.stat, node.perLevel * lvl)}` : "No bonus yet"),
        el("small", {}, lvl < node.maxLevel ? `Max: ${effectText(node.stat, node.perLevel * node.maxLevel)}` : "Fully researched"))),
    node.stat !== "researchSpeed"
      ? el("p", { class: "hint" }, "Shown for reference. Only research speed changes timers in this simulator.")
      : el("p", { class: "hint" }, "This bonus shortens every research you start after each level finishes."),
    action,
    lvl < node.maxLevel
      ? el("div", { class: "d-reqs" },
        el("h3", {}, "Requirements"),
        el("ul", {}, ...reqs.map((r) =>
          el("li", { class: r.ok ? "ok" : "no" },
            icon(r.ok ? "check" : "cross"),
            r.nodeId
              ? el("button", { type: "button", class: "linkish", onclick: () => openDetail(r.nodeId, detail.mode) }, r.text)
              : el("span", {}, r.text),
            r.now && !r.ok ? el("span", { class: "muted" }, ` (${r.now})`) : null))))
      : null,
    el("div", { class: "d-levels" },
      el("h3", {}, "Levels"),
      el("p", { class: "hint" }, `Bonus is the total at that level. Timers use your current research speed (+${view.speed.toFixed(1)}%) before helps and speedups.`),
      el("div", { class: "table-scroll" },
        el("table", { class: "d-table" },
          el("thead", {}, el("tr", {},
            el("th", { class: "num" }, "Lv"), el("th", {}, "Bonus"), el("th", {}, "Cost"), el("th", { class: "num" }, "Timer"),
            el("th", {}, isPlay ? "Finished" : "Auto plan"))),
          el("tbody", {}, ...rows)))),
    leadsTo.length ? el("p", { class: "d-leads" }, el("b", {}, "Leads to: "), leadsTo.join(", ")) : null
  );
}

function wireDetail() {
  const dlg = $("#detail");
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close(); // backdrop
  });
  dlg.addEventListener("close", () => {
    detail = null;
  });
}

// ---------- boot ----------

const initialTab = location.hash === "#play" || location.hash === "#auto"
  ? location.hash.slice(1)
  : readStorage(TAB_KEY) === "play" ? "play" : "auto";

buildSettings();
wireTabs();
wireChart();
wirePlay();
wireDetail();
$("#day").addEventListener("input", (e) => selectDay(Number(e.target.value)));
$("#play").addEventListener("click", togglePlayback);
playLab = loadPlay();
run();
setTab(initialTab);
