#!/usr/bin/env node
// Builds src/research-data.js from the four research sources saved by
// scripts/fetch-sources.sh:
//
//   lastz.fandom.com  New Home, Shelter Building and Shelter Manager (Electricity + Zents)
//   ztools.co.uk      the badge trees: links, per-level badge costs, bonuses, power, unlock rules
//   lastz.gg          exact Shooter, Assaulter and Rider Training data; checks Unit Special Training
//   gamides.com       tree descriptions; badge totals to cross-check ztools
//
// Where a source leaves a number out, it is estimated from the numbers that are
// published, and the estimate is flagged in the output so the app can say so.
// Nothing from the sources is executed: JS chunks are parsed as literals.
//
// Usage: node scripts/build-research-data.mjs [raw-folder]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = process.argv[2] || join(ROOT, "sources/raw");
const OUT = join(ROOT, "src/research-data.js");
const ART_DIR = join(ROOT, "assets/trees");
const read = (file) => readFileSync(join(RAW, file), "utf8");

export const SITES = {
  fandom: { name: "lastz.fandom.com", url: "https://lastz.fandom.com/wiki/Technologies" },
  ztools: { name: "ztools.co.uk", url: "https://ztools.co.uk/tools/research/" },
  gamides: { name: "gamides.com", url: "https://gamides.com/research/" },
  lastzgg: { name: "lastz.gg", url: "https://lastz.gg/basics/technologies" },
};

// ---------- trees, in the order the game unlocks them ----------

const TREES = [
  {
    id: "newHome", name: "New Home", currency: "resources", fandom: "New Home",
    description: "The first tree. Construction and research speed, resource production and protection, and the research that opens the Shooter and Rider Camps and troop promotions.",
  },
  {
    id: "shelterBuilding", name: "Shelter Building", currency: "resources", fandom: "Shelter Building",
    description: "Production, storage and gathering for food, wood, Zents and Electricity, plus construction and research speed. Finishing it opens Shelter Manager.",
  },
  {
    id: "shelterManager", name: "Shelter Manager", currency: "resources", fandom: "Shelter Manager",
    reqs: ["Shelter Building 100%"], reqSource: "fandom",
    description: "Opens once Shelter Building is maxed: bigger production, storage, protection and gathering bonuses, healing speed and hospital space. lastz.gg calls this tree HQ Management.",
  },
  { id: "heroTraining", ztools: "hero-training", gamides: "hero_training" },
  { id: "allianceRecognition", ztools: "alliance-recognition", gamides: "alliance_recognition" },
  { id: "fullyArmedAlliance", ztools: "fully-armed-alliance", gamides: "fully_armed_alliance" },
  { id: "militaryStrategies", ztools: "military-strategies", gamides: "military_strategies" },
  { id: "siegeToSeize", ztools: "siege-to-seize", gamides: "siege_to_seize" },
  { id: "peaceShield", ztools: "peace-shield", gamides: "peace_shield" },
  { id: "field", ztools: "field", gamides: "field" },
  { id: "armyBuilding", ztools: "army-building", gamides: "army_building" },
  {
    id: "shooterTraining", name: "Shooter Training", ztools: "shooter-training", lastzgg: "ShooterTrainingCalculator",
    description: "Shooter ATK, DEF and HP, plus siege and in-field bonuses for all troops. Opens at Laboratory Lv 25 with Field finished.",
  },
  {
    id: "assaulterTraining", name: "Assaulter Training", lastzgg: "AssaulterTrainingCalculator", layoutFrom: "shooterTraining",
    reqs: ["Laboratory Lv.25", "Field 100%"], reqSource: "lastzgg",
    description: "Assaulter ATK, DEF and HP, plus siege and in-field bonuses for all troops. Opens at Laboratory Lv 25 with Field finished.",
  },
  {
    id: "riderTraining", name: "Rider Training", lastzgg: "RiderTrainingCalculator", layoutFrom: "shooterTraining",
    reqs: ["Laboratory Lv.25", "Field 100%"], reqSource: "lastzgg",
    description: "Rider ATK, DEF and HP, plus siege and in-field bonuses for all troops. Opens at Laboratory Lv 25 with Field finished.",
  },
  { id: "unitSpecialTraining", ztools: "unit-special-training", gamides: "unit_special_training", lastzgg: "T10Calculator" },
];

