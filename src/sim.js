// Research progression engine. Pure logic, no DOM: runs in the browser and
// under `node --test`.
//
// `Lab` is the game state: time, stock, research levels and queues. You can
// drive it by hand (start research, spend speedups, skip time), which is what
// the "Play it yourself" mode does. `simulate()` drives the same Lab with an
// auto-pilot that fills every free queue with the best affordable research.

import { TIMER, RESEARCH_SPEED } from "./data.js";

export const DAY = 1440; // minutes
export const RESOURCES = ["electricity", "zents", "badges"];

// Turns the source trees (see research-data.js) into research nodes.
// A node's next level needs every parent maxed, the tree's own requirements
// and the node's Laboratory level (or the tree's, when the node has none).
export function buildCatalog(trees, timer = TIMER) {
  const nodes = [];
  const byId = new Map();
  const treeById = new Map();
  for (const tree of trees) {
    treeById.set(tree.id, tree);
    for (const src of tree.nodes) {
      const gain = (level) => src.power[level - 1] - (level > 1 ? src.power[level - 2] : 0);
      const node = {
        id: `${tree.id}.${src.id}`,
        treeId: tree.id,
        tier: src.tier,
        name: src.name,
        maxLevel: src.maxLevel,
        effects: src.effects,
        source: src.source,
        estCost: new Set(src.estCost || []),
        estPower: Boolean(src.estPower),
        estLinks: Boolean(src.estLinks),
        estLab: Boolean(src.estLab),
        labRequired: src.lab ?? tree.lab ?? 1,
        prereqs: src.parents.map((p) => ({ id: `${tree.id}.${p}`, level: 0 })),
        // Filled in below: nodes that list this one as a prerequisite.
        unlocks: [],
        cost(level) {
          const c = {};
          for (const r of RESOURCES) c[r] = src.cost[r]?.[level - 1] ?? 0;
          return c;
        },
        // Power added by one level, and the total at a level.
        powerGain: gain,
        powerAt: (level) => (level > 0 ? src.power[level - 1] : 0),
        // Not published by any source: estimated from the power a level adds.
        time(level) {
          return Math.max(timer.minMinutes, timer.minutesPerPower * gain(level));
        },
      };
      nodes.push(node);
      byId.set(node.id, node);
    }
  }
  for (const node of nodes) {
    for (const p of node.prereqs) {
      const parent = byId.get(p.id);
      p.level = parent.maxLevel;
      parent.unlocks.push({ id: node.id, level: p.level });
    }
  }
  const levelsByTree = new Map(trees.map((t) => [t.id, 0]));
  for (const n of nodes) levelsByTree.set(n.treeId, levelsByTree.get(n.treeId) + n.maxLevel);
  return { trees, nodes, byId, treeById, levelsByTree };
}

// Bonus totals from every researched level, one entry per bonus name and
// unit, plus the things research has unlocked.
export function bonusTotals(catalog, levels) {
  const totals = new Map();
  const unlocked = [];
  for (const node of catalog.nodes) {
    const lvl = levels[node.id] || 0;
    if (!lvl) continue;
    for (const e of node.effects) {
      if (e.text !== undefined) {
        unlocked.push(e.text);
        continue;
      }
      if (!e.values) continue;
      const key = `${e.label}|${e.unit}`;
      const t = totals.get(key) || { label: e.label, unit: e.unit, value: 0 };
      t.value += e.values[lvl - 1] ?? 0;
      totals.set(key, t);
    }
  }
  return { totals: [...totals.values()], unlocked };
}

// Research speed % from research alone.
export function researchBonus(catalog, levels) {
  let pct = 0;
  for (const node of catalog.nodes) {
    const lvl = levels[node.id] || 0;
    if (!lvl) continue;
    for (const e of node.effects) if (e.label === RESEARCH_SPEED && e.values) pct += e.values[lvl - 1] ?? 0;
  }
  return pct;
}

// Share of a tree's levels researched, 0..1.
export function treeProgress(catalog, treeId, levels) {
  let got = 0;
  for (const n of catalog.nodes) if (n.treeId === treeId) got += Math.min(levels[n.id] || 0, n.maxLevel);
  return got / catalog.levelsByTree.get(treeId);
}

