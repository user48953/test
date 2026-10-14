// Research trees and default settings for the Last Z research simulator.
//
// The trees come from four community sources (lastz.fandom.com, ztools.co.uk,
// gamides.com and lastz.gg) and are generated into research-data.js by
// scripts/build-research-data.mjs. Every tree, research name, link, level
// count, bonus and power number is taken from them; costs a source leaves out
// are estimated from the costs it does publish and flagged as estimates.
//
// This file holds what none of the sources publish: research timers, and
// default settings for the simulation.

import { TREES, SITES, UNPUBLISHED, BUILT, ART_SOURCE } from "./research-data.js";

export { TREES, SITES, UNPUBLISHED, BUILT, ART_SOURCE };

// Research timers aren't published. A level's base timer is estimated from the
// power it adds: 0.08 minutes per point of power. The first New Home research
// (+518 power) takes about 40 minutes; the largest badge levels (+61k power)
// take about 3.4 days, before research speed bonuses.
export const TIMER = { minutesPerPower: 0.08, minMinutes: 1 };

// The bonus that shortens timers. Every other bonus is shown, not simulated.
export const RESEARCH_SPEED = "Research Speed";

export const DEFAULT_CONFIG = {
  days: 365,
  labStartLevel: 1,
  labMaxLevel: 30,
  hoursPerLabLevel: 168, // how fast your Laboratory gets upgraded
  queues: 1,
  secondQueueDay: 30, // day Lab No. 2 opens, adding a queue (0 = never)
  baseResearchSpeed: 0, // % from VIP, heroes, skins, etc.
  income: { electricity: 8_000_000, zents: 3_000_000, badges: 3000 }, // per day
  startingStock: { electricity: 1_000_000, zents: 500_000, badges: 0 },
  speedupMinutesPerDay: 240,
  allianceHelps: 10, // helps per research
  helpMinutes: 1, // each help removes this many minutes, or 1% of the timer if larger
  strategy: "priority", // "priority" | "fastest" | "roundRobin"
  priority: TREES.map((t) => t.id),
};