// ztools.co.uk's file name for each tree's artwork (the game's own Laboratory
// card art). Shelter Manager is the tree ztools and lastz.gg call HQ Management.
const ART = {
  newHome: "new-home",
  shelterBuilding: "shelter-building",
  shelterManager: "hq-management",
  heroTraining: "hero-training",
  allianceRecognition: "alliance-recognition",
  fullyArmedAlliance: "fully-armed-alliance",
  militaryStrategies: "military-strategies",
  siegeToSeize: "siege-to-seize",
  peaceShield: "peace-shield",
  field: "field",
  armyBuilding: "army-building",
  shooterTraining: "shooter-training",
  assaulterTraining: "assaulter-training",
  riderTraining: "rider-training",
  unitSpecialTraining: "unit-special-training",
  eliteTroops: "elite-troops",
  rapidGrowth: "rapid-growth",
};

// Trees the sources name but don't list nodes for.
const UNPUBLISHED = [
  {
    id: "eliteTroops",
    name: "Elite Troops",
    note: "Badge-free; lastz.gg says it raises training speed for all three troop types. Military Strategies needs it finished. None of the four sources lists its research.",
  },
  {
    id: "rapidGrowth",
    name: "Rapid Growth",
    note: "Badge-free, per lastz.gg. None of the four sources lists its research.",
  },
];

// ---------- small helpers ----------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const slug = (s) => s.toLowerCase().replace(/['’!]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sig3 = (x) => {
  if (!x) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(x))) - 2);
  return Math.round(x / p) * p;
};
const roundTo = (x, step) => Math.round(x / step) * step;
const titleCase = (s) => s.split(" ")
  .map((w, i) => (i && ["of", "in", "to", "the", "and"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(" ");

// "20.0 K" -> 20000, "1.2 M" -> 1200000, "+518" -> 518, "" -> null
function amount(text) {
  const s = String(text ?? "").replace(/,/g, "").replace(/^\+/, "").trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMG])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, G: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(Number(m[1]) * mult);
}

// One wording per bonus across all four sources, so totals add up.
function normLabel(label) {
  return label
    .replace(/\s+/g, " ")
    .replace(/^Troop (ATK|DEF) \(Siege Assault\)$/, "Troop $1 in Siege Assaults")
    .replace(/^Troop (ATK|DEF) \(Siege Defense\)$/, "Troop $1 in Siege Defenses")
    .replace(/Gatherind/g, "Gathering")
    .replace(/Reserach/g, "Research")
    .replace(/\bZents (Gathering|Production)/g, "Zent $1")
    .replace(/\b(Shooter|Assaulter|Rider)s\b/g, "$1")
    .replace(/\bAttack\b/g, "ATK")
    .replace(/\bDefense\b/g, "DEF")
    .replace(/^Field Troop/, "In-field Troop")
    .trim();
}

// "Construction Speed + 5.0%" -> { label, unit: "%", value: 5 }
// "Shooter Camp Unlocked"     -> { label: "Unlocks", text: "Shooter Camp" }
function parseEffectText(text) {
  return text.split(/<br\s*\/?>/i).map((part) => {
    const s = part.replace(/(\d)\.o\b/g, "$1.0").replace(/\s+/g, " ").trim();
    let m = s.match(/^(.*\S)\s+Unlocked$/i);
    if (m) return { label: "Unlocks", text: m[1].replace(/\s+/g, " ") };
    m = s.match(/^(.*?)\s*\+?\s*(\d[\d,]*(?:\.\d+)?)\s*(%?)$/);
    if (m) return { label: normLabel(m[1]), unit: m[3], value: Number(m[2].replace(/,/g, "")) };
    return { label: "Unlocks", text: s };
  });
}

// ---------- parsers ----------

// lastz.fandom.com: MediaWiki tables, one per tree section.
function parseFandom(json) {
  const wikitext = JSON.parse(json).parse.wikitext["*"];
  const parts = wikitext.split(/^==([^=\n]+)==\s*$/m);
  const key = (h) => {
    const k = h.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
    return { technology: "name", "required lab level": "lab", "required techs": "requires", effects: "effects" }[k] || k;
  };
  const clean = (s) => s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").trim();
  const sections = {};
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];
    const header = [...body.matchAll(/^!(.*)$/gm)].map((m) => key(m[1]));
    const rows = [];
    for (const chunk of body.split("\n|-").slice(1)) {
      const cells = [...chunk.matchAll(/^\|(?![-}])(.*)$/gm)].map((m) => clean(m[1]));
      if (cells.some(Boolean)) rows.push(Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])));
    }
    sections[parts[i].trim()] = rows;
  }
  return sections;
}

