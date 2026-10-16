import { TREES, DEFAULT_CONFIG, UNPUBLISHED, RESEARCH_SPEED, ART_SOURCE } from "./data.js";
import {
  DAY, RESOURCES, Lab, buildCatalog, simulate, levelsAt, blocker, labLevelAt, progressMap,
  bonusTotals, researchBonus, treeProgress, treeRequirementText, meetsPct, researchDuration, formatDuration,
} from "./sim.js";

// v2: the trees were rebuilt from the four sources, so saves from the old
// made-up trees no longer apply.
const STORAGE_KEY = "lastz-research-sim:v2";
const PLAY_KEY = "lastz-research-sim:play:v2";
const TAB_KEY = "lastz-research-sim:tab:v2";
const PLAN_KEY = "lastz-research-sim:plan:v2";
const RULES_KEY = "lastz-research-sim:rules";
const catalog = buildCatalog(TREES);
const treeById = new Map(TREES.map((t) => [t.id, t]));
const totalLevels = catalog.nodes.reduce((sum, n) => sum + n.maxLevel, 0);
const RES_LABEL = { electricity: "Electricity", zents: "Zents", badges: "Badges" };

const ICONS = {
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 014 0v1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  clock: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 3.5V6l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  cross: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bolt: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7 1L2.5 7H6l-1 4 4.5-6H6z" fill="currentColor"/></svg>',
};

// Resource glyphs: lightning bolt, coin, medal.
const RES_ICONS = {
  electricity: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.2 0.6L2.2 6.9h3.2L4.6 11.4l5.2-6.6H6.5z" fill="currentColor"/></svg>',
  zents: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/><path d="M4 4h4L4 8h4" fill="none" stroke="var(--surface)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  badges: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 0.8l2.5 4 2.5-4" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="7.8" r="3.4" fill="currentColor"/><path d="M6 5.9l.6 1.2 1.3.2-1 .9.3 1.3L6 8.9l-1.2.6.3-1.3-1-.9 1.3-.2z" fill="var(--surface)"/></svg>',
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

function bonusValue(value, unit) {
  return `+${fmt.format(Math.round(value * 10) / 10)}${unit}`;
}

// One bonus at a given level: "Construction Speed +5%", "Unlocks Rider Camp".
function effectText(e, level) {
  if (e.text !== undefined) return `${e.label} ${e.text}`;
  if (!e.values) return `${e.label} (amount not published)`;
  return `${e.label} ${bonusValue(e.values[level - 1], e.unit)}`;
}

function effectsAt(node, level) {
  return node.effects.length ? node.effects.map((e) => effectText(e, level)).join(" · ") : "No bonus listed";
}

function costText(cost) {
  const parts = RESOURCES.filter((r) => cost[r] > 0).map((r) => `${compact(cost[r])} ${RES_LABEL[r].toLowerCase()}`);
  return parts.length ? parts.join(" · ") : "Free";
}

// "≈" marks numbers a source didn't publish.
const EST = "≈";
const isEstCost = (node, level) => node.estCost.has(level);
function estMark(on, what = "Estimate: not published by the sources") {
  return on ? el("abbr", { class: "est", title: what }, EST) : null;
}

function resIcon(r) {
  return el("span", { class: `ico res-${r}`, html: RES_ICONS[r] });
}

// Icon + amount for each resource a cost uses. Amounts you can't afford from
// `stock` are marked short; `est` prefixes estimated amounts with "≈".
function costList(cost, stock, est = false) {
  const items = RESOURCES.filter((r) => cost[r] > 0).map((r) => {
    const short = stock && (stock[r] || 0) < cost[r];
    const what = `${est ? "about " : ""}${fmt.format(cost[r])} ${RES_LABEL[r].toLowerCase()}`;
    return el("span", { class: `ci${short ? " short" : ""}`, title: `${what}${est ? " (estimate)" : ""}${short ? " (not enough)" : ""}` },
      resIcon(r), est ? EST : "", compact(cost[r]), el("span", { class: "sr" }, ` ${RES_LABEL[r].toLowerCase()}${est ? ", estimated" : ""}${short ? ", not enough" : ""}`));
  });
  return el("span", { class: "cost-list" }, items.length ? items : "Free");
}

function emptyCost() {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0]));
}

// Total cost and base time of levels from..to (inclusive) of one node.
// `est` is true when any of those levels' costs is an estimate.
function levelRange(node, from, to) {
  const cost = emptyCost();
  let time = 0;
  let est = false;
  for (let L = from; L <= to; L++) {
    const c = node.cost(L);
    for (const r of RESOURCES) cost[r] += c[r];
    time += node.time(L);
    est ||= isEstCost(node, L);
  }
  return { cost, time, est };
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

// ---------- game accounts ----------
// A player can keep several Last Z accounts (a main and farm accounts, say),
// each with its own settings, free plan and real-time game. The list and each
// account's data live in this browser and, inside the claude.ai viewer, in
// the player's own records too.

const ACCOUNTS_KEY = "lastz-research-sim:accounts:v1";
const MAX_ACCOUNTS = 20;
const ACCOUNT_DATA = ["settings", "plan", "game"];

function loadAccounts(saved = readStorage(ACCOUNTS_KEY)) {
  const list = (Array.isArray(saved?.list) ? saved.list : [])
    .filter((a) => typeof a?.id === "string" && /^[a-z0-9]{1,24}$/.test(a.id))
    .slice(0, MAX_ACCOUNTS)
    .map((a) => ({ id: a.id, name: cleanName(a.name) || "Account" }));
  if (!list.length) list.push({ id: "main", name: "Main account" });
  const active = list.some((a) => a.id === saved?.active) ? saved.active : list[0].id;
  return { list, active };
}

function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}

let accounts = loadAccounts();
const activeAccount = () => accounts.list.find((a) => a.id === accounts.active);

// Browser keys: the first account keeps the keys saves had before accounts
// existed, so nothing saved earlier is lost.
function localKey(base, id = accounts.active) {
  return id === "main" ? base : `${base}:${id}`;
}

