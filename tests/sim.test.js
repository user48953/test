import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TREES, DEFAULT_CONFIG, TIMER, UNPUBLISHED } from "../src/data.js";
import {
  buildCatalog, simulate, levelsAt, blocker, labLevelAt, formatDuration, Lab, DAY, RESOURCES,
  treeProgress, progressMap, meetsPct, bonusTotals, researchBonus,
} from "../src/sim.js";

const catalog = buildCatalog(TREES);
const run = (overrides = {}) => simulate(catalog, { ...DEFAULT_CONFIG, ...overrides });
const node = (treeId, name) => catalog.nodes.find((n) => n.treeId === treeId && n.name === name);
const treeBadges = (id) => catalog.nodes.filter((n) => n.treeId === id)
  .reduce((s, n) => s + Array.from({ length: n.maxLevel }, (_, i) => n.cost(i + 1).badges).reduce((a, b) => a + b, 0), 0);

// ---------- the research data ----------

test("catalog has unique node ids and valid links", () => {
  const ids = catalog.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const n of catalog.nodes) {
    for (const p of n.prereqs) {
      const parent = catalog.byId.get(p.id);
      assert.ok(parent, `${n.id} -> ${p.id}`);
      assert.equal(parent.treeId, n.treeId);
      assert.equal(p.level, parent.maxLevel, "a parent must be maxed");
      assert.ok(parent.tier < n.tier, `${n.id} sits below ${p.id}`);
    }
  }
  for (const tree of TREES) {
    for (const r of tree.requires) assert.ok(catalog.treeById.has(r.id), `${tree.id} needs ${r.id}`);
  }
});

test("every level has a cost, power and a timer", () => {
  for (const n of catalog.nodes) {
    let prev = 0;
    for (let L = 1; L <= n.maxLevel; L++) {
      const c = n.cost(L);
      assert.ok(RESOURCES.some((r) => c[r] > 0), `${n.id} Lv ${L} costs something`);
      assert.ok(RESOURCES.every((r) => Number.isFinite(c[r]) && c[r] >= 0), `${n.id} Lv ${L}`);
      assert.ok(n.powerAt(L) > prev, `${n.id} power grows at Lv ${L}`);
      prev = n.powerAt(L);
      assert.ok(n.time(L) >= TIMER.minMinutes);
    }
  }
});

test("resource trees cost Electricity and Zents, badge trees cost badges", () => {
  for (const tree of TREES) {
    for (const n of catalog.nodes.filter((x) => x.treeId === tree.id)) {
      const c = n.cost(1);
      if (tree.currency === "badges") assert.ok(c.badges > 0 && !c.electricity && !c.zents, n.id);
      else assert.ok(!c.badges && (c.electricity > 0 || c.zents > 0), n.id);
    }
  }
});

test("New Home matches lastz.fandom.com", () => {
  const first = catalog.nodes.find((n) => n.treeId === "newHome");
  assert.equal(first.name, "Stacking Technique");
  assert.deepEqual(first.cost(1), { electricity: 20000, zents: 12000, badges: 0 });
  assert.equal(first.powerAt(1), 518);
  assert.deepEqual(first.effects, [{ label: "Construction Speed", unit: "%", values: [5] }]);
  const shooterCamp = node("newHome", "Shooter Camp");
  assert.deepEqual(shooterCamp.prereqs.map((p) => catalog.byId.get(p.id).name), ["Wind Power", "Stock Manage I"]);
  assert.equal(node("newHome", "Advanced Mathematics II").labRequired, 8);
  assert.equal(catalog.nodes.filter((n) => n.treeId === "newHome").length, 50);
});

test("badge totals match the sources", () => {
  assert.equal(treeBadges("unitSpecialTraining"), 1_488_100); // ztools.co.uk, lastz.gg, gamides.com
  assert.equal(treeBadges("allianceRecognition"), 356_770); // ztools.co.uk, lastz.gg, gamides.com
  assert.equal(treeBadges("militaryStrategies"), 79_816); // ztools.co.uk, gamides.com
  for (const id of ["shooterTraining", "assaulterTraining", "riderTraining"]) {
    assert.equal(treeBadges(id), 1_440_070, id); // lastz.gg
  }
});

