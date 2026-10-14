import { test } from "node:test";
import assert from "node:assert/strict";
import { TREES, DEFAULT_CONFIG } from "../src/data.js";
import { buildCatalog, simulate, levelsAt, blocker, labLevelAt, formatDuration } from "../src/sim.js";

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