function loadConfig(saved = readStorage(localKey(STORAGE_KEY))) {
  const config = clone(DEFAULT_CONFIG);
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

// ---------- saving ----------
// Everything saves in this browser at once. Inside the claude.ai viewer, with
// a signed-in player, it also saves to that player's own records (the db
// capability, under data/users/<id>/), which nobody else can read and which
// follow them to any device. Those are loaded when the page opens.

const SAVES = {
  settings: { base: STORAGE_KEY, browser: () => config, account: () => config },
  plan: { base: PLAN_KEY, browser: () => plan, account: () => plan },
  game: { base: PLAY_KEY, browser: () => playLab.toJSON(), account: () => playLab.toCompactJSON() },
};

const cloud = {
  db: null, // set once connected
  uid: null,
  status: "local",
  boot: {}, // state at page load, to spot changes made before the records answer
  last: {}, // write key -> copy last read or written, to skip unchanged writes
  queued: new Map(), // write key -> { ref, body, json } waiting to be written
  busy: new Set(), // write keys with a write in flight
  timer: null,
};

// The player's records: the account list, and each account's data. The
// first account uses the documents saves had before accounts existed.
function recordsRef(doc) {
  return cloud.db.collection(`data/users/${cloud.uid}`).doc(doc);
}
function accountRef(id, key) {
  return id === "main" ? recordsRef(key) : recordsRef("accounts").collection(id).doc(key);
}

const SAVE_TEXT = {
  local: "Saved in this browser",
  loading: "Loading your saved data…",
  saving: "Saving to your claude.ai account…",
  saved: "Saved to your claude.ai account",
  readonly: "Saved in this browser only: you need Contributor access to save to your claude.ai account",
  full: "Your claude.ai storage for this page is full. Saved in this browser.",
  error: "Couldn't reach your claude.ai account. Saved in this browser.",
};

function setSaveStatus(status) {
  cloud.status = status;
  const node = $("#save-status");
  if (!node) return;
  node.dataset.state = status;
  node.textContent = SAVE_TEXT[status];
}

function queueWrite(writeKey, ref, data) {
  if (!cloud.db || cloud.status === "readonly" || cloud.status === "full") return;
  const json = JSON.stringify(data);
  if (json === cloud.last[writeKey]) return;
  cloud.queued.set(writeKey, { ref, body: { v: 2, savedAt: Date.now(), data }, json });
  setSaveStatus("saving");
  // One write per pause: taps in quick succession become one save.
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(flushSaves, 700);
}

function save(key) {
  const s = SAVES[key];
  const id = accounts.active;
  writeStorage(localKey(s.base, id), s.browser());
  queueWrite(`${id}/${key}`, () => accountRef(id, key), s.account());
}

function saveAccounts() {
  writeStorage(ACCOUNTS_KEY, accounts);
  queueWrite("accounts", () => recordsRef("accounts"), accounts);
}

function flushSaves() {
  clearTimeout(cloud.timer);
  for (const [key, item] of cloud.queued) {
    if (cloud.busy.has(key)) continue; // written again once the current write finishes
    cloud.queued.delete(key);
    cloud.busy.add(key);
    writeRecord(key, item).finally(() => {
      cloud.busy.delete(key);
      if (cloud.queued.size) flushSaves();
      else if (!cloud.busy.size && cloud.status === "saving") setSaveStatus("saved");
    });
  }
}

async function writeRecord(key, item, retried = false) {
  try {
    await item.ref().set(item.body);
    cloud.last[key] = item.json;
  } catch (e) {
    if (e?.code === "unavailable" && !retried) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
      return writeRecord(key, item, true);
    }
    // invalid_argument here means this viewer may not write their records
    // (a Viewer or Commenter on a shared page).
    setSaveStatus(e?.code === "invalid_argument" ? "readonly" : e?.code === "quota_exceeded" ? "full" : "error");
  }
}

// One account's saved data, from the records when connected (they win),
// otherwise from this browser.
async function readAccountData(id) {
  const data = {};
  for (const key of ACCOUNT_DATA) data[key] = readStorage(localKey(SAVES[key].base, id));
  if (!cloud.db) return data;
  try {
    const snaps = await Promise.all(ACCOUNT_DATA.map((key) => accountRef(id, key).get()));
    ACCOUNT_DATA.forEach((key, i) => {
      const saved = snaps[i].exists ? snaps[i].data()?.data : undefined;
      if (!saved) return;
      data[key] = saved;
      cloud.last[`${id}/${key}`] = JSON.stringify(saved);
    });
  } catch {
    setSaveStatus("error");
  }
  return data;
}

// Make `data` the state on screen. A game may be a full browser save or a
// compact records save; anything missing starts from zero.
function applyAccountData(data) {
  config = loadConfig(data.settings ?? null);
  plan = loadPlan(data.plan ?? null);
  playLab = (data.game && (Lab.fromCompactJSON(catalog, config, data.game) || Lab.fromJSON(catalog, config, data.game)))
    || new Lab(catalog, config);
  for (const key of ACCOUNT_DATA) writeStorage(localKey(SAVES[key].base), SAVES[key].browser());
  if ($("#detail").open) $("#detail").close();
  buildSettings();
  run();
  renderPlay();
}

// Connect to the player's records, load what's there, and upload what this
// browser has that the records don't.
async function connectAccount() {
  if (!window.claude?.use) return; // not inside the claude.ai viewer
  setSaveStatus("loading");
  const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]).catch(() => [null, null]);
  const uid = user ? await user.id().catch(() => null) : null;
  if (!db || !uid) return setSaveStatus("local");
  Object.assign(cloud, { db, uid });
  let listSnap;
  try {
    listSnap = await recordsRef("accounts").get();
  } catch {
    cloud.db = null;
    return setSaveStatus("error");
  }
  setSaveStatus("saved");

  const savedList = listSnap.exists ? listSnap.data()?.data : undefined;
  if (savedList && JSON.stringify(accounts) === cloud.boot.accounts) {
    cloud.last.accounts = JSON.stringify(savedList);
    accounts = loadAccounts(savedList);
    writeStorage(ACCOUNTS_KEY, accounts);
  }
  saveAccounts(); // first save to the records, or changed here before they answered
  renderAccounts();

  // The open account: the records' copy wins unless it was changed here
  // after the page opened.
  const id = accounts.active;
  const fromRecords = await readAccountData(id);
  const sameAccount = id === cloud.boot.active;
  const data = {};
  let changed = !sameAccount;
  for (const key of ACCOUNT_DATA) {
    const editedHere = sameAccount && JSON.stringify(SAVES[key].account()) !== cloud.boot[key];
    const recorded = `${id}/${key}` in cloud.last;
    if (sameAccount && (editedHere || !recorded)) data[key] = SAVES[key].account();
    else {
      data[key] = fromRecords[key];
      changed = true;
    }
  }
  if (changed) applyAccountData(data);
  for (const key of ACCOUNT_DATA) save(key);
  refreshDetail();
}

