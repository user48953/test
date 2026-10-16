// Lemonade Tycoon engine. Pure logic, no DOM: runs in the browser and under
// `node --test`.
//
// A game is a plain object (see `newGame`). Every move returns a new object
// and leaves the old one alone, so the UI can save and restore it as JSON.
// Money is in cents everywhere. Weather, market prices and customers come from
// a random stream seeded by (game seed, day), so the same choices on the same
// day always play out the same way.

export const SEASON_DAYS = 30;
export const START_CASH = 2000;
export const START_REP = 10;
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 17;
export const HOURS_OPEN = CLOSE_HOUR - OPEN_HOUR;
export const CUPS_PER_PITCHER = 12;
export const SERVE_PER_HOUR = 15;
export const PRICE_STEP = 5;

export const SUPPLIES = {
  lemons: {
    name: "Lemons",
    unit: "lemons",
    packs: [{ qty: 12, price: 240 }, { qty: 48, price: 840 }, { qty: 144, price: 2160 }],
  },
  sugar: {
    name: "Sugar",
    unit: "cups",
    packs: [{ qty: 12, price: 120 }, { qty: 48, price: 420 }, { qty: 144, price: 1080 }],
  },
  cups: {
    name: "Paper cups",
    unit: "cups",
    packs: [{ qty: 25, price: 100 }, { qty: 100, price: 350 }, { qty: 250, price: 750 }],
  },
  ice: {
    name: "Ice",
    unit: "cubes",
    packs: [{ qty: 100, price: 100 }, { qty: 250, price: 220 }, { qty: 500, price: 390 }],
  },
};
export const SUPPLY_IDS = Object.keys(SUPPLIES);

export const RECIPE_LIMITS = {
  lemons: [1, 10], // per pitcher
  sugar: [0, 10], // cups of sugar per pitcher
  ice: [0, 10], // cubes per cup
  price: [5, 300], // cents per cup
};

// `traffic` is people walking past on a mild, sunny day. `priceMult` scales
// what they'll pay. `exposure` is how hard bad weather hits the spot.
export const LOCATIONS = [
  { id: "street", name: "Maple Street", rent: 0, traffic: 90, priceMult: 1, exposure: 1, unlockRep: 0,
    blurb: "Quiet homes and dog walkers. No rent." },
  { id: "park", name: "Riverside Park", rent: 800, traffic: 150, priceMult: 1.1, exposure: 1.15, unlockRep: 25,
    blurb: "Joggers and picnics. Busy when it's nice out." },
  { id: "downtown", name: "Downtown", rent: 2000, traffic: 230, priceMult: 1.3, exposure: 0.7, unlockRep: 45,
    blurb: "Office crowds who pay more. Rain matters less." },
  { id: "beach", name: "The Boardwalk", rent: 3500, traffic: 320, priceMult: 1.5, exposure: 1.6, unlockRep: 65,
    blurb: "Huge, thirsty crowds on hot days. Empty in the rain." },
];

export const UPGRADES = [
  { id: "sign", name: "Chalkboard sign", cost: 2500, effect: "15% more passersby stop to look." },
  { id: "cooler", name: "Ice cooler", cost: 4000, effect: "Half your ice survives the night." },
  { id: "umbrella", name: "Patio umbrella", cost: 6000, effect: "Clouds and rain cost you half as many passersby." },
  { id: "press", name: "Lemon press", cost: 7500, effect: "Each pitcher pours 16 cups instead of 12." },
  { id: "helper", name: "Hire a helper", cost: 12000, effect: "Serve 30 cups an hour instead of 15." },
  { id: "neon", name: "Neon sign", cost: 25000, effect: "25% more passersby, and they pay 10% more." },
];

export const ADS = [
  { id: "none", name: "No ads", cost: 0, boost: 0 },
  { id: "flyers", name: "Flyers", cost: 300, boost: 0.15 },
  { id: "paper", name: "Newspaper ad", cost: 1200, boost: 0.35 },
  { id: "radio", name: "Radio spot", cost: 3000, boost: 0.6 },
];

// `traffic` scales passersby; `thirst` nudges how much they want a drink.
export const CONDITIONS = {
  sunny: { name: "Sunny", traffic: 1, thirst: 0.1 },
  partly: { name: "Partly cloudy", traffic: 0.9, thirst: 0 },
  cloudy: { name: "Overcast", traffic: 0.72, thirst: -0.05 },
  rain: { name: "Rain", traffic: 0.4, thirst: -0.1 },
  storm: { name: "Thunderstorms", traffic: 0.15, thirst: -0.15 },
};
export const CONDITION_ORDER = ["sunny", "partly", "cloudy", "rain", "storm"];

