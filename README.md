# Last Z Research Simulator

A browser app that simulates how a Last Z: Survival Shooter account works through
the Laboratory research trees. Start from zero and choose every upgrade yourself,
or let the auto plan choose for you.

The trees are built from four community sources (see [Where the data comes
from](#where-the-data-comes-from)): 15 trees, 285 research, 2,410 levels, with
their real names, links, level counts, costs, bonuses and power.

**Start from zero** (the first tab) has two rule sets:

- **Free planning** (default): everything starts at level 0. Tap **+** on any
  research to upgrade it instantly, raise or lower your Laboratory level, and
  remove levels from a research's detail view. Prerequisites and Laboratory
  requirements still apply, so a removal that would break something you built
  is blocked with the reason. The page keeps a running total of resources
  spent, research time, power and every bonus you've earned.
- **Real time**: a timed game. Tap **+** to start research, pay its resources,
  then skip time ahead and spend speedups (details below).

**Saving**: your settings, your free plan and your real-time game save as you go.
On the published claude.ai page, signed in, they save to your own records for the
page, which nobody else can read (not even the page's owner) and which follow you
to any device; the header says "Saved to your account". Anywhere else (or signed
out) they save in the browser only. People you share the page with need
Contributor access to save their own; Viewers and Commenters save in their
browser only. Long games are stored compactly (a fully researched game is about
128 KB of the 256 KB each record allows).

**Auto plan** runs the whole schedule at once and shows:

- research power over time, with a marker for each tree you complete
- the day each tree finishes, or what blocks it (Laboratory level, an unfinished tree, prerequisites)
- a day-by-day replay of every node in every tree, with stock on hand
- a log of every research level finished, with its timer
- how much queue time is wasted waiting for resources or for unlocks

**Real time** gives you a Laboratory on day 1. You pick each research, skip time
ahead (1 hour, 8 hours, 1 day, or to the next finish), and decide when to spend
speedups. Nodes are marked Ready, Researching, Short on resources, Locked or
Maxed, and your power is compared with the auto plan at the same day.

**Resources needed**: every research card shows the Electricity, Zents or Research
Badges its next level costs, and each tree shows what's left to finish it. In Real
time, amounts you can't afford yet are underlined. Amounts marked ≈ are estimates
(see below).

**Research details**: tap any research in either mode to see its bonuses now and at
the next level, the requirements for the next level, the resources for the next
level next to what you have (and how much you're short), the total for all
remaining levels, a table of every level with its total bonus, cost per resource,
power, timer, what it unlocks and when it finished, and which source the numbers
came from.

No build step and no dependencies.

## Run it

ES modules don't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
# or
npm start
```

## Test

```sh
npm test
```

The tests check the data against the sources (New Home's first research, badge
totals per tree, tree requirements, which numbers are flagged as estimates), that
every research level was unlocked and affordable when it started, that resources
never go negative, that the run is deterministic, that a long run completes every
tree after the trees it needs, and that manual play (starting research, queue
limits, time skips, speedups, saving) behaves correctly.

## Where the data comes from

| Source | Used for |
|---|---|
| [lastz.fandom.com](https://lastz.fandom.com/wiki/Technologies) | New Home, Shelter Building and Shelter Manager: research, links, Laboratory levels, Electricity and Zents costs, bonuses, power |
| [ztools.co.uk](https://ztools.co.uk/tools/research/) | The badge trees: research, links, badge cost per level, bonuses, power, and each tree's unlock rule; the game's Laboratory card art for every tree (`assets/trees/`) |
| [lastz.gg](https://lastz.gg/basics/technologies) | Shooter, Assaulter and Rider Training (exact costs, bonuses and power per level); a level-by-level check of Unit Special Training |
| [gamides.com](https://gamides.com/research/) | Tree descriptions, and badge totals to cross-check ztools.co.uk |

Where the sources disagree, the one with level-by-level numbers wins, and the tree
card says what the other one claims. Each tree card lists its sources and any
notes; each research's detail view names its source.

The sources leave some numbers out. These are estimated and marked ≈ in the app:

- **Costs** for levels a source skips (Shelter Building lists only level 1; Shelter
  Manager lists a few levels; Army Building is missing 10 levels). In Last Z a
  research's cost grows level by level along the same curve for every research with
  the same number of levels (for 10 levels: ×1, 1.2, 1.4, 1.7, 2.0, 2.5, 3.1, 3.9,
  4.9, 6.0). The curves are learned from every fully published badge research and
  scaled from the levels that are published.
- **Shelter Manager's links**: fandom lists its research but not how they connect.
  Rows follow the power each research gives, and each row needs the row before it.
- **Power** for Field and Army Building, from each level's badge cost (fitted on the
  1,655 badge levels whose power is published, about ±16%). Their bonus names come
  from the same research in other badge trees; the amounts aren't published.
- **Laboratory levels** for Assaulter and Rider Training research follow Shooter
  Training, which lastz.gg lays out the same way.
- **Research timers**: no source publishes them. A level's timer is 0.08 minutes
  per point of power it adds (`TIMER` in `src/data.js`).

Elite Troops and Rapid Growth are in the game, but none of the sources lists their
research, so they aren't simulated. Military Strategies needs Elite Troops finished;
the app shows that requirement but treats it as met. "Join an Alliance" and "HQ Lv
24" are treated as met too.

### Rebuild the data

```sh
npm run fetch-sources   # downloads the four sources into sources/raw/
npm run build-data      # parses them into src/research-data.js and copies the tree art
```

The build parses the pages and the sites' JavaScript data as plain data (nothing
from them is executed), merges them, fills the gaps above and checks every node
before writing. `npm test` then checks the result.

## How the simulation works

- **Trees and research** come from `src/research-data.js`. A research's next level
  needs every research it links from at max level (the rule ztools.co.uk's tree
  view uses), its Laboratory level, and its tree's unlock rule: a Laboratory level
  and other trees researched to a percentage of their levels (for example, Alliance
  Recognition needs Laboratory Lv 10 and New Home at 50%).
- **Costs** are per level: Electricity and Zents for New Home, Shelter Building and
  Shelter Manager; Research Badges for the badge trees.
- **Research speed** is your base bonus plus every Research Speed bonus researched so
  far (Advanced Mathematics and Parallel Work). A timer is
  `base time / (1 + speed%)`, then alliance helps and daily speedups shorten it.
- **Power** is the power each level adds, as published.
- **Choosing research**: when a queue is free, the simulator starts the best
  affordable, unlocked research by your chosen rule: your tree order, shortest timer,
  or rotating between trees.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `src/research-data.js` | The research trees, generated from the four sources (don't edit by hand) |
| `assets/trees/` | Each tree's in-game Laboratory card art, copied from ztools.co.uk by the build |
| `src/data.js` | Timer estimate and default settings |
| `src/sim.js` | Engine: the `Lab` game state and the `simulate()` auto plan (no DOM) |
| `src/app.js` | UI: settings, free planning, real-time play, auto plan, chart, tree map, research details |
| `scripts/fetch-sources.sh` | Downloads the four sources into `sources/raw/` |
| `scripts/build-research-data.mjs` | Builds `src/research-data.js` from them |
| `tests/sim.test.js` | Data and simulator tests (`node --test`) |
