import { test } from "node:test";
import assert from "node:assert/strict";
import { TREES, DEFAULT_CONFIG } from "../src/data.js";
import { buildCatalog, simulate, levelsAt, blocker, labLevelAt, formatDuration, Lab, DAY } from "../src/sim.js";

const catalog = buildCatalog(TREES);
const run = (overrides = {}) => simulate(catalog, { ...DEFAULT_CONFIG, ...overrides });

test("catalog has unique node ids and valid prerequisites", () => {
  const ids = catalog.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const node of catalog.nodes) {
    for (const p of node.prereqs) assert.ok(catalog.byId.has(p.id), `${node.id} -> ${p.id}`);
  }
});

test("every completed level was unlocked when it started", () => {
  const result = run();
  assert.ok(result.events.length > 0);
  result.events.forEach((e, i) => {
    const node = catalog.byId.get(e.nodeId);
    // Several levels can finish in the same minute (speedups), so replay only earlier log entries.
    const before = levelsAt(result.events.slice(0, i), e.start);
    assert.equal(before[e.nodeId] || 0, e.level - 1, `${e.nodeId} levels in order`);
    const lab = labLevelAt(DEFAULT_CONFIG, e.start);
    assert.equal(blocker(catalog, node, { ...before, [e.nodeId]: e.level - 1 }, lab), null, e.nodeId);
  });
});

test("resources never go negative", () => {
  const result = run();
  for (const day of result.daily) {
    for (const [r, v] of Object.entries(day.stock)) assert.ok(v > -1e-6, `${r} on day ${day.day}`);
  }
});

test("simulation is deterministic", () => {
  assert.deepEqual(run().levels, run().levels);
});

test("more income never yields less power", () => {
  const base = run();
  const rich = run({
    income: Object.fromEntries(Object.entries(DEFAULT_CONFIG.income).map(([k, v]) => [k, v * 3])),
  });
  assert.ok(rich.power >= base.power);
});

test("research speed shortens research", () => {
  const slow = run({ days: 10, speedupMinutesPerDay: 0, allianceHelps: 0 });
  const fast = run({ days: 10, speedupMinutesPerDay: 0, allianceHelps: 0, baseResearchSpeed: 100 });
  const first = (r) => r.events[0].duration;
  assert.ok(Math.abs(first(fast) - first(slow) / 2) < 1e-6);
});

test("Laboratory level caps at the configured maximum", () => {
  assert.equal(labLevelAt(DEFAULT_CONFIG, 0), DEFAULT_CONFIG.labStartLevel);
  assert.equal(labLevelAt(DEFAULT_CONFIG, 10_000 * 1440), DEFAULT_CONFIG.labMaxLevel);
});

test("a long enough run completes every tree", () => {
  const result = run({ days: 365 });
  for (const tree of TREES) assert.ok(tree.id in result.treeDone, tree.id);
  // Trees that require another tree finish after it.
  for (const tree of TREES) {
    for (const req of tree.requires) assert.ok(result.treeDone[tree.id] > result.treeDone[req]);
  }
});

test("formatDuration", () => {
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(1440 * 2 + 180), "2d 3h");
});

// ---------- manual play (Lab) ----------

const newLab = (overrides = {}) => new Lab(catalog, { ...DEFAULT_CONFIG, ...overrides });
const node = (name) => catalog.nodes.find((n) => n.name === name);

test("every tree and node has a description", () => {
  for (const tree of TREES) assert.ok(tree.description, tree.id);
  for (const n of catalog.nodes) assert.ok(n.description, n.id);
});

test("unlocks mirror prerequisites", () => {
  for (const n of catalog.nodes) {
    for (const u of n.unlocks) {
      assert.ok(catalog.byId.get(u.id).prereqs.some((p) => p.id === n.id && p.level === u.level));
    }
  }
});

test("status explains why research can't start", () => {
  assert.match(newLab().status(node("Farming")).reason, /Laboratory Lv 2/);
  const lab = newLab({ labStartLevel: 10 });
  assert.equal(lab.status(node("Basic Research")).state, "ready");
  assert.equal(lab.status(node("Farming")).state, "locked");
  assert.match(lab.status(node("Farming")).reason, /Basic Research Lv 3/);
  assert.match(lab.status(node("Logistics")).reason, /Complete New Home/);
  const poor = newLab({ startingStock: { food: 0, wood: 0, steel: 0, badges: 0 } });
  const s = poor.status(node("Basic Research"));
  assert.equal(s.state, "short");
  assert.equal(s.shortfall.food, s.cost.food);
});

test("starting research spends resources and fills a queue", () => {
  const lab = newLab({ allianceHelps: 0 });
  const before = lab.stock.food;
  const s = lab.start(node("Basic Research"));
  assert.equal(lab.stock.food, before - s.cost.food);
  assert.equal(lab.queues.length, 1);
  assert.equal(lab.status(node("Basic Research")).state, "busy");
  assert.throws(() => lab.start(node("Farming")), /Needs/);
});

test("queues limit how much runs at once", () => {
  const lab = newLab({ allianceHelps: 0, speedupMinutesPerDay: 0, queues: 1, secondQueueDay: 0, labStartLevel: 5 });
  lab.levels[node("Basic Research").id] = 5; // unlock tier 1
  lab.start(node("Farming"));
  assert.equal(lab.status(node("Lumbering")).state, "queueFull");
});

test("time skips finish research and collect income", () => {
  const lab = newLab({ allianceHelps: 0, speedupMinutesPerDay: 0 });
  const s = lab.start(node("Basic Research"));
  const food = lab.stock.food;
  const done = lab.advanceTo(lab.nextFinish());
  assert.equal(done.length, 1);
  assert.equal(lab.levels[node("Basic Research").id], 1);
  assert.ok(Math.abs(lab.stock.food - (food + (DEFAULT_CONFIG.income.food * s.duration) / DAY)) < 1e-6);
  assert.equal(lab.queues.length, 0);
});

test("speedups finish research immediately when they cover the timer", () => {
  const lab = newLab({ allianceHelps: 0 });
  assert.equal(lab.speedupPool, DEFAULT_CONFIG.speedupMinutesPerDay); // day 0 grant
  const s = lab.start(node("Basic Research"));
  const used = lab.speedUp(0);
  assert.ok(Math.abs(used - s.duration) < 1e-9);
  assert.equal(lab.levels[node("Basic Research").id], 1);
  assert.equal(lab.t, 0);
});

test("a saved game restores exactly", () => {
  const lab = newLab();
  lab.start(node("Basic Research"));
  lab.advanceTo(3 * DAY + 17);
  const copy = Lab.fromJSON(catalog, lab.config, JSON.parse(JSON.stringify(lab)));
  assert.deepEqual(copy.toJSON(), lab.toJSON());
  assert.equal(Lab.fromJSON(catalog, lab.config, { levels: { "nope.0.0": 1 } }), null);
});
