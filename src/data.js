// Research trees for the Last Z research simulator.
//
// Tree names and structure follow the in-game Laboratory (resource trees,
// badge trees, and the troop-training trees that unlock after Field Research).
// Exact in-game costs and timers are not published, so every number here is an
// ESTIMATE meant to be tuned. Edit freely: the simulator reads only this file.
//
// Per tree:
//   description  one or two sentences shown on the tree card
//   currency     "resources" (food/wood/steel) or "badges" (Research Badges)
//   unlockLab    Laboratory level needed for tier 0
//   labStep      extra Laboratory levels needed per tier
//   requires     tree ids that must be fully complete first
//   baseCost     cost of tier 0, level 1 (minutes for time)
//   tiers        list of tiers; each node is
//                [name, stat, perLevel, maxLevel, description]
//
// A node in tier t needs every node in tier t-1 at half its max level (rounded
// up) or higher.

// Only researchSpeed changes the simulation. The other stats are shown so each
// research says what it would do in the game.
export const STATS = {
  researchSpeed: { label: "Research speed", unit: "%", desc: "Shortens every research timer you start afterwards." },
  gathering: { label: "Gathering speed", unit: "%", desc: "Marches gather resources on the map faster." },
  production: { label: "Resource production", unit: "%", desc: "Farms, sawmills and steel works in your base produce more per hour." },
  buildSpeed: { label: "Construction speed", unit: "%", desc: "Building upgrades finish sooner." },
  troopAttack: { label: "Troop attack", unit: "%", desc: "All troop types deal more damage." },
  troopDefense: { label: "Troop defense", unit: "%", desc: "All troop types take less damage." },
  troopHp: { label: "Troop HP", unit: "%", desc: "All troop types can take more hits." },
  heroXp: { label: "Hero XP", unit: "%", desc: "Heroes level up faster." },
  marchSize: { label: "March size", unit: " troops", desc: "Each march carries more troops." },
  healSpeed: { label: "Healing speed", unit: "%", desc: "Wounded troops return to duty sooner." },
  shooterAttack: { label: "Shooter attack", unit: "%", desc: "Shooter troops deal more damage." },
  shooterDefense: { label: "Shooter defense", unit: "%", desc: "Shooter troops take less damage." },
  assaulterAttack: { label: "Assaulter attack", unit: "%", desc: "Assaulter troops deal more damage." },
  assaulterDefense: { label: "Assaulter defense", unit: "%", desc: "Assaulter troops take less damage." },
  assaulterHp: { label: "Assaulter HP", unit: "%", desc: "Assaulter troops can take more hits." },
  riderAttack: { label: "Rider attack", unit: "%", desc: "Rider troops deal more damage." },
  riderDefense: { label: "Rider defense", unit: "%", desc: "Rider troops take less damage." },
  riderHp: { label: "Rider HP", unit: "%", desc: "Rider troops can take more hits." },
};