test("estimates are flagged and published numbers are not", () => {
  const farming = node("shelterBuilding", "Farming Technology");
  assert.deepEqual(farming.cost(1), { electricity: 87300, zents: 65500, badges: 0 });
  assert.ok(!farming.estCost.has(1));
  assert.deepEqual([...farming.estCost], [2, 3, 4, 5]);
  assert.equal(catalog.nodes.filter((n) => n.treeId === "newHome" && n.estCost.size).length, 0);
  assert.ok(catalog.nodes.filter((n) => n.treeId === "field").every((n) => n.estPower));
  assert.ok(catalog.nodes.filter((n) => n.treeId === "shelterManager").every((n) => n.estLinks));
});

test("tree requirements follow the sources", () => {
  const req = (id) => TREES.find((t) => t.id === id).requires;
  assert.deepEqual(req("allianceRecognition"), [{ id: "newHome", pct: 50 }]);
  assert.deepEqual(req("siegeToSeize"), [{ id: "militaryStrategies", pct: 15 }]);
  assert.deepEqual(req("shelterManager"), [{ id: "shelterBuilding", pct: 100 }]);
  assert.deepEqual(req("riderTraining"), [{ id: "field", pct: 100 }]);
  assert.equal(TREES.find((t) => t.id === "unitSpecialTraining").lab, 30);
});

// ---------- the engine ----------

test("tree progress counts levels", () => {
  const levels = {};
  const nh = catalog.nodes.filter((n) => n.treeId === "newHome");
  nh.slice(0, 25).forEach((n) => (levels[n.id] = n.maxLevel));
  assert.equal(treeProgress(catalog, "newHome", levels), 0.5);
  assert.equal(progressMap(catalog, levels).get("newHome"), 0.5);
  assert.ok(meetsPct(0.5, 50));
  assert.ok(!meetsPct(0.49, 50));
});

test("research speed comes from research bonuses", () => {
  const am = node("newHome", "Advanced Mathematics I");
  assert.equal(researchBonus(catalog, { [am.id]: 1 }), 5);
  const { totals, unlocked } = bonusTotals(catalog, { [am.id]: 1, [node("newHome", "Shooter Camp").id]: 1 });
  assert.deepEqual(totals, [{ label: "Research Speed", unit: "%", value: 5 }]);
  assert.deepEqual(unlocked, ["Shooter Camp"]);
});

test("every completed level was unlocked when it started", () => {
  const result = run();
  assert.ok(result.events.length > 0);
  result.events.forEach((e, i) => {
    const n = catalog.byId.get(e.nodeId);
    // Several levels can finish in the same minute (speedups), so replay only earlier log entries.
    const before = levelsAt(result.events.slice(0, i), e.start);
    assert.equal(before[e.nodeId] || 0, e.level - 1, `${e.nodeId} levels in order`);
    const lab = labLevelAt(DEFAULT_CONFIG, e.start);
    assert.equal(blocker(catalog, n, { ...before, [e.nodeId]: e.level - 1 }, lab), null, e.nodeId);
  });
});

test("resources never go negative", () => {
  const result = run();
  for (const day of result.daily) {
    for (const [r, v] of Object.entries(day.stock)) assert.ok(v > -1e-6, `${r} on day ${day.day}`);
  }
});

test("simulation is deterministic", () => {
  assert.deepEqual(run({ days: 90 }).levels, run({ days: 90 }).levels);
});