// ztools.co.uk: <script id="tree-data" type="application/json">
function parseZtools(html) {
  const m = html.match(/<script[^>]*id="tree-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("ztools: tree-data block not found");
  return JSON.parse(m[1]);
}

// Reads one JSON value starting at `start`, respecting strings.
function jsonAt(text, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON");
}

// gamides.com: Next.js flight data holds {"tree":{...}}.
function parseGamides(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)];
  const flight = chunks.map((m) => JSON.parse(`"${m[1]}"`)).join("");
  const at = flight.indexOf('{"tree":{');
  if (at < 0) throw new Error("gamides: tree payload not found");
  return jsonAt(flight, at).tree;
}

// lastz.gg: minified `a=[..],b={..}` literal declarations. Parsed, not run.
function parseJsLiterals(src) {
  const head = src.match(/var \w+=\w+\(\w+\(\),1\),/);
  if (!head) throw new Error("lastz.gg: data block not found");
  const re = /\s*(?:(-?\d+(?:\.\d+)?(?:e-?\d+)?)|(`[^`$]*`)|("(?:[^"\\]|\\.)*")|([A-Za-z_$][\w$]*)|([[\]{}(),:=.!?]))/y;
  re.lastIndex = head.index + head[0].length;
  const toks = [];
  for (let m; (m = re.exec(src)) && toks.length < 200000;) {
    if (m[1] !== undefined) toks.push({ k: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) toks.push({ k: "str", v: m[2].slice(1, -1) });
    else if (m[3] !== undefined) toks.push({ k: "str", v: JSON.parse(m[3]) });
    else if (m[4] !== undefined) toks.push({ k: "id", v: m[4] });
    else toks.push({ k: "p", v: m[5] });
  }
  const env = {};
  let pos = 0;
  const STOP = Symbol("stop");
  const peek = () => toks[pos] || {};
  const value = () => {
    const t = toks[pos++] || {};
    if (t.k === "num" || t.k === "str") return t.v;
    if (t.k === "id") {
      if (t.v === "true" || t.v === "false") return t.v === "true";
      if (peek().v === "." || peek().v === "(" || !(t.v in env)) throw STOP;
      return env[t.v];
    }
    if (t.v === "!") return !value();
    if (t.v === "[") {
      const out = [];
      while (peek().v !== "]") {
        out.push(value());
        if (peek().v === ",") pos++;
      }
      pos++;
      return out;
    }
    if (t.v === "{") {
      const out = {};
      while (peek().v !== "}") {
        const k = toks[pos++].v;
        if (peek().v === ":") {
          pos++;
          out[k] = value();
        } else out[k] = env[k];
        if (peek().v === ",") pos++;
      }
      pos++;
      return out;
    }
    throw STOP;
  };
  for (;;) {
    const name = toks[pos++];
    if (name?.k !== "id" || peek().v !== "=") break;
    pos++;
    try {
      env[name.v] = value();
    } catch (e) {
      if (e === STOP) break;
      throw e;
    }
    if (peek().v !== ",") break;
    pos++;
  }
  const values = Object.values(env);
  const nodes = values.find((v) => Array.isArray(v) && v[0]?.costsPerLevel);
  const rows = values.find((v) => Array.isArray(v) && Array.isArray(v[0]) && typeof v[0][0] === "string");
  if (!nodes) throw new Error("lastz.gg: node list not found");
  return { nodes, rows };
}

// ---------- level curves ----------

// How a node's cost grows level by level depends only on its level count.
// Learn each curve from the badge nodes whose every level is published.
function learnCurves(nodeLists) {
  const byLen = {};
  for (const n of nodeLists) {
    const c = n.cost;
    if (c.length < 2 || c.some((x) => !x)) continue;
    (byLen[c.length] ||= []).push(c.map((x) => x / c[0]));
  }
  const curves = {};
  for (const [len, list] of Object.entries(byLen)) {
    curves[len] = Array.from({ length: Number(len) }, (_, i) => median(list.map((r) => r[i])));
  }
  return curves;
}

function curveFor(curves, len) {
  return curves[len] || Array.from({ length: len }, (_, i) => 1.2 ** i);
}

// Fill missing levels from the nearest published level. Returns the levels estimated.
function fillLevels(values, curve, round) {
  const known = values.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const estimated = [];
  if (!known.length) return estimated;
  values.forEach((v, i) => {
    if (v) return;
    const k = known.reduce((best, j) => (Math.abs(j - i) < Math.abs(best - i) ? j : best));
    values[i] = round((values[k] * curve[i]) / curve[k]);
    estimated.push(i + 1);
  });
  return estimated;
}

// ---------- building each tree ----------

const fandom = parseFandom(read("fandom-technologies.json"));
const ztools = parseZtools(read("ztools-research.html"));
const lastzgg = Object.fromEntries(
  ["ShooterTrainingCalculator", "AssaulterTrainingCalculator", "RiderTrainingCalculator", "T10Calculator"]
    .map((c) => [c, parseJsLiterals(read(`lastzgg-${c}.js`))])
);
const gamides = Object.fromEntries(
  TREES.filter((t) => t.gamides).map((t) => [t.gamides, parseGamides(read(`gamides-${t.gamides}.html`))])
);

// Raw node: { key, name, maxLevel, parents:[key], lab, x, cost:{res:[..]}, effects, power, source }
const effectsFromZtools = (stats) => stats.map((s) => (s.format === "text"
  ? { label: "Unlocks", text: s.values[0] }
  : { label: normLabel(s.label), unit: s.format === "percent" ? "%" : "", values: s.values }));

function ztoolsNodes(treeKey) {
  return ztools[treeKey].nodes.map((n) => ({
    key: n.id,
    name: titleCase(n.name),
    maxLevel: n.maxLevel,
    parents: n.parents,
    lab: Number(n.id.match(/-lab-(\d+)$/)?.[1]) || null,
    x: n.position?.x ?? 0,
    cost: { badges: n.badgeCost.map((c) => c ?? null) },
    effects: effectsFromZtools(n.stats),
    power: n.power?.length === n.maxLevel ? n.power : null,
    source: "ztools",
  }));
}

function lastzggNodes(calc, layout) {
  const { nodes } = lastzgg[calc];
  return nodes.map((n, i) => ({
    key: layout ? layout[i].key : slug(n.name),
    name: titleCase(n.name.replace(/\s*\((I|II)\)$/, "")),
    maxLevel: n.maxLevels,
    parents: layout ? layout[i].parents : [],
    lab: layout ? layout[i].lab : null,
    x: layout ? layout[i].x : 0,
    cost: { badges: n.costsPerLevel },
    effects: n.bonusType ? [{ label: normLabel(n.bonusType), unit: "%", values: n.bonusPerLevel }] : [],
    power: n.powerPerLevel?.length === n.maxLevels ? n.powerPerLevel : null,
    source: "lastzgg",
  }));
}

// fandom rows -> nodes. A row "Name [n]" is level n of a node; a row without
// a level is a one-level node. Repeated names are separate nodes in the game,
// and "Required Techs" names the closest earlier node with that name.
function fandomNodes(section) {
  const nodes = [];
  for (const row of fandom[section]) {
    const m = row.name.match(/^(.*?)\s*\[(\d+)\]\s*$/);
    const name = (m ? m[1] : row.name).trim();
    const level = m ? Number(m[2]) : 1;
    let node = nodes[nodes.length - 1];
    if (!node || level === 1 || node.name !== name) {
      node = {
        key: `row${nodes.length}`,
        name,
        maxLevel: 0,
        requires: (row.requires || "").split(/<br\s*\/?>/i).map((s) => s.replace(/\s*\[\d+\]\s*$/, "").trim()).filter(Boolean),
        lab: amount(row.lab),
        x: 0,
        cost: { electricity: [], zents: [] },
        levelEffects: [],
        power: [],
        source: "fandom",
      };
      nodes.push(node);
    }
    node.maxLevel++;
    node.cost.electricity.push(amount(row.electricity) || (row.electricity?.trim() === "0" ? 0 : null));
    node.cost.zents.push(amount(row.zents) || (row.zents?.trim() === "0" ? 0 : null));
    node.levelEffects.push(parseEffectText(row.effects || ""));
    node.power.push(amount(row.power));
  }
  for (const [i, node] of nodes.entries()) {
    // Unnamed on the wiki: name it after what it does.
    if (/\(Unnamed\)/i.test(node.name)) node.name = "Zent Production";
    node.parents = node.requires.map((req) => {
      for (let j = i - 1; j >= 0; j--) {
        const n = nodes[j].name;
        if (n === req || n.startsWith(`${req} `) || req.startsWith(`${n} `) || (/\(Unnamed\)/i.test(req) && n === "Zent Production")) return nodes[j].key;
      }
      throw new Error(`fandom ${section}: ${node.name} needs unknown "${req}"`);
    });
    // Per-level effects -> one entry per bonus with a value for every level.
    node.effects = node.levelEffects[0].map((e, k) => (e.text !== undefined
      ? { label: e.label, text: e.text }
      : { label: e.label, unit: e.unit, values: node.levelEffects.map((lv) => lv[k]?.value ?? null) }));
    delete node.levelEffects;
    delete node.requires;
    if (node.power.some((p) => p === null)) node.power = null;
  }
  return nodes;
}

// ---------- assemble ----------

const built = new Map();
const report = [];

for (const meta of TREES) {
  let nodes;
  const sources = new Set();
  const notes = [];
  let reqs = meta.reqs;
  let reqSource = meta.reqSource;
  let name = meta.name;
  let description = meta.description;

  if (meta.fandom) {
    nodes = fandomNodes(meta.fandom);
    sources.add("fandom");
  } else if (meta.lastzgg && meta.id !== "unitSpecialTraining") {
    // lastz.gg has every level of the troop trees to the badge; ztools rounds some and skips others.
    const layout = meta.layoutFrom ? built.get(meta.layoutFrom).raw : meta.ztools ? ztoolsNodes(meta.ztools) : null;
    nodes = lastzggNodes(meta.lastzgg, layout);
    sources.add("lastzgg");
    if (meta.ztools) {
      sources.add("ztools");
      const zt = ztoolsNodes(meta.ztools);
      nodes.forEach((n, i) => {
        if (zt[i].effects.length) n.effects = zt[i].effects;
      });
    }
    if (meta.layoutFrom) {
      notes.push("Links and per-node Laboratory levels follow Shooter Training, which lastz.gg lays out the same way.");
      nodes.forEach((n) => (n.estLab = Boolean(n.lab)));
    }
  } else {
    nodes = ztoolsNodes(meta.ztools);
    sources.add("ztools");
  }

  if (meta.ztools) {
    const zt = ztools[meta.ztools];
    name ||= zt.name;
    if (!reqs) {
      reqs = zt.reqs;
      reqSource = "ztools";
    }
  }
  if (meta.gamides) {
    const g = gamides[meta.gamides];
    sources.add("gamides");
    description ||= g.description;
    name ||= g.name;
    const ours = sum(nodes.flatMap((n) => n.cost.badges ?? []));
    const nulls = nodes.some((n) => n.cost.badges?.some((c) => c === null));
    if (g.totalBadges !== ours && !nulls) {
      notes.push(`gamides.com puts the tree at ${g.totalBadges.toLocaleString("en-US")} badges; ztools.co.uk's level-by-level costs add up to ${ours.toLocaleString("en-US")}, which is used here.`);
    }
    if (g.unlockRequirement && reqSource === "ztools") {
      const zt = (reqs || []).filter((r) => /%$/.test(r)).join(" + ");
      const gm = g.unlockRequirement.replace(/(\d+%) ([^+]+)/g, "$2 $1").replace(/\s+/g, " ").trim();
      if (zt && gm.replace(/\s/g, "") !== zt.replace(/\s/g, "")) {
        notes.push(`Unlock rule from ztools.co.uk (${zt}); gamides.com lists ${gm}.`);
      }
    }
  }
  if (meta.lastzgg === "T10Calculator") {
    const lz = lastzgg.T10Calculator.nodes;
    const same = lz.length === nodes.length && lz.every((n, i) => n.costsPerLevel.join() === nodes[i].cost.badges.join());
    sources.add("lastzgg");
    report.push(`unitSpecialTraining: lastz.gg ${same ? "matches" : "DIFFERS FROM"} ztools level by level`);
  }

  built.set(meta.id, { meta, name, description, reqs: reqs || [], reqSource, nodes, raw: nodes.map((n) => ({ ...n })), sources, notes });
}

