// Research progression simulator. Pure functions, no DOM: runs in the browser
// and under `node --test`.

import { SCALING } from "./data.js";

const DAY = 1440; // minutes
const RESOURCES = ["food", "wood", "steel", "badges"];

export function buildCatalog(trees, scaling = SCALING) {
  const nodes = [];
  const byId = new Map();
  for (const tree of trees) {
    tree.tiers.forEach((tier, t) => {
      tier.forEach(([name, stat, perLevel, maxLevel], i) => {
        const node = {
          id: `${tree.id}.${t}.${i}`,
          treeId: tree.id,
          tier: t,
          name,
          stat,
          perLevel,
          maxLevel,
          labRequired: tree.unlockLab + t * tree.labStep,
          prereqs: t === 0 ? [] : tree.tiers[t - 1].map((p, j) => ({
            id: `${tree.id}.${t - 1}.${j}`,
            level: Math.ceil(p[3] / 2),
          })),
          power: scaling.powerPerLevel * (t + 1),
          cost(level) {
            const m = scaling.tierCost ** t * scaling.levelCost ** (level - 1);
            const c = {};
            for (const r of RESOURCES) c[r] = Math.round(tree.baseCost[r] * m);
            return c;
          },
          time(level) {
            return tree.baseCost.time * scaling.tierTime ** t * scaling.levelTime ** (level - 1);
          },
        };
        nodes.push(node);
        byId.set(node.id, node);
      });
    });
  }
  return { trees, nodes, byId };
}

export function statTotals(catalog, levels) {
  const totals = {};
  for (const node of catalog.nodes) {
    const lvl = levels[node.id] || 0;
    if (lvl) totals[node.stat] = (totals[node.stat] || 0) + lvl * node.perLevel;
  }
  return totals;
}

export function isTreeComplete(catalog, treeId, levels) {
  return catalog.nodes
    .filter((n) => n.treeId === treeId)
    .every((n) => (levels[n.id] || 0) >= n.maxLevel);
}

// Why a node's next level can't be started right now (null = it can, ignoring cost).
// `complete` optionally caches tree completion: Map(treeId -> boolean).
export function blocker(catalog, node, levels, labLevel, complete) {
  const lvl = levels[node.id] || 0;
  if (lvl >= node.maxLevel) return "maxed";
  const tree = catalog.trees.find((t) => t.id === node.treeId);
  const done = (id) => complete?.get(id) ?? isTreeComplete(catalog, id, levels);
  const missing = tree.requires.filter((id) => !done(id));
  if (missing.length) {
    const names = missing.map((id) => catalog.trees.find((t) => t.id === id).name);
    return `Complete ${names.join(", ")}`;
  }
  if (labLevel < node.labRequired) return `Laboratory Lv ${node.labRequired}`;
  for (const p of node.prereqs) {
    if ((levels[p.id] || 0) < p.level) {
      return `${catalog.byId.get(p.id).name} Lv ${p.level}`;
    }
  }
  return null;
}

function canAfford(stock, cost) {
  return RESOURCES.every((r) => stock[r] >= cost[r]);
}

export function labLevelAt(config, minute) {
  const gained = Math.floor(minute / (config.hoursPerLabLevel * 60));
  return Math.min(config.labMaxLevel, config.labStartLevel + gained);
}

function queueCountAt(config, minute) {
  const second = config.secondQueueDay > 0 && minute >= config.secondQueueDay * DAY ? 1 : 0;
  return config.queues + second;
}