test("more income never yields less power", () => {
  const base = run({ days: 120 });
  const rich = run({
    days: 120,
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

test("timers follow the power a level adds", () => {
  const st = node("newHome", "Stacking Technique");
  assert.equal(st.time(1), 518 * TIMER.minutesPerPower);
});

test("Laboratory level caps at the configured maximum", () => {
  assert.equal(labLevelAt(DEFAULT_CONFIG, 0), DEFAULT_CONFIG.labStartLevel);
  assert.equal(labLevelAt(DEFAULT_CONFIG, 10_000 * 1440), DEFAULT_CONFIG.labMaxLevel);
});

test("a long enough run completes every tree, each after what it needs", () => {
  const result = run({
    days: 200,
    hoursPerLabLevel: 24,
    speedupMinutesPerDay: 1e9,
    income: { electricity: 1e11, zents: 1e11, badges: 1e9 },
  });
  for (const tree of TREES) assert.ok(tree.id in result.treeDone, tree.id);
  for (const tree of TREES) {
    const firstStart = Math.min(...result.events.filter((e) => e.treeId === tree.id).map((e) => e.start));
    const firstIdx = result.events.findIndex((e) => e.treeId === tree.id && e.start === firstStart);
    const before = levelsAt(result.events.slice(0, firstIdx), firstStart);
    for (const r of tree.requires) {
      assert.ok(meetsPct(treeProgress(catalog, r.id, before), r.pct), `${tree.id} started before ${r.id} reached ${r.pct}%`);
    }
  }
});

test("formatDuration", () => {
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(1440 * 2 + 180), "2d 3h");
});

// ---------- manual play (Lab) ----------

const newLab = (overrides = {}) => new Lab(catalog, { ...DEFAULT_CONFIG, ...overrides });
const ST = () => node("newHome", "Stacking Technique");
const WP = () => node("newHome", "Wind Power");
const SM = () => node("newHome", "Stock Manage I");

test("every tree has its artwork", () => {
  for (const tree of [...TREES, ...UNPUBLISHED]) {
    const buf = readFileSync(new URL(`../${tree.art}`, import.meta.url));
    assert.equal(buf.toString("ascii", 8, 12), "WEBP", tree.art);
  }
});

test("every tree has a description and sources", () => {
  for (const tree of TREES) {
    assert.ok(tree.description, tree.id);
    assert.ok(tree.sources.length, tree.id);
  }
});

test("unlocks mirror prerequisites", () => {
  for (const n of catalog.nodes) {
    for (const u of n.unlocks) {
      assert.ok(catalog.byId.get(u.id).prereqs.some((p) => p.id === n.id && p.level === u.level));
    }
  }
});

test("status explains why research can't start", () => {
  const lab = newLab();
  assert.equal(lab.status(ST()).state, "ready");
  assert.match(lab.status(WP()).reason, /Stacking Technique Lv 1/);
  assert.match(lab.status(node("shelterBuilding", "Farming Technology")).reason, /Laboratory Lv 5/);
  assert.match(lab.status(node("shelterManager", "Anti Theft")).reason, /Shelter Building finished/);
  const lab10 = newLab({ labStartLevel: 10 });
  assert.match(lab10.status(node("allianceRecognition", "Collect Wood")).reason, /New Home at 50%/);
  const poor = newLab({ startingStock: { electricity: 0, zents: 0, badges: 0 } });
  const s = poor.status(ST());
  assert.equal(s.state, "short");
  assert.equal(s.shortfall.electricity, s.cost.electricity);
  assert.equal(s.shortfall.zents, s.cost.zents);
});

test("starting research spends resources and fills a queue", () => {
  const lab = newLab({ allianceHelps: 0 });
  const before = { ...lab.stock };
  const s = lab.start(ST());
  assert.equal(lab.stock.electricity, before.electricity - s.cost.electricity);
  assert.equal(lab.stock.zents, before.zents - s.cost.zents);
  assert.equal(lab.queues.length, 1);
  assert.equal(lab.status(ST()).state, "busy");
  assert.throws(() => lab.start(WP()), /Needs/);
});

test("queues limit how much runs at once", () => {
  const lab = newLab({ allianceHelps: 0, speedupMinutesPerDay: 0, queues: 1, secondQueueDay: 0 });
  lab.levels[ST().id] = 1;
  lab.start(WP());
  assert.equal(lab.status(SM()).state, "queueFull");
});

test("time skips finish research and collect income", () => {
  const lab = newLab({ allianceHelps: 0, speedupMinutesPerDay: 0 });
  const s = lab.start(ST());
  const electricity = lab.stock.electricity;
  const done = lab.advanceTo(lab.nextFinish());
  assert.equal(done.length, 1);
  assert.equal(lab.levels[ST().id], 1);
  assert.ok(Math.abs(lab.stock.electricity - (electricity + (DEFAULT_CONFIG.income.electricity * s.duration) / DAY)) < 1e-6);
  assert.equal(lab.queues.length, 0);
  assert.equal(lab.power, 518);
});

test("speedups finish research immediately when they cover the timer", () => {
  const lab = newLab({ allianceHelps: 0 });
  assert.equal(lab.speedupPool, DEFAULT_CONFIG.speedupMinutesPerDay); // day 0 grant
  const s = lab.start(ST());
  const used = lab.speedUp(0);
  assert.ok(Math.abs(used - s.duration) < 1e-9);
  assert.equal(lab.levels[ST().id], 1);
  assert.equal(lab.t, 0);
});

test("a saved game restores exactly", () => {
  const lab = newLab();
  lab.start(ST());
  lab.advanceTo(3 * DAY + 17);
  const copy = Lab.fromJSON(catalog, lab.config, JSON.parse(JSON.stringify(lab)));
  assert.deepEqual(copy.toJSON(), lab.toJSON());
  assert.equal(Lab.fromJSON(catalog, lab.config, { levels: { "nope.0.0": 1 } }), null);
});