export function progressMap(catalog, levels) {
  const got = new Map(catalog.trees.map((t) => [t.id, 0]));
  for (const n of catalog.nodes) got.set(n.treeId, got.get(n.treeId) + Math.min(levels[n.id] || 0, n.maxLevel));
  return new Map(catalog.trees.map((t) => [t.id, got.get(t.id) / catalog.levelsByTree.get(t.id)]));
}

export function isTreeComplete(catalog, treeId, levels) {
  return treeProgress(catalog, treeId, levels) >= 1;
}

// "New Home at 50%", or "Shelter Building finished" for 100%.
export function treeRequirementText(catalog, req) {
  const name = catalog.treeById.get(req.id).name;
  return req.pct >= 100 ? `${name} finished` : `${name} at ${req.pct}%`;
}

// Whether `progress` (0..1) meets a percentage requirement. The tolerance
// keeps exact shares like 75/150 from failing on rounding.
export const meetsPct = (progress, pct) => progress * 100 >= pct - 1e-9;

// Why a node's next level can't be started right now (null = it can, ignoring cost).
// `progress` optionally caches tree progress: Map(treeId -> 0..1).
export function blocker(catalog, node, levels, labLevel, progress) {
  const lvl = levels[node.id] || 0;
  if (lvl >= node.maxLevel) return "maxed";
  const tree = catalog.treeById.get(node.treeId);
  const share = (id) => progress?.get(id) ?? treeProgress(catalog, id, levels);
  const missing = tree.requires.filter((r) => !meetsPct(share(r.id), r.pct));
  if (missing.length) return missing.map((r) => treeRequirementText(catalog, r)).join(", ");
  if (labLevel < node.labRequired) return `Laboratory Lv ${node.labRequired}`;
  for (const p of node.prereqs) {
    if ((levels[p.id] || 0) < p.level) {
      return `${catalog.byId.get(p.id).name} Lv ${p.level}`;
    }
  }
  return null;
}

export function labLevelAt(config, minute) {
  const gained = Math.floor(minute / (config.hoursPerLabLevel * 60));
  return Math.min(config.labMaxLevel, config.labStartLevel + gained);
}

export function queueCountAt(config, minute) {
  const second = config.secondQueueDay > 0 && minute >= config.secondQueueDay * DAY ? 1 : 0;
  return config.queues + second;
}

// Timer after research speed, before alliance helps and speedups.
export function researchDuration(baseMinutes, speedPct) {
  return baseMinutes / (1 + speedPct / 100);
}

const SAVED_FIELDS = [
  "t", "levels", "stock", "spent", "queues", "events", "daily", "treeDone", "power",
  "speedupPool", "speedupsUsed", "helpsSaved", "idleQueueMinutes", "queueMinutes", "idleBy", "nextDay",
];

export class Lab {
  constructor(catalog, config) {
    this.catalog = catalog;
    this.config = config;
    this.t = 0;
    this.levels = {};
    this.stock = { ...config.startingStock };
    this.spent = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
    this.queues = []; // { nodeId, level, remaining, duration, start }
    this.events = []; // finished levels, in order
    this.daily = []; // one snapshot per day boundary
    this.treeDone = {}; // treeId -> minute finished
    this.power = 0;
    this.speedupPool = 0;
    this.speedupsUsed = 0;
    this.helpsSaved = 0;
    this.idleQueueMinutes = 0;
    this.queueMinutes = 0;
    this.idleBy = { resources: 0, locked: 0 };
    this.idleReason = "locked"; // set by whoever is choosing research
    this.nextDay = 0;
    this.#rollDay();
  }

  static fromJSON(catalog, config, data) {
    const lab = new Lab(catalog, config);
    for (const key of SAVED_FIELDS) if (key in data) lab[key] = data[key];
    const known = (id) => catalog.byId.has(id);
    if (!Object.keys(lab.levels).every(known) || !lab.queues.every((q) => known(q.nodeId))) return null;
    return lab;
  }

  toJSON() {
    return Object.fromEntries(SAVED_FIELDS.map((k) => [k, this[k]]));
  }

  get labLevel() {
    return labLevelAt(this.config, this.t);
  }

  get queueCount() {
    return queueCountAt(this.config, this.t);
  }

  get day() {
    return this.t / DAY;
  }

  researchSpeed() {
    return this.config.baseResearchSpeed + researchBonus(this.catalog, this.levels);
  }

  treeProgress() {
    return progressMap(this.catalog, this.levels);
  }