export function simulate(catalog, config) {
  const horizon = config.days * DAY;
  const levels = {};
  const stock = { ...config.startingStock };
  const spent = { food: 0, wood: 0, steel: 0, badges: 0 };
  const queues = []; // { node, level, remaining, duration, start }
  const events = [];
  const daily = [];
  const treeDone = {};
  const lastStartByTree = {};
  const priorityIndex = new Map(config.priority.map((id, i) => [id, i]));
  let speedupPool = 0;
  let speedupsUsed = 0;
  let helpsSaved = 0;
  let idleQueueMinutes = 0;
  let queueMinutes = 0;
  const idleBy = { resources: 0, locked: 0 };
  let lastIdleReason = "locked";
  let power = 0;
  let t = 0;
  let nextDay = 0;

  const researchSpeed = () => config.baseResearchSpeed + (statTotals(catalog, levels).researchSpeed || 0);

  function candidates(labLevel) {
    const busy = new Set(queues.map((q) => q.node.id));
    const complete = new Map(catalog.trees.map((tr) => [tr.id, tr.id in treeDone]));
    const list = [];
    for (const node of catalog.nodes) {
      if (busy.has(node.id)) continue;
      if (blocker(catalog, node, levels, labLevel, complete)) continue;
      const level = (levels[node.id] || 0) + 1;
      const cost = node.cost(level);
      if (!canAfford(stock, cost)) {
        lastIdleReason = "resources";
        continue;
      }
      list.push({ node, level, cost, time: node.time(level) });
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

  function snapshotDay(day) {
    daily.push({
      day,
      power,
      labLevel: labLevelAt(config, day * DAY),
      researchSpeed: researchSpeed(),
      stock: { ...stock },
      completed: events.length,
    });
  }

  while (t < horizon) {
    // Day boundary: grant speedups and record the day's state.
    if (t >= nextDay * DAY) {
      snapshotDay(nextDay);
      speedupPool += config.speedupMinutesPerDay;
      nextDay += 1;
    }

    const labLevel = labLevelAt(config, t);

    // Fill idle queues.
    lastIdleReason = "locked";
    while (queues.length < queueCountAt(config, t)) {
      const choice = pick(candidates(labLevel));
      if (!choice) break;
      for (const r of RESOURCES) {
        stock[r] -= choice.cost[r];
        spent[r] += choice.cost[r];
      }
      const duration = choice.time / (1 + researchSpeed() / 100);
      let remaining = duration;
      for (let h = 0; h < config.allianceHelps && remaining > 0; h++) {
        const cut = Math.min(remaining, Math.max(config.helpMinutes, duration * 0.01));
        remaining -= cut;
        helpsSaved += cut;
      }
      queues.push({ node: choice.node, level: choice.level, remaining, duration, start: t });
      lastStartByTree[choice.node.treeId] = t;
    }

    // Spend speedups on the research closest to finishing.
    queues.sort((a, b) => a.remaining - b.remaining);
    for (const q of queues) {
      if (speedupPool <= 0) break;
      const use = Math.min(speedupPool, q.remaining);
      q.remaining -= use;
      speedupPool -= use;
      speedupsUsed += use;
    }

    // Advance to the next event: a completion, the next hour (income may make
    // something affordable), the next day, or the horizon.
    const nextHour = (Math.floor(t / 60) + 1) * 60;
    let next = Math.min(nextHour, nextDay * DAY, horizon);
    for (const q of queues) next = Math.min(next, t + q.remaining);
    const dt = Math.max(next - t, 0);

    for (const r of RESOURCES) stock[r] += (config.income[r] * dt) / DAY;
    queueMinutes += queueCountAt(config, t) * dt;
    const idle = (queueCountAt(config, t) - queues.length) * dt;
    idleQueueMinutes += idle;
    idleBy[lastIdleReason] += idle;
    for (const q of queues) q.remaining -= dt;
    t = next;

    // Complete finished research.
    for (let i = queues.length - 1; i >= 0; i--) {
      const q = queues[i];
      if (q.remaining > 1e-9) continue;
      queues.splice(i, 1);
      levels[q.node.id] = q.level;
      power += q.node.power;
      events.push({
        minute: t,
        nodeId: q.node.id,
        treeId: q.node.treeId,
        name: q.node.name,
        level: q.level,
        start: q.start,
        duration: q.duration,
      });
      if (!(q.node.treeId in treeDone) && isTreeComplete(catalog, q.node.treeId, levels)) {
        treeDone[q.node.treeId] = t;
      }
    }
  }
  snapshotDay(config.days);

  return {
    events,
    daily,
    treeDone,
    levels,
    stock,
    spent,
    power,
    speedupsUsed,
    helpsSaved,
    idleQueueMinutes,
    idleBy,
    queueMinutes,
    inProgress: queues.map((q) => ({ nodeId: q.node.id, level: q.level, remaining: q.remaining })),
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
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const d = Math.floor(minutes / DAY);
  const h = Math.floor((minutes % DAY) / 60);
  const m = Math.round(minutes % 60);
  if (d) return `${d}d ${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