// Level curves, learned from every fully published badge node.
const curves = learnCurves(
  [...built.values()].flatMap((t) => t.raw).filter((n) => n.cost.badges).map((n) => ({ cost: n.cost.badges }))
);

// Power a badge level adds, as a function of its badge cost: a straight line
// in log-log space through every published badge level (about +-17%).
const powerFit = (() => {
  const pts = [];
  for (const t of built.values()) {
    for (const n of t.raw) {
      if (!n.cost.badges || !n.power) continue;
      n.cost.badges.forEach((c, i) => {
        const gain = n.power[i] - (n.power[i - 1] || 0);
        if (c > 0 && gain > 0) pts.push([Math.log(c), Math.log(gain)]);
      });
    }
  }
  const mx = sum(pts.map((p) => p[0])) / pts.length;
  const my = sum(pts.map((p) => p[1])) / pts.length;
  const b = sum(pts.map(([x, y]) => (x - mx) * (y - my))) / sum(pts.map(([x]) => (x - mx) ** 2));
  const a = my - b * mx;
  const rms = Math.sqrt(sum(pts.map(([x, y]) => (y - a - b * x) ** 2)) / pts.length);
  report.push(`power per badge level: gain = ${Math.exp(a).toFixed(0)} x cost^${b.toFixed(3)} (rms ${(rms * 100).toFixed(0)}% over ${pts.length} levels)`);
  return (cost) => Math.exp(a) * cost ** b;
})();

