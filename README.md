# Last Z Research Simulator

A browser app that simulates how a Last Z: Survival Shooter account works through
the Laboratory research trees over time. You set your Laboratory level, research
queues, daily income, speedups and alliance helps. The simulator runs your
research queue minute by minute and shows:

- research power over time, with a marker for each tree you complete
- the day each tree finishes, or what blocks it (Laboratory level, an unfinished tree, prerequisites)
- a day-by-day replay of every node in every tree, with stock on hand
- a log of every research level finished, with its timer
- how much queue time is wasted waiting for resources or for unlocks

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
started, that resources never go negative, that the run is deterministic, and
that a long run completes every tree in dependency order.

## How the simulation works

- **Trees and nodes** are defined in `src/data.js`. A node in tier *t* needs every
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
| `src/sim.js` | Simulation engine (pure functions, no DOM) |
| `src/app.js` | UI: settings, chart, tree map, log |
| `tests/sim.test.js` | Simulator tests (`node --test`) |
