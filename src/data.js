// Research trees for the Last Z research simulator.
//
// Tree names and structure follow the in-game Laboratory (resource trees,
// badge trees, and the troop-training trees that unlock after Field Research).
// Exact in-game costs and timers are not published, so every number here is an
// ESTIMATE meant to be tuned. Edit freely: the simulator reads only this file.
//
// Per tree:
//   currency   "resources" (food/wood/steel) or "badges" (Research Badges)
//   unlockLab  Laboratory level needed for tier 0
//   labStep    extra Laboratory levels needed per tier
//   requires   tree ids that must be fully complete first
//   baseCost   cost of tier 0, level 1 (minutes for time)
//   tiers      list of tiers; each node is [name, stat, perLevel, maxLevel]
//
// A node in tier t needs every node in tier t-1 at half its max level (rounded
// up) or higher.

export const STATS = {
  researchSpeed: { label: "Research speed", unit: "%" },
  gathering: { label: "Gathering speed", unit: "%" },
  production: { label: "Resource production", unit: "%" },
  buildSpeed: { label: "Construction speed", unit: "%" },
  troopAttack: { label: "Troop attack", unit: "%" },
  troopDefense: { label: "Troop defense", unit: "%" },
  troopHp: { label: "Troop HP", unit: "%" },
  heroXp: { label: "Hero XP", unit: "%" },
  marchSize: { label: "March size", unit: "" },
  healSpeed: { label: "Healing speed", unit: "%" },
};