export const TREES = [
  {
    id: "newHome",
    name: "New Home",
    description: "The first projects of a new shelter. Cheap, quick research, and its research-speed nodes make everything after it faster.",
    currency: "resources",
    unlockLab: 1,
    labStep: 1,
    requires: [],
    baseCost: { food: 1200, wood: 1200, steel: 0, badges: 0, time: 3 },
    tiers: [
      [["Basic Research", "researchSpeed", 1, 5, "Sort salvaged notes and equipment into a working lab."]],
      [
        ["Farming", "production", 2, 5, "Rooftop gardens and greenhouses keep the shelter fed."],
        ["Lumbering", "production", 2, 5, "Better saws for scavenged timber."],
      ],
      [
        ["Scavenging", "gathering", 2, 5, "Gatherers learn which ruins are worth searching."],
        ["Quick Build", "buildSpeed", 1.5, 5, "Materials are pre-cut before construction starts."],
      ],
      [["Advanced Research", "researchSpeed", 1.5, 5, "A proper lab bench with reagents and microscopes."]],
    ],
  },
  {
    id: "shelterBuilding",
    name: "Shelter Building",
    description: "Turns a camp into a fortified shelter: faster construction, more steel, stronger walls and a field hospital.",
    currency: "resources",
    unlockLab: 4,
    labStep: 1,
    requires: [],
    baseCost: { food: 6000, wood: 6000, steel: 2000, badges: 0, time: 20 },
    tiers: [
      [["Blueprints", "buildSpeed", 1, 10, "Standard plans for every structure in the base."]],
      [
        ["Steel Smelting", "production", 1.5, 10, "A furnace that melts down wrecked cars."],
        ["Reinforced Walls", "troopDefense", 0.5, 10, "Scrap-steel plating on every wall."],
      ],
      [["Efficient Crews", "buildSpeed", 1.5, 10, "Builders work in organized shifts."]],
      [
        ["Lab Expansion", "researchSpeed", 1, 10, "More benches and more researchers."],
        ["Field Hospital", "healSpeed", 2, 10, "Beds and medics right by the front gate."],
      ],
    ],
  },
  {
    id: "hqManagement",
    name: "HQ Management",
    description: "Logistics and command for a growing base. Needs New Home finished.",
    currency: "resources",
    unlockLab: 8,
    labStep: 1,
    requires: ["newHome"],
    baseCost: { food: 20000, wood: 20000, steel: 8000, badges: 0, time: 45 },
    tiers: [
      [["Logistics", "gathering", 1.5, 10, "Gathering routes planned around infected zones."]],
      [
        ["Supply Lines", "production", 1.5, 10, "Steady convoys between your outposts."],
        ["Rally Command", "marchSize", 50, 10, "Officers trained to lead joint attacks."],
      ],
      [
        ["Bureaucracy", "buildSpeed", 1, 10, "Permits and materials come through faster."],
        ["Think Tank", "researchSpeed", 1, 10, "Your best minds work on problems together."],
      ],
    ],
  },
  {
    id: "rapidGrowth",
    name: "Rapid Growth",
    description: "Late economy research that pushes production and construction further. Needs Shelter Building finished.",
    currency: "resources",
    unlockLab: 12,
    labStep: 1,
    requires: ["shelterBuilding"],
    baseCost: { food: 60000, wood: 60000, steel: 25000, badges: 0, time: 90 },
    tiers: [
      [["Fast Tracks", "buildSpeed", 1.5, 10, "Rails and carts move building materials around the base."]],
      [
        ["Bumper Harvest", "production", 2, 10, "Fertilizer made from salvaged chemicals."],
        ["Deep Mining", "gathering", 2, 10, "Reach resource seams no one else can."],
      ],
      [["Overtime", "researchSpeed", 1.5, 10, "Researchers work through the night."]],
    ],
  },
  {
    id: "peaceShield",
    name: "Peace Shield",
    description: "Defensive research that keeps your base standing and your wounded alive.",
    currency: "resources",
    unlockLab: 14,
    labStep: 1,
    requires: [],
    baseCost: { food: 50000, wood: 50000, steel: 30000, badges: 0, time: 80 },
    tiers: [
      [["Barricades", "troopDefense", 1, 10, "Layers of wrecked cars and concrete at every approach."]],
      [
        ["Triage", "healSpeed", 2, 10, "Medics treat the most urgent wounds first."],
        ["Sentries", "troopHp", 1, 10, "Lookouts spot attacks before they land."],
      ],
      [["Fortress", "troopDefense", 1.5, 10, "The whole base becomes a stronghold."]],
    ],
  },
  {
    id: "fieldResearch",
    name: "Field Research",
    description: "The largest resource tree, with field-tested gear for every troop. Finishing it opens Shooter, Assaulter and Rider Training. Needs HQ Management finished.",
    currency: "resources",
    unlockLab: 16,
    labStep: 2,
    requires: ["hqManagement"],
    baseCost: { food: 150000, wood: 150000, steel: 80000, badges: 0, time: 180 },
    tiers: [
      [["Field Kits", "troopHp", 1, 10, "First-aid and repair kits for every squad."]],
      [
        ["Scouting", "gathering", 1.5, 10, "Maps of safe paths through the wasteland."],
        ["Marksmanship", "troopAttack", 1, 10, "Live-fire practice on the range."],
      ],
      [
        ["Armor Plating", "troopDefense", 1, 10, "Steel plates bolted to vests and vehicles."],
        ["Mobile Labs", "researchSpeed", 1, 10, "Research vans that test gear in the field."],
      ],
      [
        ["Combat Medics", "healSpeed", 2, 10, "Medics who march with the troops."],
        ["Supply Drops", "production", 2, 10, "Air-dropped crates for forward bases."],
      ],
      [["Veteran Units", "troopAttack", 1.5, 10, "Veterans train every new recruit."]],
    ],
  },
  {
    id: "eliteTroops",
    name: "Elite Troops",
    description: "Badge research that hardens every soldier: attack, defense, HP and bigger marches.",
    currency: "badges",
    unlockLab: 10,
    labStep: 1,
    requires: [],
    baseCost: { food: 0, wood: 0, steel: 10000, badges: 20, time: 60 },
    tiers: [
      [["Drill", "troopAttack", 0.5, 10, "Daily drills until every move is automatic."]],
      [
        ["Body Armor", "troopDefense", 0.5, 10, "Real armor instead of padded jackets."],
        ["Rations", "troopHp", 0.5, 10, "Calorie-dense rations for long fights."],
      ],
      [["Elite Squads", "marchSize", 100, 10, "The best fighters grouped into one squad."]],
    ],
  },
  {
    id: "heroTraining",
    name: "Hero Training",
    description: "Badge research for your heroes and the troops they lead.",
    currency: "badges",
    unlockLab: 12,
    labStep: 1,
    requires: [],
    baseCost: { food: 0, wood: 0, steel: 12000, badges: 25, time: 70 },
    tiers: [
      [["Sparring", "heroXp", 2, 10, "Heroes spar with each other between missions."]],
      [
        ["Tactics", "troopAttack", 0.5, 10, "Heroes study old battle plans."],
        ["Endurance", "troopHp", 0.5, 10, "Long runs in full gear."],
      ],
      [["Leadership", "marchSize", 100, 10, "Heroes command more troops at once."]],
    ],
  },
  {
    id: "militaryStrategies",
    name: "Military Strategies",
    description: "Advanced badge research for attacking. Needs Elite Troops finished.",
    currency: "badges",
    unlockLab: 15,
    labStep: 1,
    requires: ["eliteTroops"],
    baseCost: { food: 0, wood: 0, steel: 25000, badges: 40, time: 120 },
    tiers: [
      [["Flanking", "troopAttack", 1, 10, "Hit the enemy from the side."]],
      [
        ["Entrenchment", "troopDefense", 1, 10, "Dig in and hold the line."],
        ["Rapid Deploy", "marchSize", 150, 10, "Trucks loaded and rolling in minutes."],
      ],
      [["Blitz", "troopAttack", 1.5, 10, "Strike hard before the enemy can react."]],
    ],
  },
  {
    id: "shooterTraining",
    name: "Shooter Training",
    description: "Specialist badge research for Shooter troops. Unlocks after Field Research.",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Steady Aim", "shooterAttack", 1, 10, "Breathing and trigger control drills."]],
      [
        ["Long Barrels", "shooterAttack", 1, 10, "Longer barrels for more range and punch."],
        ["Cover Fire", "shooterDefense", 1, 10, "Shooters cover each other while moving."],
      ],
      [["Sharpshooters", "shooterAttack", 2, 10, "The best shots get scoped rifles."]],
    ],
  },
  {
    id: "assaulterTraining",
    name: "Assaulter Training",
    description: "Specialist badge research for Assaulter troops. Unlocks after Field Research.",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Breaching", "assaulterAttack", 1, 10, "Charges and rams for getting through doors."]],
      [
        ["Heavy Armor", "assaulterDefense", 1, 10, "Riot plates for the front line."],
        ["Adrenaline", "assaulterHp", 1, 10, "Stims that keep assaulters on their feet."],
      ],
      [["Shock Troops", "assaulterHp", 2, 10, "Assaulters trained to absorb the first wave."]],
    ],
  },
  {
    id: "riderTraining",
    name: "Rider Training",
    description: "Specialist badge research for Rider troops. Unlocks after Field Research.",
    currency: "badges",
    unlockLab: 20,
    labStep: 1,
    requires: ["fieldResearch"],
    baseCost: { food: 0, wood: 0, steel: 60000, badges: 80, time: 240 },
    tiers: [
      [["Off-Road", "riderHp", 1, 10, "Suspension built for broken roads."]],
      [
        ["Ram Plates", "riderDefense", 1, 10, "Steel plows welded to every bumper."],
        ["Nitro", "riderAttack", 1, 10, "A burst of speed into the enemy line."],
      ],
      [["Road Warriors", "riderDefense", 2, 10, "Riders who can hold a road against a horde."]],
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