  // Everything the UI and the auto-pilot need to know about a node's next level.
  // state: "maxed" | "busy" | "locked" | "short" | "queueFull" | "ready"
  // `ctx` lets a caller checking many nodes compute shared values once.
  status(node, ctx = {}) {
    const current = this.levels[node.id] || 0;
    const level = current + 1;
    if (current >= node.maxLevel) return { state: "maxed", level: current };
    const cost = node.cost(level);
    const time = node.time(level);
    const speed = ctx.speed ?? this.researchSpeed();
    const base = { level, cost, time, duration: researchDuration(time, speed) };
    if (this.queues.some((q) => q.nodeId === node.id)) return { ...base, state: "busy", reason: "Researching now" };
    const why = blocker(this.catalog, node, this.levels, this.labLevel, ctx.progress ?? this.treeProgress());
    if (why) return { ...base, state: "locked", reason: `Needs ${why}` };
    const shortfall = {};
    for (const r of RESOURCES) if ((this.stock[r] || 0) < cost[r]) shortfall[r] = cost[r] - (this.stock[r] || 0);
    if (Object.keys(shortfall).length) return { ...base, state: "short", shortfall, reason: "Not enough resources" };
    if (this.queues.length >= this.queueCount) return { ...base, state: "queueFull", reason: "All research queues are busy" };
    return { ...base, state: "ready", reason: null };
  }

  start(node) {
    const s = this.status(node);
    if (s.state !== "ready") throw new Error(`${node.name}: ${s.reason}`);
    for (const r of RESOURCES) {
      this.stock[r] -= s.cost[r];
      this.spent[r] += s.cost[r];
    }
    // Alliance helps land right away.
    let remaining = s.duration;
    for (let h = 0; h < this.config.allianceHelps && remaining > 0; h++) {
      const cut = Math.min(remaining, Math.max(this.config.helpMinutes, s.duration * 0.01));
      remaining -= cut;
      this.helpsSaved += cut;
    }
    this.queues.push({ nodeId: node.id, level: s.level, remaining, duration: s.duration, start: this.t });
    return s;
  }

  // Spend speedups from the pool on one queue. Finishes it now if fully covered.
  speedUp(index, minutes = Infinity) {
    const q = this.queues[index];
    if (!q) return 0;
    const use = Math.min(this.speedupPool, q.remaining, minutes);
    q.remaining -= use;
    this.speedupPool -= use;
    this.speedupsUsed += use;
    this.#completeFinished();
    return use;
  }

  // Auto-pilot speedups: spend the pool on the research closest to finishing.
  autoSpeedup() {
    this.queues.sort((a, b) => a.remaining - b.remaining);
    for (const q of this.queues) {
      if (this.speedupPool <= 0) break;
      const use = Math.min(this.speedupPool, q.remaining);
      q.remaining -= use;
      this.speedupPool -= use;
      this.speedupsUsed += use;
    }
  }

  nextFinish() {
    if (!this.queues.length) return null;
    return this.t + Math.min(...this.queues.map((q) => q.remaining));
  }

  // Move time forward to `target`, collecting income, finishing research and
  // crossing day boundaries along the way. Returns the levels that finished.
  advanceTo(target) {
    const before = this.events.length;
    this.#completeFinished();
    this.#rollDay();
    while (this.t < target) {
      let next = Math.min(target, this.nextDay * DAY);
      for (const q of this.queues) next = Math.min(next, this.t + q.remaining);
      const dt = Math.max(next - this.t, 0);

      for (const r of RESOURCES) this.stock[r] = (this.stock[r] || 0) + ((this.config.income[r] || 0) * dt) / DAY;
      const slots = this.queueCount;
      this.queueMinutes += slots * dt;
      const idle = Math.max(slots - this.queues.length, 0) * dt;
      this.idleQueueMinutes += idle;
      this.idleBy[this.idleReason] += idle;
      for (const q of this.queues) q.remaining -= dt;
      this.t = next;

      this.#completeFinished();
      this.#rollDay();
    }
    return this.events.slice(before);
  }