export const TREES = [
  {
    id: "newHome",
    name: "New Home",
    currency: "resources",
    unlockLab: 1,
    labStep: 1,
    requires: [],
    baseCost: { food: 1200, wood: 1200, steel: 0, badges: 0, time: 3 },
    tiers: [
      [["Basic Research", "researchSpeed", 1, 5]],
      [["Farming", "production", 2, 5], ["Lumbering", "production", 2, 5]],
      [["Scavenging", "gathering", 2, 5], ["Quick Build", "buildSpeed", 1.5, 5]],
      [["Advanced Research", "researchSpeed", 1.5, 5]],
    ],
  },
  {
    id: "shelterBuilding",
    name: "Shelter Building",
    currency: "resources",
    unlockLab: 4,
    labStep: 1,
    requires: [],
    baseCost: { food: 6000, wood: 6000, steel: 2000, badges: 0, time: 20 },
    tiers: [
      [["Blueprints", "buildSpeed", 1, 10]],
      [["Steel Smelting", "production", 1.5, 10], ["Reinforced Walls", "troopDefense", 0.5, 10]],
      [["Efficient Crews", "buildSpeed", 1.5, 10]],
      [["Lab Expansion", "researchSpeed", 1, 10], ["Field Hospital", "healSpeed", 2, 10]],
    ],
  },
  {
    id: "hqManagement",
    name: "HQ Management",
    currency: "resources",
    unlockLab: 8,
    labStep: 1,
    requires: ["newHome"],
    baseCost: { food: 20000, wood: 20000, steel: 8000, badges: 0, time: 45 },
    tiers: [
      [["Logistics", "gathering", 1.5, 10]],
      [["Supply Lines", "production", 1.5, 10], ["Rally Command", "marchSize", 50, 10]],
      [["Bureaucracy", "buildSpeed", 1, 10], ["Think Tank", "researchSpeed", 1, 10]],
    ],
  },
  {
    id: "rapidGrowth",
    name: "Rapid Growth",
    currency: "resources",
    unlockLab: 12,
    labStep: 1,
    requires: ["shelterBuilding"],
    baseCost: { food: 60000, wood: 60000, steel: 25000, badges: 0, time: 90 },
    tiers: [
      [["Fast Tracks", "buildSpeed", 1.5, 10]],
      [["Bumper Harvest", "production", 2, 10], ["Deep Mining", "gathering", 2, 10]],
      [["Overtime", "researchSpeed", 1.5, 10]],
    ],
  },
  {
    id: "peaceShield",
    name: "Peace Shield",
    currency: "resources",
    unlockLab: 14,
    labStep: 1,
    requires: [],
    baseCost: { food: 50000, wood: 50000, steel: 30000, badges: 0, time: 80 },
    tiers: [
      [["Barricades", "troopDefense", 1, 10]],
      [["Triage", "healSpeed", 2, 10], ["Sentries", "troopHp", 1, 10]],
      [["Fortress", "troopDefense", 1.5, 10]],
    ],
  },
  {
    id: "fieldResearch",
    name: "Field Research",
    currency: "resources",
    unlockLab: 16,
    labStep: 2,
    requires: ["hqManagement"],
    baseCost: { food: 150000, wood: 150000, steel: 80000, badges: 0, time: 180 },
    tiers: [
      [["Field Kits", "troopHp", 1, 10]],
      [["Scouting", "gathering", 1.5, 10], ["Marksmanship", "troopAttack", 1, 10]],
      [["Armor Plating", "troopDefense", 1, 10], ["Mobile Labs", "researchSpeed", 1, 10]],
      [["Combat Medics", "healSpeed", 2, 10], ["Supply Drops", "production", 2, 10]],
      [["Veteran Units", "troopAttack", 1.5, 10]],
    ],
  },
  {
    id: "eliteTroops",
    name: "Elite Troops",
    currency: "badges",
    unlockLab: 10,
    labStep: 1,
    requires: [],
    baseCost: { food: 0, wood: 0, steel: 10000, badges: 20, time: 60 },
    tiers: [
      [["Drill", "troopAttack", 0.5, 10]],
      [["Body Armor", "troopDefense", 0.5, 10], ["Rations", "troopHp", 0.5, 10]],
      [["Elite Squads", "marchSize", 100, 10]],
    ],
  },
  {
    id: "heroTraining",
    name: "Hero Training",
    currency: "badges",
    unlockLab: 12,
    labStep: 1,
    requires: [],
    baseCost: { food: 0, wood: 0, steel: 12000, badges: 25, time: 70 },
    tiers: [
      [["Sparring", "heroXp", 2, 10]],
      [["Tactics", "troopAttack", 0.5, 10], ["Endurance", "troopHp", 0.5, 10]],
      [["Leadership", "marchSize", 100, 10]],
    ],
  },
  {
    id: "militaryStrategies",
    name: "Military Strategies",
    currency: "badges",
    unlockLab: 15,
    labStep: 1,
    requires: ["eliteTroops"],
    baseCost: { food: 0, wood: 0, steel: 25000, badges: 40, time: 120 },
    tiers: [
      [["Flanking", "troopAttack", 1, 10]],
      [["Entrenchment", "troopDefense", 1, 10], ["Rapid Deploy", "marchSize", 150, 10]],
      [["Blitz", "troopAttack", 1.5, 10]],
    ],
  },
  {
    id: "shooterTraining",
    name: "Shooter Training",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Steady Aim", "troopAttack", 1, 10]],
      [["Long Barrels", "troopAttack", 1, 10], ["Cover Fire", "troopDefense", 1, 10]],
      [["Sharpshooters", "troopAttack", 2, 10]],
    ],
  },
  {
    id: "assaulterTraining",
    name: "Assaulter Training",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Breaching", "troopAttack", 1, 10]],
      [["Heavy Armor", "troopDefense", 1, 10], ["Adrenaline", "troopHp", 1, 10]],
      [["Shock Troops", "troopHp", 2, 10]],
    ],
  },
  {
    id: "riderTraining",
    name: "Rider Training",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Off-Road", "troopHp", 1, 10]],
      [["Ram Plates", "troopDefense", 1, 10], ["Nitro", "troopAttack", 1, 10]],
      [["Road Warriors", "troopDefense", 2, 10]],
    ],
  },
];

// Scaling applied to baseCost.
export const SCALING = {
  tierCost: 1.8, // multiplier per tier
  levelCost: 1.22, // multiplier per level within a node
  tierTime: 1.6,
  levelTime: 1.18,
  powerPerLevel: 120, // power gained per level, times (tier + 1)
};

export const DEFAULT_CONFIG = {
  days: 120,
  labStartLevel: 1,
  labMaxLevel: 30,
  hoursPerLabLevel: 48, // how fast your Laboratory gets upgraded
  queues: 1,
  secondQueueDay: 7, // day the second Laboratory queue opens (0 = never)
  baseResearchSpeed: 0, // % from VIP, heroes, skins, etc.
  income: { food: 900000, wood: 900000, steel: 600000, badges: 200 }, // per day
  startingStock: { food: 500000, wood: 500000, steel: 150000, badges: 50 },
  speedupMinutesPerDay: 240,
  allianceHelps: 10, // helps per research
  helpMinutes: 1, // each help removes this many minutes, or 1% of the timer if larger
  strategy: "priority", // "priority" | "fastest" | "roundRobin"
  priority: TREES.map((t) => t.id),
};
