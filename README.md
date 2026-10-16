# Last Z Research Simulator

A browser app that simulates how a Last Z: Survival Shooter account works through
the Laboratory research trees. Start from zero and choose every upgrade yourself,
or let the auto plan choose for you.

**Start from zero** (the first tab) has two rule sets:

- **Free planning** (default): everything starts at level 0. Tap **+** on any
  research to upgrade it instantly, raise or lower your Laboratory level, and
  remove levels from a research's detail view. Prerequisites and Laboratory
  requirements still apply, so a removal that would break something you built
  is blocked with the reason. The page keeps a running total of resources
  spent, research time, power and every bonus you've earned.
- **Real time**: a timed game. Tap **+** to start research, pay its resources,
  then skip time ahead and spend speedups (details below).

Your plan and your game are saved in the browser, so they survive a reload.

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

**Resources needed**: every research card shows the food, wood, steel and Research
Badges its next level costs, and each tree shows what's left to finish it. In Real
time, amounts you can't afford yet are underlined.

**Research details**: tap any research in either mode to see its description,
what each level adds, the requirements for the next level, the resources for the
next level next to what you have (and how much you're short), the total for all
remaining levels, and a table of every level with its total bonus, cost per
resource, timer, what it unlocks, and when it finished.

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

The tests check that every research level was unlocked and affordable when it
started, that resources never go negative, that the run is deterministic, that a
long run completes every tree in dependency order, and that manual play
(starting research, queue limits, time skips, speedups, saving) behaves correctly.

## How the simulation works

- **Trees and nodes** are defined in `src/data.js`, each with a description. A node in tier *t* needs every
  node in tier *t−1* at half its max level or higher. Each tier also needs a higher
  Laboratory level. Some trees need other trees finished first (for example, Shooter,
  Assaulter and Rider Training need Field Research).
- **Costs and timers** grow per tier and per level (`SCALING` in `src/data.js`).
  Resource trees cost food, wood and steel. Combat trees cost Research Badges.
- **Research speed** is your base bonus plus every research-speed node finished so far.
  A timer is `base time / (1 + speed%)`, then alliance helps and daily speedups
  shorten it.
- **Choosing research**: when a queue is free, the simulator starts the best
  affordable, unlocked research by your chosen rule: your tree order, shortest timer,
  or rotating between trees.

## The numbers are estimates

Tree names follow the in-game Laboratory, but Last Z doesn't publish exact costs,
timers or stat values. Everything numeric in `src/data.js` is an estimate meant to be
tuned. Change the settings in the app to match your account, or edit the data file
to reshape the trees.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `src/data.js` | Research trees, scaling, default settings |
| `src/sim.js` | Engine: the `Lab` game state and the `simulate()` auto plan (no DOM) |
| `src/app.js` | UI: settings, free planning, real-time play, auto plan, chart, tree map, research details |
| `tests/sim.test.js` | Simulator tests (`node --test`) |

## Lemonade Tycoon

A second game in this repo, in `lemonade/`: run a lemonade stand for a 30-day
summer. Serve the folder as above and open http://localhost:8000/lemonade/.

Each morning you:

- check the forecast (it's usually right, give or take a few degrees)
- pick where to set up: Maple Street is free; Riverside Park, Downtown and the
  Boardwalk unlock as your reputation grows, and charge rent
- set the recipe (lemons and sugar per pitcher, ice per cup) and the price
- buy lemons, sugar, paper cups and ice. Lemon and sugar prices move day to day,
  bigger packs are cheaper per unit, and ice melts overnight
- choose today's advertising and buy upgrades (a sign, a cooler, an umbrella, a
  lemon press, a helper, a neon sign)

Then open the stand and watch the day play out on the street. Every customer
either walks past, balks at the price, gives up on a long line, finds you sold
out, or buys a cup and says what they think of it ("Too sour!", "Not cold
enough"). Happy customers raise your reputation, which brings more people and
lets you charge more. The day ends with a till receipt and a bar on the profit
chart. After day 30 you get a rank based on your cash, and you can keep selling.

The game saves in the browser. The engine (`lemonade/game.js`) has no DOM and is
seeded per day, so the same choices on the same day always give the same result;
`tests/lemonade.test.js` checks the books balance, stock never goes negative,
higher prices sell fewer cups, reputation and unlocks work, upgrades do what
they say, and a sensible player profits over a season.

| File | Purpose |
|---|---|
| `lemonade/index.html` | Page layout and styles |
| `lemonade/game.js` | Engine: supplies, weather, customers, reputation, the day simulation (no DOM) |
| `lemonade/app.js` | UI: morning prep, the animated street scene, receipt and profit chart |
| `tests/lemonade.test.js` | Engine tests (`node --test`) |
