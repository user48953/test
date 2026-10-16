import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame, buySupply, buyUpgrade, setRecipe, setLocation, setAd, runDay, keepPlaying,
  weatherFor, packPrice, cupsPossible, openBlocker, isStuck, seasonOver, seasonSummary,
  money, clockAt, LOCATIONS, UPGRADES, SUPPLY_IDS, SEASON_DAYS, START_CASH, HOURS_OPEN,
} from "../lemonade/game.js";

// A stand stocked with a large pack of everything, on a seed with plenty of cash.
function stocked(seed = 7, cash = 50000) {
  let s = { ...newGame(seed), cash };
  for (const id of SUPPLY_IDS) s = buySupply(s, id, 2);
  return s;
}

test("a new game starts with cash and no stock", () => {
  const s = newGame(3);
  assert.equal(s.cash, START_CASH);
  assert.deepEqual(s.inventory, { lemons: 0, sugar: 0, cups: 0, ice: 0 });
  assert.match(openBlocker(s), /lemons, sugar, paper cups and ice/);
});

test("weather and prices depend only on seed and day", () => {
  assert.deepEqual(weatherFor(5, 12), weatherFor(5, 12));
  assert.notDeepEqual(
    Array.from({ length: 10 }, (_, d) => weatherFor(5, d + 1)),
    Array.from({ length: 10 }, (_, d) => weatherFor(6, d + 1)),
  );
});

test("buying a pack moves money into stock", () => {
  const s = newGame(1);
  const price = packPrice(s, "lemons", 0);
  const after = buySupply(s, "lemons", 0);
  assert.equal(after.cash, s.cash - price);
  assert.equal(after.inventory.lemons, 12);
  assert.equal(after.morning.supplies, price);
  assert.equal(s.inventory.lemons, 0, "the old state is untouched");
  assert.throws(() => buySupply({ ...s, cash: 10 }, "lemons", 2), /You need/);
});

test("recipe values are clamped and prices snap to 5 cents", () => {
  const s = setRecipe(newGame(1), { lemons: 40, sugar: -2, ice: 3.4, price: 77 });
  assert.deepEqual(s.recipe, { lemons: 10, sugar: 0, ice: 3, price: 75 });
});

test("cupsPossible names the supply that runs out first", () => {
  let s = setRecipe(newGame(1), { lemons: 4, sugar: 4, ice: 5 });
  s = { ...s, inventory: { lemons: 40, sugar: 40, cups: 500, ice: 100 } };
  assert.deepEqual(cupsPossible(s), { cups: 20, limit: "ice" });
  s = { ...s, inventory: { lemons: 8, sugar: 40, cups: 500, ice: 1000 } };
  assert.deepEqual(cupsPossible(s), { cups: 24, limit: "lemons" });
});

test("a day is deterministic", () => {
  const s = stocked();
  assert.deepEqual(runDay(s), runDay(s));
});

test("a day's books balance and stock is never overdrawn", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = setRecipe(stocked(seed), { price: 40 });
    const next = runDay(s);
    const r = next.lastReport;
    assert.equal(next.cash, s.cash - r.expenses.rent - r.expenses.ads + r.revenue);
    assert.equal(r.revenue, r.sold * 40);
    assert.equal(r.pitchers * 12 - r.leftoverCups, r.sold);
    assert.equal(s.inventory.lemons - next.inventory.lemons, r.pitchers * 4);
    assert.equal(s.inventory.cups - next.inventory.cups, r.sold);
    for (const id of SUPPLY_IDS) assert.ok(next.inventory[id] >= 0, `${id} on seed ${seed}`);
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    assert.equal(total, r.passersby);
    assert.equal(r.customers.length, r.passersby);
    assert.ok(r.customers.every((c, i) => i === 0 || r.customers[i - 1].t <= c.t), "arrival order");
  }
});

test("selling stops when a supply runs out", () => {
  let s = stocked(4);
  s = { ...s, inventory: { ...s.inventory, cups: 5 }, rep: 80 };
  const r = runDay(s).lastReport;
  assert.equal(r.sold, 5);
  assert.equal(r.ranOut.item, "cups");
  assert.ok(r.counts.soldout > 0);
});

test("the stand can't serve more than its hourly limit", () => {
  let s = { ...stocked(9, 500000), rep: 100 };
  for (const loc of LOCATIONS) s.unlocked.push(loc.id);
  s = setRecipe(setAd(setLocation(s, "beach"), "radio"), { price: 5 });
  for (let day = 0; day < 8; day++) {
    const r = runDay(s).lastReport;
    assert.ok(r.sold <= 15 * HOURS_OPEN);
    s = { ...s, day: s.day + 1 };
  }
});