export const RANKS = [
  { min: 0, name: "Sidewalk Rookie" },
  { min: 20000, name: "Neighborhood Favorite" },
  { min: 75000, name: "Lemonade Mogul" },
  { min: 150000, name: "Citrus Tycoon" },
];

export const OUTCOMES = {
  pass: "Walked past",
  pricey: "Too pricey",
  line: "Line too long",
  soldout: "You'd sold out",
  bought: "Bought a cup",
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// mulberry32, seeded from the game seed, the day and a stream number, so
// weather (stream 1), prices (3) and customers (2) never borrow each other's
// numbers.
export function rng(seed, day, stream) {
  let a = (seed ^ Math.imul(day, 0x9e3779b1) ^ Math.imul(stream, 0x85ebca77)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  const u = 1 - r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function newGame(seed = 1) {
  return {
    version: 1,
    seed: seed >>> 0,
    day: 1,
    cash: START_CASH,
    rep: START_REP,
    inventory: { lemons: 0, sugar: 0, cups: 0, ice: 0 },
    recipe: { lemons: 4, sugar: 4, ice: 3, price: 50 },
    location: "street",
    unlocked: ["street"],
    upgrades: [],
    ad: "none",
    // What was spent this morning, for tonight's receipt.
    morning: { supplies: 0, upgrades: [] },
    endless: false,
    history: [],
    lastReport: null,
  };
}

export const has = (state, upgradeId) => state.upgrades.includes(upgradeId);
export const locationOf = (state) => LOCATIONS.find((l) => l.id === state.location);
export const adOf = (state) => ADS.find((a) => a.id === state.ad);
export const cupsPerPitcher = (state) => (has(state, "press") ? 16 : CUPS_PER_PITCHER);
export const servePerHour = (state) => (has(state, "helper") ? 30 : SERVE_PER_HOUR);
export const seasonOver = (state) => state.day > SEASON_DAYS && !state.endless;
export const rankFor = (cash) => [...RANKS].reverse().find((r) => cash >= r.min);

// The forecast is usually right: the temperature drifts a few degrees, and one
// day in five the sky turns out one step better or worse.
export function weatherFor(seed, day) {
  const r = rng(seed, day, 1);
  const season = Math.sin(Math.PI * (((day - 1) % SEASON_DAYS) / (SEASON_DAYS - 1)));
  const temp = Math.round(70 + 16 * season + (r() - 0.5) * 18);
  const heat = clamp((temp - 60) / 35, 0, 1);
  const weights = [0.3 + 0.35 * heat, 0.28, 0.2 - 0.1 * heat, 0.15 - 0.1 * heat, 0.07 - 0.05 * heat];
  let pick = r() * weights.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (pick > weights[idx] && idx < weights.length - 1) pick -= weights[idx++];
  const forecast = { temp, cond: CONDITION_ORDER[idx] };
  const actualTemp = temp + Math.round((r() - 0.5) * 8);
  const roll = r();
  if (roll < 0.1) idx = Math.max(0, idx - 1);
  else if (roll < 0.2) idx = Math.min(CONDITION_ORDER.length - 1, idx + 1);
  return { forecast, actual: { temp: actualTemp, cond: CONDITION_ORDER[idx] } };
}

// 0.1 on a cold, wet day; 1 at 90°F and sunny; up to 1.3 in a heat wave.
export function thirstFor({ temp, cond }) {
  return clamp((temp - 45) / 45 + CONDITIONS[cond].thirst, 0.1, 1.3);
}

// People walking past a spot in this weather, before the day's luck.
export function expectedCrowd(state, loc, weather, ad = adOf(state)) {
  let condTraffic = CONDITIONS[weather.cond].traffic;
  if (has(state, "umbrella")) condTraffic = 1 - (1 - condTraffic) / 2;
  return loc.traffic * condTraffic ** loc.exposure * (0.65 + 0.35 * Math.min(thirstFor(weather), 1.2))
    * (1 + ad.boost) * (has(state, "neon") ? 1.25 : 1);
}

// Lemon and sugar prices move a little each morning; cups and ice don't.
export function marketFor(seed, day) {
  const r = rng(seed, day, 3);
  return {
    lemons: Math.round((0.8 + 0.45 * r()) * 100) / 100,
    sugar: Math.round((0.9 + 0.2 * r()) * 100) / 100,
    cups: 1,
    ice: 1,
  };
}

export function packPrice(state, item, packIndex) {
  return Math.round(SUPPLIES[item].packs[packIndex].price * marketFor(state.seed, state.day)[item]);
}

// Today's price per unit in the smallest pack, which is what topping up costs.
export function unitPrice(state, item) {
  return packPrice(state, item, 0) / SUPPLIES[item].packs[0].qty;
}

export function costPerCup(state) {
  const { lemons, sugar, ice } = state.recipe;
  const perPitcher = lemons * unitPrice(state, "lemons") + sugar * unitPrice(state, "sugar");
  return perPitcher / cupsPerPitcher(state) + ice * unitPrice(state, "ice") + unitPrice(state, "cups");
}

// How many cups the stock on hand pours, and which supply runs out first.
export function cupsPossible(state, inventory = state.inventory) {
  const { lemons, sugar, ice } = state.recipe;
  const pitchers = Math.min(
    Math.floor(inventory.lemons / lemons),
    sugar > 0 ? Math.floor(inventory.sugar / sugar) : Infinity,
  );
  const limits = {
    lemons: Math.floor(inventory.lemons / lemons) * cupsPerPitcher(state),
    sugar: sugar > 0 ? Math.floor(inventory.sugar / sugar) * cupsPerPitcher(state) : Infinity,
    cups: inventory.cups,
    ice: ice > 0 ? Math.floor(inventory.ice / ice) : Infinity,
  };
  const cups = Math.min(pitchers * cupsPerPitcher(state), inventory.cups, limits.ice);
  const limit = SUPPLY_IDS.reduce((a, b) => (limits[b] < limits[a] ? b : a));
  return { cups, limit };
}

// Supplies needed before the stand can pour a single cup.
export function missingForOneCup(state) {
  const { lemons, sugar, ice } = state.recipe;
  const need = { lemons, sugar, cups: 1, ice };
  return SUPPLY_IDS.filter((id) => state.inventory[id] < need[id]);
}

// Out of stock and can't afford a small pack of each missing supply.
export function isStuck(state) {
  const missing = missingForOneCup(state);
  if (missing.length === 0) return false;
  const cost = missing.reduce((sum, id) => sum + packPrice(state, id, 0), 0);
  return cost > state.cash;
}

export function buyBlocker(state, item, packIndex) {
  if (seasonOver(state)) return "The season is over.";
  const price = packPrice(state, item, packIndex);
  if (price > state.cash) return `You need ${money(price)} and have ${money(state.cash)}.`;
  return null;
}

export function buySupply(state, item, packIndex) {
  const reason = buyBlocker(state, item, packIndex);
  if (reason) throw new Error(reason);
  const s = structuredClone(state);
  const price = packPrice(state, item, packIndex);
  s.cash -= price;
  s.inventory[item] += SUPPLIES[item].packs[packIndex].qty;
  s.morning.supplies += price;
  return s;
}

export function upgradeBlocker(state, id) {
  const upgrade = UPGRADES.find((u) => u.id === id);
  if (!upgrade) return "There's no such upgrade.";
  if (has(state, id)) return "You already own this.";
  if (seasonOver(state)) return "The season is over.";
  if (upgrade.cost > state.cash) return `You need ${money(upgrade.cost)} and have ${money(state.cash)}.`;
  return null;
}

export function buyUpgrade(state, id) {
  const reason = upgradeBlocker(state, id);
  if (reason) throw new Error(reason);
  const s = structuredClone(state);
  const upgrade = UPGRADES.find((u) => u.id === id);
  s.cash -= upgrade.cost;
  s.upgrades.push(id);
  s.morning.upgrades.push(id);
  return s;
}

export function setRecipe(state, changes) {
  const s = structuredClone(state);
  for (const [key, value] of Object.entries(changes)) {
    const [lo, hi] = RECIPE_LIMITS[key];
    let v = clamp(Math.round(value), lo, hi);
    if (key === "price") v = Math.round(v / PRICE_STEP) * PRICE_STEP;
    s.recipe[key] = v;
  }
  return s;
}

export function locationBlocker(state, id) {
  const loc = LOCATIONS.find((l) => l.id === id);
  if (!loc) return "There's no such spot.";
  if (!state.unlocked.includes(id)) return `Unlocks at reputation ${loc.unlockRep}.`;
  return null;
}

export function setLocation(state, id) {
  const reason = locationBlocker(state, id);
  if (reason) throw new Error(reason);
  return { ...structuredClone(state), location: id };
}

export function setAd(state, id) {
  if (!ADS.some((a) => a.id === id)) throw new Error("There's no such ad.");
  return { ...structuredClone(state), ad: id };
}

export function openBlocker(state) {
  if (seasonOver(state)) return "The season is over.";
  const due = locationOf(state).rent + adOf(state).cost;
  if (due > state.cash) return `Today's rent and ads cost ${money(due)} and you have ${money(state.cash)}.`;
  const missing = missingForOneCup(state);
  if (missing.length) return `Buy ${listJoin(missing.map((id) => SUPPLIES[id].name.toLowerCase()))} before you open.`;
  return null;
}

function comment(dl, ds, di, score) {
  const worst = [
    [dl, 1.5, "Too sour!", "Too watery"],
    [ds, 1.5, "Way too sweet", "Needs sugar"],
    [di, 2.5, "Too much ice", "Not cold enough"],
  ].sort((a, b) => Math.abs(b[0]) / b[1] - Math.abs(a[0]) / a[1])[0];
  if (score < 0.75 && Math.abs(worst[0]) > worst[1]) return worst[0] > 0 ? worst[2] : worst[3];
  return score >= 0.82 ? "Delicious!" : "Pretty good";
}

// Run one day at the stand. Returns the next morning's state; the day's
// receipt, with every customer in arrival order, is in `state.lastReport`.
export function runDay(state) {
  const reason = openBlocker(state);
  if (reason) throw new Error(reason);
  const s = structuredClone(state);
  const loc = locationOf(s);
  const ad = adOf(s);
  const { forecast, actual: weather } = weatherFor(s.seed, s.day);
  const r = rng(s.seed, s.day, 2);
  const thirst = thirstFor(weather);
  const { recipe, inventory } = s;
  const cashBefore = state.cash + state.morning.supplies + state.morning.upgrades
    .reduce((sum, id) => sum + UPGRADES.find((u) => u.id === id).cost, 0);
  const repBefore = s.rep;

  s.cash -= loc.rent + ad.cost;

  const passersby = Math.round(expectedCrowd(s, loc, weather, ad) * (0.9 + 0.2 * r()));
  const interest = clamp((0.12 + 0.5 * thirst + 0.35 * (s.rep / 100)) * (has(s, "sign") ? 1.15 : 1), 0.03, 0.95);
  const willingness = 85 * loc.priceMult * (0.5 + 0.6 * thirst) * (0.8 + 0.4 * (s.rep / 100))
    * (has(s, "neon") ? 1.1 : 1);
  const idealIce = clamp((weather.temp - 50) / 8, 0, 7);

  // Draw every customer the same way whatever happens to them, so a change of
  // price or recipe changes their answers but not who turns up.
  const customers = [];
  for (let i = 0; i < passersby; i++) {
    customers.push({
      t: r(),
      interested: r() < interest,
      wtp: willingness * (0.6 + 0.8 * r()),
      lemons: 4 + 0.7 * gauss(r),
      sugar: 4 + 0.7 * gauss(r),
      ice: idealIce + 0.8 * gauss(r),
      look: Math.floor(r() * 0x10000),
    });
  }
  customers.sort((a, b) => a.t - b.t);

  const perPitcher = cupsPerPitcher(s);
  const capacity = servePerHour(s);
  const served = new Array(HOURS_OPEN).fill(0);
  const counts = Object.fromEntries(Object.keys(OUTCOMES).map((k) => [k, 0]));
  const comments = {};
  let inPitcher = 0;
  let pitchers = 0;
  let revenue = 0;
  let satTotal = 0;
  let ranOut = null;

  const pour = () => {
    if (inventory.cups < 1) return "cups";
    if (inventory.ice < recipe.ice) return "ice";
    if (inPitcher === 0) {
      if (inventory.lemons < recipe.lemons) return "lemons";
      if (inventory.sugar < recipe.sugar) return "sugar";
      inventory.lemons -= recipe.lemons;
      inventory.sugar -= recipe.sugar;
      inPitcher = perPitcher;
      pitchers++;
    }
    inPitcher--;
    inventory.cups--;
    inventory.ice -= recipe.ice;
    return null;
  };

  const log = customers.map((c) => {
    const entry = { t: c.t, outcome: "pass", comment: null, mood: null, look: c.look };
    const hour = Math.min(HOURS_OPEN - 1, Math.floor(c.t * HOURS_OPEN));
    if (!c.interested) entry.outcome = "pass";
    else if (c.wtp < recipe.price) entry.outcome = "pricey";
    else if (served[hour] >= capacity) entry.outcome = "line";
    else {
      const short = pour();
      if (short) {
        entry.outcome = "soldout";
        ranOut ??= { item: short, t: c.t };
      } else {
        served[hour]++;
        revenue += recipe.price;
        const dl = recipe.lemons - c.lemons;
        const ds = recipe.sugar - c.sugar;
        const di = recipe.ice - c.ice;
        const taste = clamp(1 - Math.hypot(dl, ds) / 4.5, 0, 1);
        const cold = clamp(1 - Math.abs(di) / 5, 0, 1);
        const value = clamp((c.wtp - recipe.price) / c.wtp, 0, 0.5);
        const score = 0.65 * taste + 0.25 * cold + 0.2 * value;
        satTotal += score;
        entry.outcome = "bought";
        entry.comment = comment(dl, ds, di, score);
        entry.mood = score >= 0.7 ? "happy" : score >= 0.45 ? "meh" : "unhappy";
        comments[entry.comment] = (comments[entry.comment] || 0) + 1;
      }
    }
    counts[entry.outcome]++;
    return entry;
  });

  const sold = counts.bought;
  const avgSat = sold ? satTotal / sold : 0;
  let repDelta = sold ? (avgSat - 0.6) * 22 * Math.min(1, sold / 15) : -1;
  repDelta -= Math.min(6, counts.soldout * 0.12);
  repDelta -= Math.min(3, counts.line * 0.04);
  if (repDelta > 0) repDelta *= 1 - s.rep / 125;
  s.rep = clamp(round1(s.rep + repDelta), 0, 100);
  const unlockedNow = LOCATIONS
    .filter((l) => !s.unlocked.includes(l.id) && s.rep >= l.unlockRep)
    .map((l) => l.id);
  s.unlocked.push(...unlockedNow);

  s.cash += revenue;
  const iceBefore = inventory.ice;
  inventory.ice = has(s, "cooler") ? Math.floor(inventory.ice / 2) : 0;

  const upgradeCost = s.morning.upgrades.reduce((sum, id) => sum + UPGRADES.find((u) => u.id === id).cost, 0);
  const expenses = { supplies: s.morning.supplies, rent: loc.rent, ads: ad.cost, upgrades: upgradeCost };
  const profit = revenue - expenses.supplies - expenses.rent - expenses.ads;

  const report = {
    day: s.day,
    location: loc.id,
    ad: ad.id,
    forecast,
    weather,
    recipe: { ...recipe },
    passersby,
    interested: passersby - counts.pass,
    counts,
    comments,
    sold,
    revenue,
    expenses,
    profit,
    cashBefore,
    cashAfter: s.cash,
    repBefore,
    repAfter: s.rep,
    avgSat: round1(avgSat * 100),
    pitchers,
    iceMelted: iceBefore - inventory.ice,
    leftoverCups: inPitcher,
    ranOut,
    unlockedNow,
    customers: log,
  };

  s.history.push({
    day: s.day,
    location: loc.id,
    weather,
    sold,
    revenue,
    profit,
    spent: expenses.supplies + expenses.rent + expenses.ads + expenses.upgrades,
    cash: s.cash,
    rep: s.rep,
  });
  s.lastReport = report;
  s.morning = { supplies: 0, upgrades: [] };
  s.day += 1;
  return s;
}

export function keepPlaying(state) {
  return { ...structuredClone(state), endless: true };
}

export function seasonSummary(state) {
  const season = state.history.filter((h) => h.day <= SEASON_DAYS);
  const best = season.reduce((a, b) => (b.profit > (a?.profit ?? -Infinity) ? b : a), null);
  const finalCash = season.length ? season[season.length - 1].cash : state.cash;
  return {
    days: season.length,
    finalCash,
    cupsSold: season.reduce((sum, h) => sum + h.sold, 0),
    revenue: season.reduce((sum, h) => sum + h.revenue, 0),
    bestDay: best,
    rank: rankFor(finalCash),
  };
}

export function money(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function clockAt(t) {
  const minutes = Math.round(t * HOURS_OPEN * 60);
  const h24 = OPEN_HOUR + Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