for (const tree of built.values()) {
  const { nodes, meta } = tree;
  const res = meta.currency === "resources" ? ["electricity", "zents"] : ["badges"];
  const round = meta.currency === "resources" ? sig3 : (x) => Math.max(10, roundTo(x, 10));

  // Shelter Manager: fandom gives effects and power but almost no costs, no
  // links and no Laboratory levels. Rows follow the power each node gives
  // (nodes in a row cost the same where costs are published), each row needs
  // the row before it, and missing first-level costs follow the
  // cost-to-power trend of the nodes whose costs are published.
  if (meta.id === "shelterManager") {
    const groups = [];
    for (const n of nodes) {
      const p1 = n.power[0];
      let g = groups.find((gr) => gr.power === p1);
      if (!g) groups.push((g = { power: p1, nodes: [] }));
      g.nodes.push(n);
    }
    groups.sort((a, b) => a.power - b.power);
    groups.forEach((g, i) => g.nodes.forEach((n) => {
      n.parents = i ? groups[i - 1].nodes.map((p) => p.key) : [];
      n.estLinks = true;
    }));
    const anchors = [];
    for (const n of nodes) {
      const curve = curveFor(curves, n.maxLevel);
      const firsts = n.cost.electricity.map((c, i) => (c ? c / curve[i] : null)).filter(Boolean);
      if (firsts.length) anchors.push({ n, power: n.power[0], first: median(firsts) });
    }
    const pts = anchors.map((a) => [Math.log(a.power), Math.log(a.first)]);
    const mx = sum(pts.map((p) => p[0])) / pts.length;
    const my = sum(pts.map((p) => p[1])) / pts.length;
    const slope = sum(pts.map(([x, y]) => (x - mx) * (y - my))) / sum(pts.map(([x]) => (x - mx) ** 2));
    const zentShare = median(nodes.flatMap((n) => n.cost.electricity.map((e, i) => (e && n.cost.zents[i] ? n.cost.zents[i] / e : null)).filter(Boolean)));
    for (const g of groups) {
      // Nodes in a row share costs: take a row anchor when any node has one.
      const rowAnchors = anchors.filter((a) => g.nodes.includes(a.n)).map((a) => a.first);
      for (const n of g.nodes) {
        if (n.cost.electricity.some(Boolean)) continue;
        const first = rowAnchors.length ? median(rowAnchors) : Math.exp(my + slope * (Math.log(g.power) - mx));
        n.cost.electricity[0] = sig3(first);
        n.preEst = new Set([1]);
      }
    }
    for (const n of nodes) {
      n.preEst ||= new Set();
      n.cost.zents = n.cost.zents.map((z, i) => {
        if (z || !n.cost.electricity[i]) return z;
        n.preEst.add(i + 1);
        return sig3(n.cost.electricity[i] * zentShare);
      });
    }
    tree.notes.push("lastz.fandom.com lists this tree's research, bonuses and power, but only a few costs and no links or Laboratory levels. Rows here follow the power each research gives, each row needs the row before it, and missing costs are estimated from the published ones.");
  }

  // Costs: fill unpublished levels along the learned curve.
  for (const n of nodes) {
    const curve = curveFor(curves, n.maxLevel);
    const est = new Set(n.preEst || []);
    for (const r of res) {
      const values = n.cost[r];
      if (values.every((v) => v === 0)) continue;
      for (const L of fillLevels(values, curve, round)) est.add(L);
    }
    n.estCost = [...est].sort((a, b) => a - b);
  }

  // Power: where the source leaves it out, estimate it from each level's badge cost.
  const noPower = nodes.filter((n) => !n.power && n.cost.badges);
  for (const n of noPower) {
    let p = 0;
    n.power = n.cost.badges.map((c) => (p += Math.round(powerFit(c))));
    n.estPower = true;
  }
  if (noPower.length) {
    tree.notes.push("ztools.co.uk lists this tree's research and badge costs but not its bonus amounts or power. Bonuses are named after the same research in the other badge trees, and power is estimated from each level's badge cost.");
  }

  // Bonuses missing from the source: borrow the bonus name of the same research in another badge tree.
  for (const n of nodes) {
    if (n.effects.length) continue;
    const base = n.name.toLowerCase().replace(/armour/g, "armor");
    for (const other of built.values()) {
      if (other.meta.currency === "resources") continue;
      const twin = other.nodes.find((o) => o.effects.length && o.effects[0].values && o.name.toLowerCase().replace(/armour/g, "armor") === base);
      if (twin) {
        n.effects = twin.effects.map((e) => ({ label: e.label, unit: e.unit, values: null }));
        break;
      }
    }
  }
}