test("a higher price sells fewer cups to the same crowd", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const cheap = runDay(setRecipe(stocked(seed), { price: 25 })).lastReport;
    const dear = runDay(setRecipe(stocked(seed), { price: 150 })).lastReport;
    assert.equal(cheap.passersby, dear.passersby);
    assert.ok(dear.sold <= cheap.sold, `seed ${seed}`);
  }
});

test("good lemonade builds reputation and bad lemonade loses it", () => {
  const start = { ...stocked(2), rep: 40 };
  const good = runDay(setRecipe(start, { lemons: 4, sugar: 4, price: 30 }));
  const bad = runDay(setRecipe(start, { lemons: 10, sugar: 0, price: 30 }));
  assert.ok(good.rep > 40, `good ${good.rep}`);
  assert.ok(bad.rep < 40, `bad ${bad.rep}`);
  assert.ok(bad.lastReport.comments["Too sour!"] > 0);
});

test("reputation unlocks new spots, which charge rent", () => {
  let s = { ...stocked(3), rep: 24.9 };
  assert.throws(() => setLocation(s, "park"), /Unlocks at reputation 25/);
  s = runDay(setRecipe(s, { price: 30 }));
  assert.ok(s.unlocked.includes("park"));
  assert.deepEqual(s.lastReport.unlockedNow, ["park"]);
  const before = setLocation(buySupply(s, "ice", 2), "park");
  const after = runDay(before);
  assert.equal(after.lastReport.expenses.rent, 800);
  assert.equal(after.cash, before.cash - 800 + after.lastReport.revenue);
});

test("upgrades are bought once and change the day", () => {
  const s = stocked(5);
  const pressed = buyUpgrade(s, "press");
  assert.equal(pressed.cash, s.cash - UPGRADES.find((u) => u.id === "press").cost);
  assert.throws(() => buyUpgrade(pressed, "press"), /already own/);
  const r = runDay(pressed).lastReport;
  assert.equal(r.pitchers * 16 - r.leftoverCups, r.sold);
  assert.equal(r.expenses.upgrades, 7500);

  assert.equal(runDay(s).inventory.ice, 0, "ice melts overnight");
  const cooled = runDay(buyUpgrade(s, "cooler"));
  const left = s.inventory.ice - cooled.lastReport.sold * s.recipe.ice;
  assert.equal(cooled.inventory.ice, Math.floor(left / 2));
});

test("you can't open without rent money", () => {
  let s = { ...stocked(3), rep: 100, unlocked: LOCATIONS.map((l) => l.id) };
  s = { ...setLocation(s, "beach"), cash: 100 };
  assert.match(openBlocker(s), /rent and ads/);
  assert.throws(() => runDay(s));
});

test("a broke stand with no stock is stuck", () => {
  assert.equal(isStuck(newGame(1)), false);
  assert.equal(isStuck({ ...newGame(1), cash: 50 }), true);
});

test("the season ends after day 30 and can continue", () => {
  let s = stocked(11, 200000);
  for (let d = 0; d < SEASON_DAYS; d++) {
    for (const id of SUPPLY_IDS) if (s.inventory[id] < 600) s = buySupply(s, id, 2);
    s = runDay(s);
  }
  assert.ok(seasonOver(s));
  assert.match(openBlocker(s), /season is over/);
  const summary = seasonSummary(s);
  assert.equal(summary.days, SEASON_DAYS);
  assert.equal(summary.finalCash, s.cash);
  assert.ok(summary.cupsSold > 0);
  const more = buySupply(keepPlaying(s), "ice", 2);
  assert.equal(seasonOver(more), false);
  assert.equal(runDay(more).day, SEASON_DAYS + 2);
});

test("a sensible player turns a profit over the season", () => {
  let s = newGame(21);
  while (!seasonOver(s)) {
    s = setRecipe(s, { lemons: 4, sugar: 4, ice: 4, price: 60 });
    for (const id of SUPPLY_IDS) {
      while (cupsPossible(s).cups < 90 && cupsPossible(s).limit === id && s.cash >= packPrice(s, id, 0)) {
        s = buySupply(s, id, 0);
      }
    }
    if (openBlocker(s)) break;
    s = runDay(s);
  }
  assert.equal(s.day, SEASON_DAYS + 1);
  assert.ok(s.cash > START_CASH * 5, `ended with ${money(s.cash)}`);
});

test("money and clock formatting", () => {
  assert.equal(money(0), "$0.00");
  assert.equal(money(5), "$0.05");
  assert.equal(money(-1234), "-$12.34");
  assert.equal(money(123456789), "$1,234,567.89");
  assert.equal(clockAt(0), "9:00 AM");
  assert.equal(clockAt(0.5), "1:00 PM");
  assert.equal(clockAt(1), "5:00 PM");
});
