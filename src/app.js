import { TREES, DEFAULT_CONFIG, STATS } from "./data.js";
import { buildCatalog, simulate, levelsAt, blocker, labLevelAt, isTreeComplete, statTotals, formatDuration } from "./sim.js";

const DAY = 1440;
const STORAGE_KEY = "lastz-research-sim:v1";
const catalog = buildCatalog(TREES);
const treeById = new Map(TREES.map((t) => [t.id, t]));
const totalLevels = catalog.nodes.reduce((sum, n) => sum + n.maxLevel, 0);

const ICONS = {
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 014 0v1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  clock: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 3.5V6l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
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

function chip(kind, icon, text) {
  const c = el("span", { class: `chip ${kind}` });
  if (icon) c.insertAdjacentHTML("afterbegin", ICONS[icon]);
  c.append(text);
  return c;
}

function clock(minute) {
  const day = Math.floor(minute / DAY);
  const h = Math.floor((minute % DAY) / 60);
  const m = Math.floor(minute % 60);
  return `Day ${day + 1} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------- config ----------

const clone = (x) => JSON.parse(JSON.stringify(x));

function loadConfig() {
  const config = clone(DEFAULT_CONFIG);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
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
  } catch {
    /* storage unavailable: use defaults */
  }
  return config;
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

let config = loadConfig();

const FIELD_GROUPS = [
  {
    legend: "Run",
    fields: [{ path: "days", label: "Days to simulate", min: 7, max: 730, step: 1 }],
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
      { path: "speedupMinutesPerDay", label: "Research speedups per day", hint: "Minutes, spent automatically", min: 0, max: 100000, step: 5 },
      { path: "allianceHelps", label: "Alliance helps per research", min: 0, max: 50, step: 1 },
      { path: "helpMinutes", label: "Minutes per help", hint: "Each help also removes at least 1% of the timer", min: 0, max: 60, step: 1 },
    ],
  },
  {
    legend: "Income per day",
    fields: ["food", "wood", "steel", "badges"].map((r) => ({
      path: `income.${r}`,
      label: r === "badges" ? "Research Badges" : r[0].toUpperCase() + r.slice(1),
      min: 0,
      max: 1e10,
      step: r === "badges" ? 1 : 10000,
    })),
  },
  {
    legend: "Starting stock",
    fields: ["food", "wood", "steel", "badges"].map((r) => ({
      path: `startingStock.${r}`,
      label: r === "badges" ? "Research Badges" : r[0].toUpperCase() + r.slice(1),
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
  form.replaceChildren();

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

  const list = el("ol", { class: "priority", id: "priority" });
  const order = el("fieldset", {},
    el("legend", {}, "Research order"),
    el("label", { for: "f-strategy", class: "hint" }, "When a queue is free, start"),
    strategy,
    el("p", { class: "hint" }, "Tree order (also breaks ties for the other rules). If the top choice is unaffordable, the next affordable research starts."),
    list);
  form.append(order);

  form.append(el("div", { class: "settings-actions" },
    el("button", {
      type: "button",
      class: "btn",
      onclick: () => {
        config = clone(DEFAULT_CONFIG);
        buildSettings();
        run();
      },
    }, "Reset to defaults")));

  renderPriority();
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

// ---------- simulation ----------

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
  saveConfig();
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
}

// ---------- KPIs ----------

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

  // Grid + y axis
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

  // Step-free line through daily snapshots
  const pts = daily.map((d) => [x(d.day), y(d.power)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  chart.append(svg("path", { class: "power-area", d: `${line}L${x(days)},${y(0)}L${x(0)},${y(0)}Z` }));
  chart.append(svg("path", { class: "power-line", d: line }));

  // Tree completion milestones
  const milestones = Object.entries(result.treeDone).map(([treeId, minute]) => {
    const idx = result.events.findIndex((e) => e.minute === minute && e.treeId === treeId);
    return { treeId, day: minute / DAY, power: cumulativePower[idx] ?? 0 };
  });
  for (const ms of milestones) {
    const cx = x(ms.day);
    const cy = y(ms.power);
    chart.append(svg("rect", { class: "milestone", x: cx - 4.5, y: cy - 4.5, width: 9, height: 9, transform: `rotate(45 ${cx} ${cy})` }));
  }

  // Endpoint
  const last = daily[daily.length - 1];
  chart.append(svg("circle", { class: "end-dot", cx: x(last.day), cy: y(last.power), r: 4.5 }));
  if (W >= 520) {
    const t = svg("text", { class: "end-label", x: x(last.day) + 9, y: y(last.power) + 4 });
    t.textContent = compact(last.power);
    chart.append(t);
  }

  // Selected-day line and hover cursor
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
  const chart = $("#chart");
  const rect = chart.getBoundingClientRect();
  const { m, W, days } = chartGeom;
  const px = ((event.clientX - rect.left) / rect.width) * W;
  const d = Math.round(((px - m.l) / (W - m.l - m.r)) * days);
  return Math.min(days, Math.max(0, d));
}

function showTooltip(day) {
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
      : null
  ));
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
  const endMinute = config.days * DAY;
  const lab = labLevelAt(config, endMinute);
  const busyTrees = new Set(result.inProgress.map((q) => catalog.byId.get(q.nodeId).treeId));
  const rows = config.priority.map((id) => treeById.get(id)).map((tree) => {
    const nodes = catalog.nodes.filter((n) => n.treeId === tree.id);
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

// ---------- day view ----------

function selectDay(day) {
  selectedDay = day;
  $("#day").value = day;
  renderDay();
}

function renderDay() {
  const day = selectedDay;
  const minute = day * DAY;
  const levels = levelsAt(result.events, minute);
  const lab = labLevelAt(config, minute);
  const snap = result.daily[day];
  const busy = new Map(
    result.events.filter((e) => e.start <= minute && e.minute > minute).map((e) => [e.nodeId, e])
  );
  // Research still running when the run ends.
  if (day === config.days) for (const q of result.inProgress) busy.set(q.nodeId, q);

  $("#day-title").textContent = day;
  $("#day-readout").textContent = `Day ${day}`;
  positionScrub();

  const stats = statTotals(catalog, levels);
  $("#stock").replaceChildren(
    el("span", {}, "Laboratory ", el("b", {}, `Lv ${lab}`)),
    ...["food", "wood", "steel"].map((r) => el("span", {}, `${r[0].toUpperCase() + r.slice(1)} `, el("b", {}, compact(snap.stock[r])))),
    el("span", {}, "Badges ", el("b", {}, fmt.format(Math.floor(snap.stock.badges)))),
    el("span", {}, "Research speed ", el("b", {}, `+${(config.baseResearchSpeed + (stats.researchSpeed || 0)).toFixed(1)}%`))
  );

  const complete = new Map(TREES.map((t) => [t.id, isTreeComplete(catalog, t.id, levels)]));
  $("#tree-map").replaceChildren(
    ...config.priority.map((id) => treeById.get(id)).map((tree) => {
      const nodes = catalog.nodes.filter((n) => n.treeId === tree.id);
      const got = nodes.reduce((s, n) => s + (levels[n.id] || 0), 0);
      const max = nodes.reduce((s, n) => s + n.maxLevel, 0);
      const rootBlock = blocker(catalog, nodes[0], levels, lab, complete);
      const treeLock = !levels[nodes[0].id] && rootBlock && rootBlock !== "maxed" ? rootBlock : null;

      const card = el("div", { class: `tree${complete.get(tree.id) ? " is-done" : ""}` },
        el("div", { class: "tree-head" }, el("h3", {}, tree.name), el("span", { class: "num" }, `${got}/${max}`)),
        treeLock ? el("p", { class: "tree-lock" }, `Locked: ${treeLock}`) : null);

      tree.tiers.forEach((_, t) => {
        const row = el("div", { class: "tier" });
        for (const node of nodes.filter((n) => n.tier === t)) {
          const lvl = levels[node.id] || 0;
          const why = blocker(catalog, node, levels, lab, complete);
          const state = lvl >= node.maxLevel ? "maxed" : busy.has(node.id) ? "busy" : why ? "locked" : "open";
          const stat = STATS[node.stat];
          const label = `${node.name}: level ${lvl} of ${node.maxLevel}. ${stat.label} +${node.perLevel}${stat.unit} per level.${state === "locked" ? ` Needs ${why}.` : ""}`;
          row.append(el("div", { class: `node ${state}`, title: label },
            el("div", { class: "n-name" }, node.name),
            el("div", { class: "n-lvl" },
              el("span", {}, `${lvl}/${node.maxLevel}`),
              state === "busy" ? el("span", {}, `→${lvl + 1}`) : null),
            el("div", { class: "meter" }, el("i", { style: `width:${(lvl / node.maxLevel) * 100}%` })),
            state === "locked" && !treeLock ? el("div", { class: "n-why" }, why) : null));
        }
        card.append(row);
      });
      return card;
    })
  );

  // Log: newest first, up to the selected day.
  const upto = result.events.filter((e) => e.minute <= minute);
  const shown = upto.slice(-25).reverse();
  $("#log tbody").replaceChildren(
    ...shown.map((e) =>
      el("tr", {},
        el("td", { class: "num muted" }, clock(e.minute)),
        el("td", {}, `${e.name} `, el("span", { class: "muted" }, `→ Lv ${e.level}`)),
        el("td", { class: "muted" }, treeById.get(e.treeId).name),
        el("td", { class: "num" }, formatDuration(e.duration))))
  );
  if (!shown.length) {
    $("#log tbody").replaceChildren(el("tr", {}, el("td", { colspan: 4, class: "muted" }, "Nothing finished yet. Move the day slider forward.")));
  }
  $("#log-sub").textContent = upto.length > shown.length
    ? `Latest ${shown.length} of ${fmt.format(upto.length)} levels finished by day ${day}`
    : `${upto.length} levels finished by day ${day}`;
}

// ---------- playback ----------

let playing = null;
function togglePlay() {
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
  let startDay = selectedDay;
  let t0 = performance.now();
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

// ---------- boot ----------

buildSettings();
wireChart();
$("#day").addEventListener("input", (e) => selectDay(Number(e.target.value)));
$("#play").addEventListener("click", togglePlay);
run();