// ---------- artwork ----------

// Copies a tree's artwork into assets/trees/ after checking it is a WebP
// image, and returns the path the page loads it from.
function copyArt(treeId) {
  const file = join(RAW, "art", `${ART[treeId]}.webp`);
  const buf = readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${file} is not a WebP image`);
  }
  mkdirSync(ART_DIR, { recursive: true });
  writeFileSync(join(ART_DIR, `${treeId}.webp`), buf);
  return `assets/trees/${treeId}.webp`;
}

// ---------- ids, names, layout, output ----------

const treeNames = new Map([...built.values()].map((t) => [t.name, t.meta.id]));

function requirements(tree) {
  let lab = null;
  const trees = [];
  const conditions = [];
  for (const r of tree.reqs) {
    let m = r.match(/^Laboratory Lv\.?\s*(\d+)$/i);
    if (m) {
      lab = Number(m[1]);
      continue;
    }
    m = r.match(/^(.*\S)\s+(\d+)%$/);
    if (m && treeNames.has(m[1])) {
      trees.push({ id: treeNames.get(m[1]), pct: Number(m[2]) });
      continue;
    }
    conditions.push(r);
  }
  return { lab, trees, conditions };
}

const output = [];
for (const tree of built.values()) {
  const { meta, nodes } = tree;
  const counts = {};
  const keyToId = new Map();
  for (const n of nodes) {
    counts[n.name] = (counts[n.name] || 0) + 1;
    n.baseName = n.name;
    n.id = counts[n.name] > 1 ? `${slug(n.name)}-${counts[n.name]}` : slug(n.name);
    keyToId.set(n.key, n.id);
  }
  // Repeats get a number so requirements are unambiguous: "Wind Power (2)".
  const seen = {};
  for (const n of nodes) {
    seen[n.baseName] = (seen[n.baseName] || 0) + 1;
    if (counts[n.baseName] > 1 && seen[n.baseName] > 1) n.name = `${n.baseName} (${seen[n.baseName]})`;
  }
  // Rows: a node sits one row below its deepest requirement.
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const depth = (n) => (n.tier ??= n.parents.length ? 1 + Math.max(...n.parents.map((k) => depth(byKey.get(k)))) : 0);
  nodes.forEach(depth);

  const { lab, trees, conditions } = requirements(tree);
  const minLab = Math.min(...nodes.map((n) => n.lab ?? Infinity));
  const conditionNotes = conditions.map((c) => {
    const unpublished = UNPUBLISHED.find((u) => c.startsWith(u.name));
    return unpublished ? `${c} (not simulated: its research isn't published)` : `${c} (assumed met)`;
  });
  const order = nodes.map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.tier - b.n.tier || a.n.x - b.n.x || a.i - b.i)
    .map(({ n }) => n);

  output.push({
    id: meta.id,
    name: tree.name,
    currency: meta.currency || "badges",
    description: tree.description,
    art: copyArt(meta.id),
    sources: [...tree.sources].map((s) => SITES[s].name),
    lab: lab ?? (Number.isFinite(minLab) ? minLab : null),
    requires: trees,
    conditions: conditionNotes,
    notes: tree.notes,
    nodes: order.map((n) => ({
      id: n.id,
      name: n.name,
      tier: n.tier,
      maxLevel: n.maxLevel,
      parents: n.parents.map((k) => keyToId.get(k)),
      lab: n.lab ?? null,
      cost: n.cost,
      effects: n.effects,
      power: n.power,
      source: SITES[n.source].name,
      ...(n.estCost.length ? { estCost: n.estCost } : {}),
      ...(n.estPower ? { estPower: true } : {}),
      ...(n.estLinks ? { estLinks: true } : {}),
      ...(n.estLab ? { estLab: true } : {}),
    })),
  });

  const levels = sum(nodes.map((n) => n.maxLevel));
  const estLevels = sum(nodes.map((n) => n.estCost.length));
  report.push(`${meta.id}: ${nodes.length} nodes, ${levels} levels, ${estLevels} level costs estimated, from ${[...tree.sources].join("+")}`);
}