async function switchAccount(id) {
  if (id === accounts.active || !accounts.list.some((a) => a.id === id)) return;
  flushSaves(); // the account being left is saved first
  accounts.active = id;
  saveAccounts();
  renderAccounts();
  setAccountsBusy(true);
  const data = await readAccountData(id);
  if (accounts.active !== id) return; // switched again meanwhile
  applyAccountData(data);
  setAccountsBusy(false);
  const name = activeAccount().name;
  planMessage = `Switched to ${name}.`;
  lastMessage = `Switched to ${name}.`;
  renderPlay();
}

function createAccount(name) {
  if (accounts.list.length >= MAX_ACCOUNTS) return null;
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  accounts.list.push({ id, name: cleanName(name) || `Account ${accounts.list.length + 1}` });
  saveAccounts();
  return id;
}

function renameAccount(id, name) {
  const account = accounts.list.find((a) => a.id === id);
  const clean = cleanName(name);
  if (!account || !clean || clean === account.name) return;
  account.name = clean;
  saveAccounts();
  renderAccounts();
}

async function deleteAccount(id) {
  if (accounts.list.length <= 1 || !accounts.list.some((a) => a.id === id)) return;
  if (id === accounts.active) await switchAccount(accounts.list.find((a) => a.id !== id).id);
  accounts.list = accounts.list.filter((a) => a.id !== id);
  saveAccounts();
  for (const key of ACCOUNT_DATA) {
    try {
      localStorage.removeItem(localKey(SAVES[key].base, id));
    } catch {
      /* storage unavailable */
    }
    cloud.queued.delete(`${id}/${key}`);
    delete cloud.last[`${id}/${key}`];
    if (cloud.db) accountRef(id, key).delete().catch(() => setSaveStatus("error"));
  }
  renderAccounts();
}

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
      step: r === "badges" ? 100 : 100000,
    })),
  },
  {
    legend: "Starting stock",
    fields: RESOURCES.map((r) => ({
      path: `startingStock.${r}`,
      label: r === "badges" ? "Research Badges" : RES_LABEL[r],
      min: 0,
      max: 1e11,
      step: r === "badges" ? 100 : 100000,
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
  if (activeTab === "auto") note.textContent = "Changes rerun the auto plan instantly.";
  else if (rules === "plan") note.textContent = "Free planning has no timers or income, so only the research speed bonus applies (to the timers it shows). Switch to Real time to use the rest.";
  else note.textContent = "Income, boosts, helps and queues apply to your game right away. Starting stock and Laboratory level apply when you restart.";
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

let activeTab = "play";

function setTab(tab, { focus = false } = {}) {
  activeTab = tab;
  for (const name of ["play", "auto"]) {
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
  for (const name of ["play", "auto"]) $(`#tab-${name}`).addEventListener("click", () => setTab(name));
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
  save("settings");
  result = simulate(catalog, config);
  let p = 0;
  cumulativePower = result.events.map((e) => (p += catalog.byId.get(e.nodeId).powerGain(e.level)));
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
  const progress = progressMap(catalog, result.levels);
  const busyTrees = new Set(result.inProgress.map((q) => catalog.byId.get(q.nodeId).treeId));
  const rows = config.priority.map((id) => treeById.get(id)).map((tree) => {
    const nodes = nodesOf(tree.id);
    const max = nodes.reduce((s, n) => s + n.maxLevel, 0);
    const got = nodes.reduce((s, n) => s + (result.levels[n.id] || 0), 0);
    let status;
    if (tree.id in result.treeDone) {
      status = chip("done", "check", `Done on day ${Math.ceil(result.treeDone[tree.id] / DAY)}`);
    } else if (busyTrees.has(tree.id) || nodes.some((n) => !blocker(catalog, n, result.levels, lab, progress))) {
      status = chip("active", "clock", "In progress");
    } else {
      const reasons = nodes.map((n) => blocker(catalog, n, result.levels, lab, progress)).filter((b) => b && b !== "maxed");
      status = chip("locked", "lock", reasons[0] ? `Needs ${reasons[0]}` : "Locked");
    }
    const meter = el("div", { class: `meter${got === max ? " done" : ""}` }, el("i", { style: `width:${(got / max) * 100}%` }));
    return el("tr", {},
      el("td", { class: "tree-name" }, tree.name),
      el("td", { class: "col-cost" }, chip(tree.currency, null, tree.currency === "badges" ? "Badges" : "Electricity, Zents")),
      el("td", {}, el("div", { class: "progress-cell" }, meter, el("span", { class: "num" }, `${got}/${max}`))),
      el("td", {}, status));
  });
  $("#tree-table tbody").replaceChildren(...rows);
  $("#trees-sub").textContent = `Listed in your research order · after ${config.days} days`;
}

// ---------- shared tree map ----------

// What gates a whole tree, for its card: "Laboratory Lv 16", "New Home at 50%".
function treeGate(tree, view) {
  const gates = tree.requires
    .filter((r) => !meetsPct(view.progress.get(r.id), r.pct))
    .map((r) => treeRequirementText(catalog, r));
  if (tree.lab && view.labLevel < tree.lab) gates.push(`Laboratory Lv ${tree.lab}`);
  return gates.join(", ");
}

function sourceLine(tree) {
  return el("p", { class: "tree-src" }, `Data: ${tree.sources.join(", ")} · Art: ${ART_SOURCE}`);
}

// The tree's in-game Laboratory card art. Decorative: the tree name sits beside it.
function treeArt(tree, cls) {
  return tree.art
    ? el("img", { class: cls, src: tree.art, alt: "", width: 222, height: 162, loading: "lazy", decoding: "async" })
    : null;
}

// view: { levels, labLevel, progress, complete, state(node) -> { cls, label, note } }
function renderTreeMap(container, view, mode) {
  container.replaceChildren(
    ...config.priority.map((id) => treeById.get(id)).map((tree) => {
      const nodes = nodesOf(tree.id);
      const got = nodes.reduce((s, n) => s + (view.levels[n.id] || 0), 0);
      const max = nodes.reduce((s, n) => s + n.maxLevel, 0);
      const started = nodes.some((n) => view.levels[n.id] || view.busy.has(n.id));
      const treeLock = started ? null : treeGate(tree, view) || null;

      // Resources still needed to finish the tree (levels already paid for excluded).
      const left = emptyCost();
      let leftEst = false;
      for (const n of nodes) {
        const from = (view.levels[n.id] || 0) + 1 + (view.busy.has(n.id) ? 1 : 0);
        const r = levelRange(n, from, n.maxLevel);
        for (const k of RESOURCES) left[k] += r.cost[k];
        leftEst ||= r.est;
      }
      const done = view.complete.get(tree.id);
      const notes = [...tree.conditions.map((c) => `Also needs ${c}.`), ...tree.notes];

      const card = el("div", { class: `tree${done ? " is-done" : ""}` },
        el("div", { class: "tree-top" },
          treeArt(tree, "tree-art"),
          el("div", { class: "tree-top-text" },
            el("div", { class: "tree-head" },
              el("h3", {}, tree.name),
              el("span", { class: "num" }, `${got}/${max}`)),
            el("p", { class: "tree-desc" }, tree.description))),
        sourceLine(tree),
        notes.length
          ? el("details", { class: "tree-notes" }, el("summary", {}, notes.length === 1 ? "1 note on this data" : `${notes.length} notes on this data`),
            el("ul", {}, ...notes.map((n) => el("li", {}, n))))
          : null,
        done ? null : el("p", { class: "tree-left" }, el("span", { class: "eyebrow" }, "Left to finish"), costList(left, null, leftEst)),
        treeLock ? el("p", { class: "tree-lock" }, icon("lock"), `Needs ${treeLock}`) : null);

      const rows = Math.max(...nodes.map((n) => n.tier)) + 1;
      for (let t = 0; t < rows; t++) {
        const row = el("div", { class: "tier" });
        for (const node of nodes.filter((n) => n.tier === t)) {
          const lvl = view.levels[node.id] || 0;
          const st = view.state(node);
          // Next level's cost, unless maxed or already paid (researching now).
          const next = lvl < node.maxLevel && !view.busy.has(node.id) ? node.cost(lvl + 1) : null;
          const nextEst = next ? isEstCost(node, lvl + 1) : false;
          const costLabel = next ? ` Level ${lvl + 1} costs ${nextEst ? "about " : ""}${costText(next)}.` : "";
          // One-tap upgrade, offered only when this research can go up right now.
          const act = view.action?.(node, st);
          row.append(el("div", { class: `node ${st.cls}${act ? " has-up" : ""}` },
            el("button", {
              type: "button",
              class: "node-main",
              "aria-label": `${node.name}, level ${lvl} of ${node.maxLevel}. ${st.label}.${costLabel} Open details.`,
              onclick: () => openDetail(node.id, mode),
            },
              el("span", { class: "n-name" }, node.name),
              el("span", { class: "n-lvl" },
                el("span", {}, `${lvl}/${node.maxLevel}`),
                st.badge ? el("span", { class: "n-badge" }, st.badge) : null),
              el("span", { class: "meter" }, el("i", { style: `width:${(lvl / node.maxLevel) * 100}%` })),
              next ? el("span", { class: "n-cost" }, costList(next, mode === "play" ? view.stock : null, nextEst)) : null,
              st.note && !treeLock ? el("span", { class: "n-why" }, st.note) : null),
            act ? el("button", { type: "button", class: "node-up", "aria-label": act.label, title: act.label, onclick: act.run }, "+") : null));
        }
        card.append(row);
      }
      return card;
    }),
    unpublishedCard()
  );
}

// Trees the sources name without listing their research.
function unpublishedCard() {
  return el("div", { class: "tree tree-missing" },
    el("div", { class: "tree-head" }, el("h3", {}, "Not listed")),
    el("p", { class: "tree-desc" }, "These trees are in the game, but none of the four sources lists their research, so they aren't simulated."),
    el("ul", { class: "missing-list" }, ...UNPUBLISHED.map((u) =>
      el("li", {}, treeArt(u, "missing-art"), el("span", {}, el("b", {}, u.name), ` ${u.note}`)))));
}

// ---------- auto plan: day view ----------

const completeFrom = (progress) => new Map([...progress].map(([id, p]) => [id, p >= 1]));

function autoView(day) {
  const minute = day * DAY;
  const levels = levelsAt(result.events, minute);
  const labLevel = labLevelAt(config, minute);
  const progress = progressMap(catalog, levels);
  const complete = completeFrom(progress);
  const busy = new Map(result.events.filter((e) => e.start <= minute && e.minute > minute).map((e) => [e.nodeId, e]));
  // Research still running when the run ends.
  if (day === config.days) for (const q of result.inProgress) busy.set(q.nodeId, q);
  const speed = config.baseResearchSpeed + researchBonus(catalog, levels);
  const stock = result.daily[day].stock;
  return {
    minute, levels, labLevel, progress, complete, busy, speed, stock,
    state(node) {
      const lvl = levels[node.id] || 0;
      if (lvl >= node.maxLevel) return { cls: "maxed", label: "Maxed" };
      if (busy.has(node.id)) return { cls: "busy", label: `Researching level ${lvl + 1}`, badge: `→${lvl + 1}` };
      const why = blocker(catalog, node, levels, labLevel, progress);
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
    ...["electricity", "zents"].map((r) => el("span", { class: "res-label" }, resIcon(r), `${RES_LABEL[r]} `, el("b", {}, compact(snap.stock[r])))),
    el("span", { class: "res-label" }, resIcon("badges"), "Badges ", el("b", {}, fmt.format(Math.floor(snap.stock.badges)))),
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
  const saved = readStorage(localKey(PLAY_KEY));
  return (saved && Lab.fromJSON(catalog, config, saved)) || new Lab(catalog, config);
}

function savePlay() {
  save("game");
}

function playView() {
  const lab = playLab;
  const progress = lab.treeProgress();
  const complete = completeFrom(progress);
  const speed = lab.researchSpeed();
  return {
    levels: lab.levels,
    labLevel: lab.labLevel,
    progress,
    complete,
    speed,
    stock: lab.stock,
    busy: new Map(lab.queues.map((q) => [q.nodeId, q])),
    state(node) {
      const s = lab.status(node, { progress, speed });
      const lvl = lab.levels[node.id] || 0;
      switch (s.state) {
        case "maxed": return { cls: "maxed", label: "Maxed" };
        case "busy": {
          const q = lab.queues.find((q) => q.nodeId === node.id);
          return { cls: "busy", label: `Researching level ${lvl + 1}`, badge: formatDuration(q.remaining) };
        }
        case "locked": return { cls: "locked", label: s.reason, note: s.reason.replace(/^Needs /, "") };
        case "short": {
          const need = Object.entries(s.shortfall).map(([r, v]) => `${compact(v)} more ${RES_LABEL[r].toLowerCase()}`);
          return { cls: "short", label: `Not enough resources: needs ${need.join(" and ")}` };
        }
        case "queueFull": return { cls: "open", label: "Unlocked, all queues busy" };
        default: return { cls: "ready", label: `Ready: level ${lvl + 1} in ${formatDuration(s.duration)}` };
      }
    },
    action(node, st) {
      if (st.cls !== "ready") return null;
      const lvl = lab.levels[node.id] || 0;
      return { label: `Start ${node.name} level ${lvl + 1}`, run: () => startResearch(node.id) };
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
    // Alliance helps can cover a short timer completely: finish it right away.
    playLab.advanceTo(playLab.t);
  });
}

function slotCount() {
  return config.queues + (config.secondQueueDay > 0 ? 1 : 0);
}

function renderPlay() {
  if (!playLab || activeTab !== "play") return;
  for (const name of ["plan", "real"]) $(`#rules-${name}`).setAttribute("aria-pressed", String(rules === name));
  $("#rules-desc").textContent = rules === "plan"
    ? "Start at zero and upgrade anything instantly. Prerequisites and Laboratory level still apply. No timers or resource limits."
    : "A timed game: pay resources, wait for research to finish, skip time ahead and spend speedups.";
  $("#hud-plan").hidden = rules !== "plan";
  $("#hud-real").hidden = rules !== "real";
  $("#p-log-panel").hidden = rules !== "real";

  const view = rules === "plan" ? planView() : playView();
  if (rules === "plan") renderPlanHud(view);
  else renderRealHud(view);

  renderBonuses(view.levels);
  const legend = rules === "plan"
    ? [["ready", "Can upgrade now"], ["locked", "Locked"], ["maxed", "Maxed"]]
    : [["ready", "Ready to start"], ["busy", "Researching"], ["short", "Short on resources"], ["locked", "Locked"], ["maxed", "Maxed"]];
  $("#p-legend").replaceChildren(...legend.map(([cls, text]) => el("span", {}, el("i", { class: `sw ${cls}` }), text)));
  $("#p-map-sub").textContent = rules === "plan"
    ? "Tap + to upgrade · tap a card for details"
    : "Tap + to start research · tap a card for details";
  renderTreeMap($("#p-map"), view, rules === "plan" ? "plan" : "play");
}

function renderBonuses(levels) {
  const { totals, unlocked } = bonusTotals(catalog, levels);
  totals.sort((a, b) => (b.label === RESEARCH_SPEED) - (a.label === RESEARCH_SPEED) || a.label.localeCompare(b.label));
  $("#p-bonuses").replaceChildren(
    ...(totals.length || unlocked.length
      ? [
        ...totals.map((t) => el("span", { class: "bonus", title: t.label === RESEARCH_SPEED ? "Shortens every research timer" : "Shown for reference: only research speed changes the simulation" },
          `${t.label} `, el("b", {}, bonusValue(t.value, t.unit)))),
        ...unlocked.map((u) => el("span", { class: "bonus unlock" }, "Unlocked ", el("b", {}, u))),
      ]
      : [el("p", { class: "hint" }, "No bonuses yet. Upgrade a research to get your first one.")])
  );
}

function renderRealHud(view) {
  const lab = playLab;

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
        el("span", { class: "eyebrow res-label" }, resIcon(r), RES_LABEL[r]),
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

// ---------- free planning ----------
// Start at zero and upgrade anything instantly: no timers, income or queues.
// Prerequisites and Laboratory levels still apply.

let rules = readStorage(RULES_KEY) === "real" ? "real" : "plan";
let plan = null;
let planMessage = "";

function loadPlan(saved = readStorage(localKey(PLAN_KEY))) {
  const levels = {};
  for (const [id, lvl] of Object.entries(saved?.levels || {})) {
    const node = catalog.byId.get(id);
    if (node && Number.isInteger(lvl) && lvl > 0) levels[id] = Math.min(lvl, node.maxLevel);
  }
  const labLevel = Math.min(config.labMaxLevel, Math.max(1, Math.floor(Number(saved?.labLevel)) || 1));
  return { levels, labLevel };
}

function savePlan() {
  save("plan");
}

function planView() {
  const progress = progressMap(catalog, plan.levels);
  const complete = completeFrom(progress);
  const speed = config.baseResearchSpeed + researchBonus(catalog, plan.levels);
  return {
    levels: plan.levels,
    labLevel: plan.labLevel,
    progress,
    complete,
    speed,
    stock: null,
    busy: new Map(),
    state(node) {
      const lvl = plan.levels[node.id] || 0;
      if (lvl >= node.maxLevel) return { cls: "maxed", label: "Maxed" };
      const why = blocker(catalog, node, plan.levels, plan.labLevel, progress);
      if (why) return { cls: "locked", label: `Locked: needs ${why}`, note: why };
      return { cls: "ready", label: `Can upgrade to level ${lvl + 1}` };
    },
    action(node, st) {
      if (st.cls !== "ready") return null;
      return { label: `Upgrade ${node.name} to level ${(plan.levels[node.id] || 0) + 1}`, run: () => planUp(node.id) };
    },
  };
}

// Why a level can't be removed: research built on it would lose a requirement.
function planDownBlocker(node) {
  const lvl = plan.levels[node.id] || 0;
  if (!lvl) return "It is already at level 0";
  for (const u of node.unlocks) {
    if ((plan.levels[u.id] || 0) > 0 && lvl - 1 < u.level) {
      return `${catalog.byId.get(u.id).name} needs it at Lv ${u.level}`;
    }
  }
  // Trees that need this tree at some percentage, and already have research.
  const after = treeProgress(catalog, node.treeId, { ...plan.levels, [node.id]: lvl - 1 });
  for (const tree of TREES) {
    const req = tree.requires.find((r) => r.id === node.treeId);
    if (req && !meetsPct(after, req.pct) && nodesOf(tree.id).some((n) => plan.levels[n.id])) {
      return `${tree.name} needs ${treeRequirementText(catalog, req)}`;
    }
  }
  return null;
}

function planLabDownBlocker() {
  if (plan.labLevel <= 1) return "The Laboratory is at level 1";
  const needs = catalog.nodes.find((n) => plan.levels[n.id] && n.labRequired >= plan.labLevel);
  return needs ? `${needs.name} needs Laboratory Lv ${needs.labRequired}` : null;
}

function planChange(fn) {
  planMessage = fn() || planMessage;
  savePlan();
  renderPlay();
  refreshDetail();
}

function planUp(nodeId) {
  const node = catalog.byId.get(nodeId);
  const lvl = plan.levels[node.id] || 0;
  if (lvl >= node.maxLevel || blocker(catalog, node, plan.levels, plan.labLevel)) return;
  planChange(() => {
    plan.levels[node.id] = lvl + 1;
    const unlocked = node.unlocks
      .map((u) => catalog.byId.get(u.id))
      .filter((n) => !plan.levels[n.id] && !blocker(catalog, n, plan.levels, plan.labLevel));
    return `${node.name} is now Lv ${lvl + 1}.${unlocked.length ? ` Unlocked: ${unlocked.map((n) => n.name).join(", ")}.` : ""}`;
  });
}

function planDown(nodeId) {
  const node = catalog.byId.get(nodeId);
  if (planDownBlocker(node)) return;
  planChange(() => {
    const lvl = plan.levels[node.id] - 1;
    if (lvl) plan.levels[node.id] = lvl;
    else delete plan.levels[node.id];
    return `${node.name} is back to Lv ${lvl}.`;
  });
}

function planSetLab(level) {
  const target = Math.min(config.labMaxLevel, Math.max(1, level));
  if (target < plan.labLevel && planLabDownBlocker()) return;
  planChange(() => {
    plan.labLevel = target;
    return `Laboratory is now Lv ${target}.`;
  });
}

function renderPlanHud(view) {
  const spent = emptyCost();
  let baseTime = 0;
  let levels = 0;
  let power = 0;
  for (const node of catalog.nodes) {
    const lvl = plan.levels[node.id] || 0;
    if (!lvl) continue;
    const r = levelRange(node, 1, lvl);
    for (const k of RESOURCES) spent[k] += r.cost[k];
    baseTime += r.time;
    levels += lvl;
    power += node.powerAt(lvl);
  }

  $("#plan-lab").textContent = `Lv ${plan.labLevel}`;
  const downWhy = planLabDownBlocker();
  $("#plan-lab-down").disabled = Boolean(downWhy);
  $("#plan-lab-down").title = downWhy || "Lower Laboratory level";
  $("#plan-lab-up").disabled = plan.labLevel >= config.labMaxLevel;

  $("#plan-stats").replaceChildren(
    el("div", {}, el("span", { class: "eyebrow" }, "Levels"), el("b", { class: "num" }, `${fmt.format(levels)} / ${fmt.format(totalLevels)}`), el("small", {}, `${TREES.filter((t) => view.complete.get(t.id)).length} of ${TREES.length} trees finished`)),
    el("div", {}, el("span", { class: "eyebrow" }, "Power"), el("b", { class: "num" }, fmt.format(power)), el("small", {}, "from research")),
    el("div", {}, el("span", { class: "eyebrow" }, "Research speed"), el("b", { class: "num" }, `+${view.speed.toFixed(1)}%`), el("small", {}, "shortens timers")),
    el("div", {}, el("span", { class: "eyebrow" }, "Research time"), el("b", { class: "num" }, formatDuration(baseTime)), el("small", {}, "base timers, before speed bonuses"))
  );
  $("#plan-spent").replaceChildren(
    ...RESOURCES.map((r) =>
      el("div", { class: "res" },
        el("span", { class: "eyebrow res-label" }, resIcon(r), RES_LABEL[r]),
        el("b", { class: "num" }, compact(spent[r])),
        el("small", {}, r === "badges" ? "Research Badges" : "spent")))
  );
  $("#plan-message").textContent = planMessage;
}

let planResetArmed = null;
function wirePlan() {
  for (const name of ["plan", "real"]) {
    $(`#rules-${name}`).addEventListener("click", () => {
      rules = name;
      writeStorage(RULES_KEY, name);
      renderSettingsNote();
      renderPlay();
    });
  }
  $("#plan-lab-up").addEventListener("click", () => planSetLab(plan.labLevel + 1));
  $("#plan-lab-down").addEventListener("click", () => planSetLab(plan.labLevel - 1));
  $("#plan-reset").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!planResetArmed) {
      btn.textContent = "Click again to reset";
      planResetArmed = setTimeout(() => {
        planResetArmed = null;
        btn.textContent = "Reset to zero";
      }, 3000);
      return;
    }
    clearTimeout(planResetArmed);
    planResetArmed = null;
    btn.textContent = "Reset to zero";
    planChange(() => {
      plan = { levels: {}, labLevel: 1 };
      return "Everything is back to zero.";
    });
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
  const isPlay = detail.mode === "play";
  const isPlan = detail.mode === "plan";
  const view = isPlan ? planView() : isPlay ? playView() : autoView(selectedDay);
  const events = isPlay ? playLab.events : isPlan ? [] : result.events;
  const lvl = view.levels[node.id] || 0;
  const busyQ = isPlay ? playLab.queues.find((q) => q.nodeId === node.id) : view.busy.get(node.id);

  // Requirements for the next level.
  const reqs = [];
  for (const r of tree.requires) {
    const share = view.progress.get(r.id);
    reqs.push({ ok: meetsPct(share, r.pct), text: treeRequirementText(catalog, r), now: `now ${Math.floor(share * 100)}%` });
  }
  reqs.push({
    ok: view.labLevel >= node.labRequired,
    text: `Laboratory Lv ${node.labRequired}`,
    now: `now Lv ${view.labLevel}`,
    note: node.estLab ? "as in Shooter Training" : null,
  });
  for (const p of node.prereqs) {
    const have = view.levels[p.id] || 0;
    reqs.push({
      ok: have >= p.level,
      text: `${catalog.byId.get(p.id).name} Lv ${p.level}`,
      now: `now Lv ${have}`,
      nodeId: p.id,
      note: node.estLinks ? "link estimated" : null,
    });
  }
  for (const c of tree.conditions) reqs.push({ ok: true, text: c, info: true });

  // Action area (play) or context line (auto).
  let action;
  const downWhy = isPlan ? planDownBlocker(node) : null;
  const downBtn = isPlan && lvl > 0
    ? el("button", { type: "button", class: "btn", disabled: Boolean(downWhy), title: downWhy || "", onclick: () => planDown(node.id) }, "− Remove a level")
    : null;
  if (lvl >= node.maxLevel) {
    action = el("div", { class: "d-action-row" },
      el("p", { class: "d-state done" }, icon("check"), "Maxed. Every level of this research is done."), downBtn);
  } else if (isPlan) {
    const why = blocker(catalog, node, plan.levels, plan.labLevel, view.complete);
    const labBtn = plan.labLevel < node.labRequired
      ? el("button", { type: "button", class: "btn", onclick: () => planSetLab(node.labRequired) }, `Raise Laboratory to Lv ${node.labRequired}`)
      : null;
    action = why
      ? el("div", { class: "d-action-row" }, el("p", { class: "d-state locked" }, icon("lock"), `Locked. Needs ${why}.`), labBtn, downBtn)
      : el("div", { class: "d-action-row" },
        el("button", { type: "button", class: "btn primary big", onclick: () => planUp(node.id) }, `+ Upgrade to Lv ${lvl + 1}`), downBtn);
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

  // Resources for the next level, and for everything left.
  let costs = null;
  if (lvl < node.maxLevel) {
    const L = lvl + 1;
    const paid = Boolean(busyQ);
    const showStock = !paid && Boolean(view.stock);
    const cost = node.cost(L);
    const est = isEstCost(node, L);
    const haveLabel = isPlay ? "You have" : `Stock on day ${selectedDay}`;
    const resRows = RESOURCES.filter((r) => cost[r] > 0).map((r) => {
      const have = showStock ? Math.floor(view.stock[r]) : 0;
      const short = cost[r] - have;
      return el("tr", {},
        el("td", {}, el("span", { class: "res-label" }, resIcon(r), RES_LABEL[r])),
        el("td", { class: "num" }, estMark(est), el("b", {}, fmt.format(cost[r]))),
        showStock ? el("td", { class: "num" }, fmt.format(have)) : null,
        showStock ? el("td", {}, short > 0 ? chip("short", "cross", `Short ${compact(short)}`) : chip("done", "check", "Enough")) : null);
    });
    const restFrom = paid ? L + 1 : L;
    const rest = restFrom <= node.maxLevel ? levelRange(node, restFrom, node.maxLevel) : null;
    costs = el("div", { class: "d-costs" },
      el("h3", {}, paid ? `Level ${L} resources (paid when it started)` : `Resources for level ${L}`),
      el("div", { class: "table-scroll" },
        el("table", { class: "res-table" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Resource"), el("th", { class: "num" }, "Needed"),
            showStock ? el("th", { class: "num" }, haveLabel) : null, showStock ? el("th", {}, "Status") : null)),
          el("tbody", {}, ...resRows,
            el("tr", { class: "timer-row" },
              el("td", {}, el("span", { class: "res-label" }, icon("clock"), "Research time")),
              el("td", { class: "num" }, estMark(true, "Estimate: no source publishes research timers"), el("b", {}, formatDuration(researchDuration(node.time(L), view.speed)))),
              el("td", { class: "num muted", colspan: showStock ? 2 : 1 }, `at +${view.speed.toFixed(1)}% speed, before helps`))))),
      est ? el("p", { class: "hint" }, `${EST} The sources don't publish this level's cost. It's estimated from the published levels and how costs grow level by level in the game.`) : null,
      rest
        ? el("div", { class: "d-total" },
          el("span", { class: "eyebrow" }, restFrom === node.maxLevel
            ? `Level ${restFrom}`
            : `Levels ${restFrom}–${node.maxLevel} together`),
          costList(rest.cost, isPlay ? view.stock : null, rest.est),
          el("span", { class: "muted" }, ` · ${formatDuration(researchDuration(rest.time, view.speed))} of research`))
        : null,
      isPlan && lvl > 0
        ? el("div", { class: "d-total" },
          el("span", { class: "eyebrow" }, `Spent on levels 1–${lvl}`),
          costList(levelRange(node, 1, lvl).cost, null, levelRange(node, 1, lvl).est))
        : null);
  }

  // One cost column per resource this research uses.
  const usedRes = RESOURCES.filter((r) => node.cost(node.maxLevel)[r] > 0);
  const all = levelRange(node, 1, node.maxLevel);

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
    const levelEst = isEstCost(node, L);
    rows.push(el("tr", { class: L <= lvl ? "is-done" : L === lvl + 1 ? "is-next" : "" },
      el("td", { class: "num" }, L),
      el("td", {},
        node.effects.length
          ? node.effects.map((e) => el("div", { class: "num" }, e.text !== undefined ? e.text : e.values ? el("b", {}, bonusValue(e.values[L - 1], e.unit)) : "–"))
          : "–",
        unlocks.length ? el("div", { class: "d-unlock" }, `Required for ${unlocks.join(", ")}`) : null),
      ...usedRes.map((r) => el("td", { class: "num d-res" }, levelEst ? EST : "", compact(node.cost(L)[r]))),
      el("td", { class: "num" }, compact(node.powerAt(L))),
      el("td", { class: "num" }, formatDuration(researchDuration(node.time(L), view.speed))),
      el("td", {}, when)));
  }

  const leadsTo = node.unlocks.map((u) => catalog.byId.get(u.id).name);
  const opens = TREES.filter((t) => t.requires.some((r) => r.id === tree.id))
    .map((t) => `${t.name} (at ${t.requires.find((r) => r.id === tree.id).pct}% of ${tree.name})`);
  const bonusName = node.effects.length ? node.effects.map((e) => e.label === "Unlocks" ? `Unlocks ${e.text}` : e.label).join(" · ") : "No bonus listed";
  const speedNode = node.effects.some((e) => e.label === RESEARCH_SPEED);
  const dataNotes = [
    `Data: ${node.source}.`,
    node.estCost.size ? `${EST} Costs for level${node.estCost.size > 1 ? "s" : ""} ${[...node.estCost].join(", ")} are estimates.` : null,
    node.estPower ? "Power is estimated from badge cost." : null,
    node.estLinks ? "Links between research in this tree are estimated." : null,
    node.effects.some((e) => !e.values && e.text === undefined) ? "The source doesn't publish this bonus's amounts." : null,
    "Timers are estimates: no source publishes them.",
  ].filter(Boolean);

  $("#detail-body").replaceChildren(
    el("div", { class: "d-head" },
      el("div", { class: "d-title" },
        treeArt(tree, "d-art"),
        el("div", {},
          el("div", { class: "eyebrow" }, `${tree.name} · Row ${node.tier + 1} · ${tree.currency === "badges" ? "Badge research" : "Electricity and Zents"}`),
          el("h2", { id: "detail-title" }, node.name))),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => $("#detail").close() }, icon("cross"))),
    el("p", { class: "d-desc" }, bonusName),
    el("div", { class: "d-effect" },
      el("div", {},
        el("span", { class: "eyebrow" }, `Now · Lv ${lvl} of ${node.maxLevel}`),
        el("b", {}, lvl ? effectsAt(node, lvl) : "No bonus yet"),
        el("small", {}, `${compact(node.powerAt(lvl))} power`)),
      el("div", {},
        el("span", { class: "eyebrow" }, lvl < node.maxLevel ? `Next · Lv ${lvl + 1}` : "Max level"),
        el("b", {}, effectsAt(node, Math.min(lvl + 1, node.maxLevel))),
        el("small", {}, lvl < node.maxLevel
          ? `Max: ${effectsAt(node, node.maxLevel)}`
          : "Fully researched"))),
    el("p", { class: "hint" }, speedNode
      ? "This bonus shortens every research you start after each level finishes."
      : "Shown for reference. Only research speed changes timers in this simulator."),
    action,
    costs,
    lvl < node.maxLevel
      ? el("div", { class: "d-reqs" },
        el("h3", {}, "Requirements"),
        el("ul", {}, ...reqs.map((r) =>
          el("li", { class: r.info ? "info" : r.ok ? "ok" : "no" },
            r.info ? icon("lock") : icon(r.ok ? "check" : "cross"),
            r.nodeId
              ? el("button", { type: "button", class: "linkish", onclick: () => openDetail(r.nodeId, detail.mode) }, r.text)
              : el("span", {}, r.text),
            r.now && !r.ok ? el("span", { class: "muted" }, ` (${r.now})`) : null,
            r.note ? el("span", { class: "muted" }, ` · ${r.note}`) : null))))
      : null,
    el("div", { class: "d-levels" },
      el("h3", {}, "Levels"),
      el("p", { class: "hint" }, `Bonus and power are the totals at that level. Each level's resources are paid when it starts. ${EST} marks estimated costs. Timers are estimates at your current research speed (+${view.speed.toFixed(1)}%), before helps and speedups.`),
      el("div", { class: "table-scroll" },
        el("table", { class: "d-table" },
          el("thead", {}, el("tr", {},
            el("th", { class: "num" }, "Lv"), el("th", {}, "Bonus"),
            ...usedRes.map((r) => el("th", { class: "num d-res" }, el("span", { class: "res-label" }, resIcon(r), RES_LABEL[r]))),
            el("th", { class: "num" }, "Power"),
            el("th", { class: "num" }, "Timer"),
            el("th", {}, isPlay ? "Finished" : isPlan ? "Status" : "Auto plan"))),
          el("tbody", {}, ...rows),
          el("tfoot", {}, el("tr", {},
            el("td", {}), el("td", {}, el("b", {}, "All levels")),
            ...usedRes.map((r) => el("td", { class: "num d-res" }, el("b", {}, all.est ? EST : "", compact(all.cost[r])))),
            el("td", { class: "num" }, el("b", {}, compact(node.powerAt(node.maxLevel)))),
            el("td", { class: "num" }, el("b", {}, formatDuration(researchDuration(all.time, view.speed)))),
            el("td", {})))))),
    leadsTo.length ? el("p", { class: "d-leads" }, el("b", {}, "Leads to: "), leadsTo.join(", ")) : null,
    opens.length ? el("p", { class: "d-leads" }, el("b", {}, "This tree opens: "), opens.join(", ")) : null,
    el("p", { class: "d-src" }, dataNotes.join(" "))
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

// ---------- game accounts: controls ----------

let deleteArmed = null; // account waiting for a second click to delete

function renderAccounts({ dialog = true } = {}) {
  const select = $("#acct-select");
  select.replaceChildren(...accounts.list.map((a) => el("option", { value: a.id }, a.name)));
  select.value = accounts.active;
  if (dialog && $("#accounts").open) renderAccountsDialog();
}

function setAccountsBusy(busy) {
  $("#acct-select").disabled = busy;
  $("#acct").classList.toggle("is-busy", busy);
}

function renderAccountsDialog(message) {
  $("#acct-list").replaceChildren(...accounts.list.map((a) => {
    const current = a.id === accounts.active;
    const name = el("input", { type: "text", id: `acct-name-${a.id}`, value: a.name, maxlength: 40, "aria-label": `Name of ${a.name}` });
    name.addEventListener("change", () => renameAccount(a.id, name.value));
    const armed = deleteArmed === a.id;
    return el("li", { class: `acct-item${current ? " is-current" : ""}` },
      name,
      current
        ? chip("active", "check", "Open now")
        : el("button", { type: "button", class: "btn small", onclick: () => switchAccount(a.id) }, "Open"),
      el("button", {
        type: "button",
        class: `btn small ${armed ? "danger" : "ghost"}`,
        disabled: accounts.list.length <= 1,
        title: accounts.list.length <= 1 ? "You need at least one account" : "",
        onclick: () => armDelete(a.id),
      }, armed ? "Click again to delete" : "Delete"));
  }));
  $("#acct-new").disabled = accounts.list.length >= MAX_ACCOUNTS;
  $("#acct-new-name").placeholder = `Farm ${accounts.list.length}`;
  if (message !== undefined) $("#acct-message").textContent = message;
}

let deleteTimer = null;
async function armDelete(id) {
  clearTimeout(deleteTimer);
  if (deleteArmed !== id) {
    deleteArmed = id;
    renderAccountsDialog("");
    deleteTimer = setTimeout(() => {
      deleteArmed = null;
      if ($("#accounts").open) renderAccountsDialog();
    }, 4000);
    return;
  }
  deleteArmed = null;
  const name = accounts.list.find((a) => a.id === id)?.name;
  await deleteAccount(id);
  renderAccountsDialog(`Deleted ${name} and everything saved for it.`);
}

function wireAccounts() {
  $("#acct-select").addEventListener("change", (e) => switchAccount(e.target.value));
  $("#acct-manage").addEventListener("click", () => {
    deleteArmed = null;
    renderAccountsDialog("");
    $("#accounts").showModal();
  });
  $("#accounts-close").addEventListener("click", () => $("#accounts").close());
  $("#accounts").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close(); // backdrop
  });
  $("#acct-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#acct-new-name");
    const id = createAccount(input.value);
    if (!id) return renderAccountsDialog(`You can keep up to ${MAX_ACCOUNTS} accounts. Delete one to make room.`);
    input.value = "";
    await switchAccount(id);
    renderAccountsDialog(`Created ${activeAccount().name}. It starts from zero, with default settings.`);
  });
}

// ---------- boot ----------

const initialTab = location.hash === "#play" || location.hash === "#auto"
  ? location.hash.slice(1)
  : readStorage(TAB_KEY) === "auto" ? "auto" : "play";

buildSettings();
wireTabs();
wireChart();
wirePlay();
wireDetail();
$("#day").addEventListener("input", (e) => selectDay(Number(e.target.value)));
$("#play").addEventListener("click", togglePlayback);
playLab = loadPlay();
plan = loadPlan();
for (const key of ACCOUNT_DATA) cloud.boot[key] = JSON.stringify(SAVES[key].account());
cloud.boot.accounts = JSON.stringify(accounts);
cloud.boot.active = accounts.active;
setSaveStatus("local");
renderAccounts();
wireAccounts();
wirePlan();
run();
setTab(initialTab);
connectAccount();