  #completeFinished() {
    for (let i = this.queues.length - 1; i >= 0; i--) {
      const q = this.queues[i];
      if (q.remaining > 1e-9) continue;
      this.queues.splice(i, 1);
      const node = this.catalog.byId.get(q.nodeId);
      this.levels[q.nodeId] = q.level;
      this.power += node.powerGain(q.level);
      this.events.push({
        minute: this.t,
        nodeId: q.nodeId,
        treeId: node.treeId,
        name: node.name,
        level: q.level,
        start: q.start,
        duration: q.duration,
      });
      if (!(node.treeId in this.treeDone) && isTreeComplete(this.catalog, node.treeId, this.levels)) {
        this.treeDone[node.treeId] = this.t;
      }
    }
  }

  // At each day boundary: record the day and grant that day's speedups.
  #rollDay() {
    while (this.t >= this.nextDay * DAY) {
      this.daily.push({
        day: this.nextDay,
        power: this.power,
        labLevel: labLevelAt(this.config, this.nextDay * DAY),
        researchSpeed: this.researchSpeed(),
        stock: { ...this.stock },
        completed: this.events.length,
      });
      this.speedupPool += this.config.speedupMinutesPerDay;
      this.nextDay += 1;
    }
  }
}

// Auto-pilot: run a Lab for `config.days`, filling every free queue by the
// configured strategy and spending speedups as soon as they arrive.
export function simulate(catalog, config) {
  const lab = new Lab(catalog, config);
  const horizon = config.days * DAY;
  const lastStartByTree = {};
  const priorityIndex = new Map(config.priority.map((id, i) => [id, i]));

  function candidates() {
    const ctx = { progress: lab.treeProgress(), speed: lab.researchSpeed() };
    const labLevel = lab.labLevel;
    const list = [];
    for (const node of catalog.nodes) {
      // Most research is locked at any moment: rule it out before pricing it.
      if (blocker(catalog, node, lab.levels, labLevel, ctx.progress)) continue;
      const s = lab.status(node, ctx);
      if (s.state === "short") lab.idleReason = "resources";
      if (s.state === "ready") list.push({ node, time: s.time });
    }
    return list;
  }

  function pick(list) {
    if (!list.length) return null;
    const byPriority = (a, b) =>
      (priorityIndex.get(a.node.treeId) ?? 99) - (priorityIndex.get(b.node.treeId) ?? 99) ||
      a.node.tier - b.node.tier ||
      a.time - b.time;
    if (config.strategy === "fastest") {
      return list.reduce((best, c) => (c.time < best.time ? c : best));
    }
    if (config.strategy === "roundRobin") {
      return [...list].sort(
        (a, b) =>
          (lastStartByTree[a.node.treeId] ?? -1) - (lastStartByTree[b.node.treeId] ?? -1) ||
          byPriority(a, b)
      )[0];
    }
    return [...list].sort(byPriority)[0];
  }

  while (lab.t < horizon) {
    lab.idleReason = "locked";
    while (lab.queues.length < lab.queueCount) {
      const choice = pick(candidates());
      if (!choice) break;
      lab.start(choice.node);
      lastStartByTree[choice.node.treeId] = lab.t;
    }
    lab.autoSpeedup();

    // Next stop: a completion, the next hour (income may make something
    // affordable), the next day, or the end of the run.
    const nextHour = (Math.floor(lab.t / 60) + 1) * 60;
    let next = Math.min(nextHour, lab.nextDay * DAY, horizon);
    for (const q of lab.queues) next = Math.min(next, lab.t + q.remaining);
    lab.advanceTo(next);
  }

  return {
    events: lab.events,
    daily: lab.daily,
    treeDone: lab.treeDone,
    levels: lab.levels,
    stock: lab.stock,
    spent: lab.spent,
    power: lab.power,
    speedupsUsed: lab.speedupsUsed,
    helpsSaved: lab.helpsSaved,
    idleQueueMinutes: lab.idleQueueMinutes,
    idleBy: lab.idleBy,
    queueMinutes: lab.queueMinutes,
    inProgress: lab.queues.map((q) => ({ nodeId: q.nodeId, level: q.level, remaining: q.remaining })),
  };
}

// Node levels as of a given minute, rebuilt from the event log.
export function levelsAt(events, minute) {
  const levels = {};
  for (const e of events) {
    if (e.minute > minute) break;
    levels[e.nodeId] = e.level;
  }
  return levels;
}

export function formatDuration(minutes) {
  if (minutes < 1) return minutes > 0 ? "<1m" : "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const d = Math.floor(minutes / DAY);
  const h = Math.floor((minutes % DAY) / 60);
  const m = Math.round(minutes % 60);
  if (d) return `${d}d ${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