// Checks before writing.
for (const tree of output) {
  const ids = new Set(tree.nodes.map((n) => n.id));
  if (ids.size !== tree.nodes.length) throw new Error(`${tree.id}: duplicate node ids`);
  for (const n of tree.nodes) {
    for (const p of n.parents) if (!ids.has(p)) throw new Error(`${tree.id}.${n.id}: unknown parent ${p}`);
    for (const [r, vals] of Object.entries(n.cost)) {
      if (vals.length !== n.maxLevel || vals.some((v) => !Number.isFinite(v))) throw new Error(`${tree.id}.${n.id}: bad ${r} costs ${vals}`);
    }
    if (!n.power || n.power.length !== n.maxLevel) throw new Error(`${tree.id}.${n.id}: missing power`);
  }
}

const date = new Date().toISOString().slice(0, 10);
const lines = [
  "// GENERATED by scripts/build-research-data.mjs. Do not edit by hand:",
  "// run `npm run fetch-sources && npm run build-data` to rebuild it.",
  "//",
  "// Research trees from lastz.fandom.com, ztools.co.uk, gamides.com and lastz.gg.",
  "// Each tree's art is the game's Laboratory card artwork, copied into assets/trees/.",
  "// Per node: cost per level for each resource, bonuses (total at each level),",
  "// power (total at each level), parents (each must be maxed first), and the",
  "// Laboratory level it needs when the source gives one. estCost lists levels",
  "// whose cost is estimated; estPower, estLinks and estLab flag the rest.",
  "",
  `export const BUILT = ${JSON.stringify(date)};`,
  "",
  `export const SITES = ${JSON.stringify(Object.values(SITES), null, 2)};`,
  "",
  "// Tree artwork: the game's Laboratory card art, as served by ztools.co.uk.",
  `export const ART_SOURCE = ${JSON.stringify(SITES.ztools.name)};`,
  "",
  `export const UNPUBLISHED = ${JSON.stringify(UNPUBLISHED.map((u) => ({ ...u, art: copyArt(u.id) })), null, 2)};`,
  "",
  "export const TREES = [",
  ...output.map((t) => {
    const { nodes, ...head } = t;
    const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, "");
    return `${headJson.replace(/^/gm, "  ")},\n    "nodes": [\n${nodes.map((n) => `      ${JSON.stringify(n)},`).join("\n")}\n    ]\n  },`;
  }),
  "];",
  "",
];
writeFileSync(OUT, lines.join("\n"));
console.log(report.join("\n"));
console.log(`level curves learned for ${Object.keys(curves).sort((a, b) => a - b).join(", ")} levels`);
console.log(`wrote ${OUT}`);
