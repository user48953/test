// Lemonade Tycoon UI: morning prep, the day at the stand played out on the
// street scene, the till receipt and the season chart. Game rules live in
// game.js; this file only draws state and turns clicks into moves.

import * as G from "./game.js";

const SAVE_KEY = "lemonade-tycoon:v1";
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Real milliseconds for one day at 1× speed, and how long a customer takes
// to walk up, order and leave.
const DAY_MS = 18000;
const APPROACH = 1700;
const PAUSE = 1100;
const LEAVE = 1700;
const CROSS = 3800;

let state;
let selling = null; // the day being played out, while the stand is open
let notice = null; // { html, warn } shown above the prep cards
const drawn = {}; // keys of the parts drawn with innerHTML, so they redraw only on change

// ---------- saving ----------

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return s && s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage is blocked (private window, preview): the game still plays, it just won't survive a reload.
  }
}

const randomSeed = () => (Math.floor(Math.random() * 2 ** 32) ^ Date.now()) >>> 0;

// ---------- formatting ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cents = (c) => (c < 100 ? `${c}¢` : G.money(c));
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const SUPPLY_WORDS = { lemons: "lemons", sugar: "sugar", cups: "paper cups", ice: "ice" };

// Day 1 is the first day of summer.
function dateLabel(day) {
  return new Date(Date.UTC(2027, 5, 20 + day)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function forecastNote({ temp, cond }) {
  if (cond === "storm") return "Thunderstorms. Most people will stay indoors.";
  if (cond === "rain") return "Rain on the way. Expect a thin crowd.";
  const thirst = G.thirstFor({ temp, cond });
  if (thirst >= 1) return "A scorcher. People will pay well for a cold drink.";
  if (thirst >= 0.75) return "Hot and bright. A great day to sell.";
  if (thirst >= 0.5) return "Warm enough for steady trade.";
  return "Cool out. Lemonade will be a harder sell.";
}

// ---------- artwork ----------

const CLOUD = "M16 50h30a11 11 0 0 0 1-22 15 15 0 0 0-28-3 12 12 0 0 0-3 25z";
const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const p = (r) => `${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`;
  return `M${p(19)}L${p(27)}`;
}).join("");

const WX_ICONS = {
  sunny: `<g stroke="var(--lemon)" stroke-width="4" stroke-linecap="round"><path d="${SUN_RAYS}"/></g>
    <circle cx="32" cy="32" r="13" fill="var(--lemon)" stroke="var(--ink)" stroke-width="2"/>`,
  partly: `<g transform="translate(10 -8) scale(.7)"><g stroke="var(--lemon)" stroke-width="5" stroke-linecap="round"><path d="${SUN_RAYS}"/></g>
    <circle cx="32" cy="32" r="13" fill="var(--lemon)" stroke="var(--ink)" stroke-width="2.6"/></g>
    <path d="${CLOUD}" transform="translate(-4 4)" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`,
  cloudy: `<path d="${CLOUD}" transform="translate(8 -8) scale(.85)" fill="var(--line)" stroke="var(--ink)" stroke-width="2"/>
    <path d="${CLOUD}" transform="translate(-4 2)" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`,
  rain: `<path d="${CLOUD}" transform="translate(0 -8)" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>
    <g stroke="var(--muted)" stroke-width="3" stroke-linecap="round"><path d="M22 48l-3 8M32 48l-3 8M42 48l-3 8"/></g>`,
  storm: `<path d="${CLOUD}" transform="translate(0 -8)" fill="var(--line)" stroke="var(--ink)" stroke-width="2"/>
    <path d="M33 40l-8 12h7l-4 10 12-15h-7l4-7z" fill="var(--lemon)" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>`,
};

const GLYPHS = {
  lemons: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 13c0-5 5-8 10-8s10 3 10 8-5 8-10 8S3 18 3 13z" fill="var(--lemon)" stroke="var(--ink)" stroke-width="1.5"/>
    <path d="M17 6c2-3 5-3 6-2-1 2-3 3-6 2z" fill="#5fae48" stroke="var(--ink)" stroke-width="1.2"/></svg>`,
  sugar: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M13 3l9 5v10l-9 5-9-5V8z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 8l9 5 9-5M13 13v10" fill="none" stroke="var(--ink)" stroke-width="1.2"/></svg>`,
  cups: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M5 5h16l-2.5 17h-11z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M6.2 11h13.6l-.6 4H6.8z" fill="var(--lemon)"/></svg>`,
  ice: `<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="4" y="4" width="18" height="18" rx="4" fill="#cfeaf7" stroke="var(--ink)" stroke-width="1.5"/>
    <path d="M8 9c1-1.5 3-2 5-2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>`,
};

const STAND = `<svg viewBox="0 0 200 190" aria-hidden="true">
  <defs>
    <pattern id="awning-stripes" width="24" height="10" patternUnits="userSpaceOnUse">
      <rect width="12" height="10" fill="#f5c400"/><rect x="12" width="12" height="10" fill="#fffaf0"/>
    </pattern>
  </defs>
  <rect x="22" y="40" width="8" height="112" fill="#9c6a3a"/>
  <rect x="170" y="40" width="8" height="112" fill="#9c6a3a"/>
  <rect x="82" y="96" width="36" height="26" rx="11" fill="#2e86ab"/>
  <circle cx="100" cy="84" r="12.5" fill="#e0ac85"/>
  <path d="M87 80c2-10 7-13 13-13s11 3 13 13c-5-4-9-5-13-5s-8 1-13 5z" fill="#3b2a1a"/>
  <path d="M12 20h176l10 26H2z" fill="url(#awning-stripes)" stroke="#2b2513" stroke-width="2" stroke-linejoin="round"/>
  <g stroke="#2b2513" stroke-width="2">
    ${Array.from({ length: 17 }, (_, i) => `<path d="M${2 + i * 11.75} 46a5.9 6 0 0 0 11.75 0" fill="${i % 2 ? "#fffaf0" : "#f5c400"}"/>`).join("")}
  </g>
  <line x1="40" y1="52" x2="40" y2="60" stroke="#2b2513" stroke-width="1.5"/>
  <rect x="22" y="60" width="36" height="20" rx="4" fill="#f5c400" stroke="#2b2513" stroke-width="2"/>
  <text id="stand-price" x="40" y="75" text-anchor="middle" font-size="13" class="tag-text" fill="#2b2513">50¢</text>
  <line x1="160" y1="52" x2="160" y2="60" stroke="#2b2513" stroke-width="1.5"/>
  <rect x="136" y="60" width="48" height="17" rx="3" fill="#ffffff" stroke="#2b2513" stroke-width="1.5"/>
  <text id="stand-open" x="160" y="72.5" text-anchor="middle" font-size="9.5" letter-spacing=".08em" class="tag-text" fill="#b23a1e">CLOSED</text>
  <path d="M40 113l2-24h18l2 24z" fill="#ffffff" fill-opacity=".6" stroke="#2b2513" stroke-width="1.5"/>
  <path id="pitcher-juice" d="M41.6 113l1.3-15h16.2l1.3 15z" fill="#f7d84a"/>
  <path d="M62 94c6 0 6 12 0 12" fill="none" stroke="#2b2513" stroke-width="1.5"/>
  <path d="M136 113l-1.6-12h11.2l-1.6 12zM150 113l-1.6-12h11.2l-1.6 12z" fill="#fff6c8" stroke="#2b2513" stroke-width="1.2"/>
  <rect x="12" y="112" width="176" height="10" rx="2" fill="#b7793d" stroke="#2b2513" stroke-width="2"/>
  <rect x="18" y="122" width="164" height="66" fill="#d39a5b" stroke="#2b2513" stroke-width="2"/>
  <path d="M18 144h164M18 166h164" stroke="#b7793d" stroke-width="2"/>
  <rect x="34" y="128" width="132" height="36" rx="4" fill="#fff6d6" stroke="#2b2513" stroke-width="2"/>
  <text x="100" y="153" text-anchor="middle" font-size="22" class="sign-text" fill="#d9472b">Lemonade</text>
</svg>`;

const house = (x, wall, roof) => `<g transform="translate(${x} 0)">
  <rect x="0" y="100" width="120" height="100" fill="${wall}"/>
  <path d="M-10 102L60 50l70 52z" fill="${roof}"/>
  <rect x="16" y="122" width="24" height="22" fill="#fdf6d8" stroke="#6b5d48" stroke-width="3"/>
  <rect x="80" y="122" width="24" height="22" fill="#fdf6d8" stroke="#6b5d48" stroke-width="3"/>
  <rect x="48" y="150" width="24" height="50" fill="#7a4e30"/></g>`;
const tree = (x, s = 1) => `<g transform="translate(${x} ${200 - 200 * s}) scale(${s})">
  <rect x="-5" y="130" width="10" height="70" fill="#7a5532"/>
  <circle cx="0" cy="118" r="34" fill="#4f9a3c"/><circle cx="-22" cy="136" r="22" fill="#5fae48"/><circle cx="22" cy="134" r="24" fill="#5fae48"/></g>`;
const tower = (x, w, h, fill) => {
  let windows = "";
  for (let wy = 210 - h + 14; wy < 190; wy += 22) {
    for (let wx = x + 10; wx < x + w - 14; wx += 20) windows += `<rect x="${wx}" y="${wy}" width="10" height="12" fill="#e9eef3" fill-opacity=".75"/>`;
  }
  return `<rect x="${x}" y="${200 - h}" width="${w}" height="${h}" fill="${fill}"/>${windows}`;
};
const parasol = (x, c) => `<g transform="translate(${x} 0)"><rect x="-2" y="140" width="4" height="60" fill="#6b5d48"/>
  <path d="M-38 146q38-34 76 0z" fill="${c}"/><path d="M-12 146q12-30 24 0z" fill="#ffffff" fill-opacity=".85"/></g>`;

const BACKDROPS = {
  street: `<svg viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    ${house(30, "#f4d6a0", "#8a4b3a")}${tree(210, 0.9)}${house(260, "#cfe3c4", "#5d6b7a")}
    ${house(610, "#f2c4b8", "#5d6b7a")}${tree(790, 1)}${house(840, "#c9d8ee", "#8a4b3a")}
    <rect x="0" y="186" width="1000" height="14" fill="#6aa042"/></svg>`,
  park: `<svg viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M0 150Q250 90 520 140T1000 120V200H0z" fill="#9ccc65"/>
    <ellipse cx="820" cy="186" rx="130" ry="16" fill="#8fd0e8"/>
    ${tree(70, 1)}${tree(180, 0.75)}${tree(330, 0.95)}${tree(640, 0.8)}${tree(930, 1.05)}
    <g fill="#8a5a2b"><rect x="700" y="170" width="60" height="6"/><rect x="704" y="176" width="4" height="14"/><rect x="752" y="176" width="4" height="14"/><rect x="700" y="158" width="60" height="5"/></g></svg>`,
  downtown: `<svg viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    ${tower(0, 130, 170, "#8a96a8")}${tower(140, 90, 120, "#b9a99a")}${tower(240, 120, 196, "#6f7c8f")}
    ${tower(370, 100, 140, "#a3aab5")}${tower(480, 140, 180, "#8f9cae")}${tower(630, 90, 110, "#b9a99a")}
    ${tower(730, 130, 190, "#6f7c8f")}${tower(870, 130, 150, "#a3aab5")}</svg>`,
  beach: `<svg viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect x="0" y="60" width="1000" height="140" fill="#3fa6c9"/>
    <path d="M0 84q40-8 80 0t80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0" fill="none" stroke="#a8e0f0" stroke-width="3"/>
    <path d="M0 118q40-8 80 0t80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0" fill="none" stroke="#a8e0f0" stroke-width="3"/>
    <path d="M0 150q200-16 500-6t500 0V200H0z" fill="#e8d29a"/>
    <g fill="#8a6a46"><rect x="760" y="96" width="240" height="10"/><rect x="780" y="106" width="6" height="60"/><rect x="860" y="106" width="6" height="60"/><rect x="940" y="106" width="6" height="60"/></g>
    ${parasol(90, "#e4572e")}${parasol(250, "#2e86ab")}${parasol(680, "#f2a541")}</svg>`,
};

// ---------- customers ----------

const SKIN = ["#f6d5b8", "#eabf98", "#d39b6c", "#a8714a", "#7a4e30", "#5a3823"];
const SHIRTS = ["#e4572e", "#2e86ab", "#76b041", "#f2a541", "#9b5de5", "#f15bb5", "#00a6a6", "#3d405b", "#ffffff"];
const HAIR = ["#2b1d0e", "#6b3e1e", "#c9a45c", "#1b1b1b", "#a33b20", "#d9d9d9", "#4a3020"];
const PANTS = ["#33415c", "#5c4b3b", "#2f3e46", "#7d8597", "#a26769"];
const SAYS = { pricey: "Too pricey!", line: "Line's too long", soldout: "Sold out?!" };

function walkerEl(look) {
  const el = document.createElement("div");
  el.className = "walker";
  el.style.cssText = `--skin:${SKIN[look % 6]};--shirt:${SHIRTS[(look >> 3) % 9]};--hair:${HAIR[(look >> 7) % 7]};--pants:${PANTS[(look >> 10) % 5]}`;
  if (!((look >> 13) & 1)) el.style.setProperty("--flip", "-1");
  el.innerHTML = `<div class="person"><span class="hair"></span><span class="head"></span><span class="torso"></span>
    <span class="leg l"></span><span class="leg r"></span><span class="cup"></span></div>`;
  return el;
}

// ---------- the day at the stand ----------

function playDay(before, report) {
  return new Promise((resolve) => {
    const reduce = reduceMotion.matches;
    const dayMs = reduce ? 3000 : DAY_MS;
    const scene = $("scene");
    const width = scene.clientWidth;
    const standW = $("stand").clientWidth;
    const customers = report.customers;
    // Busy days would bury the street in walkers, so only some passersby are drawn.
    const passStride = Math.max(1, Math.ceil(report.counts.pass / 90));
    const spawns = reduce ? [] : customers
      .filter((c, i) => c.outcome !== "pass" || i % passStride === 0)
      .map((c) => ({ c, at: c.t * dayMs - (c.outcome === "pass" ? CROSS / 2 : APPROACH) }))
      .sort((a, b) => a.at - b.at);
    const anims = new Set();
    const live = { sold: 0, revenue: 0, soldout: 0, line: 0, firstOut: null };
    const due = report.expenses.rent + report.expenses.ads;
    let elapsed = 0;
    let last = performance.now();
    let si = 0;
    let ci = 0;
    let lastBubble = -Infinity;

    selling = {
      day: report.day,
      weather: report.weather,
      speed: 1,
      skip: false,
      cash: before.cash - due,
      rep: before.rep,
      setSpeed(v) {
        this.speed = v;
        for (const a of anims) a.updatePlaybackRate(v);
      },
      skipToClose() {
        this.skip = true;
        for (const a of anims) a.cancel();
        anims.clear();
        $("lane-front").replaceChildren();
        $("lane-back").replaceChildren();
      },
    };
    render();

    const track = (anim, el) => {
      anims.add(anim);
      anim.updatePlaybackRate(selling.speed);
      anim.onfinish = () => {
        anims.delete(anim);
        el?.remove();
      };
      anim.oncancel = () => anims.delete(anim);
    };

    const spawn = ({ c, at }) => {
      const el = walkerEl(c.look);
      const ltr = (c.look >> 13) & 1;
      const off = 40;
      const x0 = ltr ? -off : width + off;
      const x2 = ltr ? width + off : -off;
      const ahead = elapsed - at;
      if (c.outcome === "pass") {
        $("lane-back").append(el);
        const a = el.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x2}px)` }], { duration: CROSS });
        a.currentTime = ahead;
        track(a, el);
        return;
      }
      const total = APPROACH + PAUSE + LEAVE;
      const stop = width / 2 + (((c.look >> 4) % 64) / 63 - 0.5) * standW * 0.7;
      $("lane-front").append(el);
      const walk = el.animate([
        { transform: `translateX(${x0}px)` },
        { transform: `translateX(${stop}px)`, offset: APPROACH / total },
        { transform: `translateX(${stop}px)`, offset: (APPROACH + PAUSE) / total },
        { transform: `translateX(${x2}px)` },
      ], { duration: total });
      walk.currentTime = ahead;
      track(walk, el);
      if (c.outcome === "bought") {
        const cup = el.querySelector(".cup");
        const hold = cup.animate([{ opacity: 0 }, { opacity: 0, offset: (APPROACH + PAUSE - 250) / total }, { opacity: 1, offset: (APPROACH + PAUSE - 150) / total }, { opacity: 1 }], { duration: total, fill: "forwards" });
        hold.currentTime = ahead;
        track(hold);
      }
      // One speech bubble at a time near the counter keeps them readable.
      const arriveAt = at + APPROACH;
      if (arriveAt - lastBubble < 650 && c.outcome === "bought") return;
      lastBubble = arriveAt;
      const bubble = document.createElement("div");
      bubble.className = `bubble ${c.mood === "happy" ? "happy" : c.outcome === "bought" && c.mood !== "unhappy" ? "" : "unhappy"}`;
      bubble.textContent = c.comment ?? SAYS[c.outcome];
      el.append(bubble);
      const show = bubble.animate([
        { opacity: 0 },
        { opacity: 0, offset: APPROACH / total },
        { opacity: 1, offset: (APPROACH + 120) / total },
        { opacity: 1, offset: (APPROACH + PAUSE + 500) / total },
        { opacity: 0, offset: (APPROACH + PAUSE + 700) / total },
        { opacity: 0 },
      ], { duration: total });
      show.currentTime = ahead;
      track(show);
    };

    const tally = (c) => {
      if (c.outcome === "bought") {
        live.sold++;
        live.revenue += report.recipe.price;
      } else if (c.outcome === "soldout") {
        live.soldout++;
        live.firstOut ??= report.ranOut?.item;
      } else if (c.outcome === "line") live.line++;
    };

    const hud = (progress) => {
      selling.cash = before.cash - due + live.revenue;
      const alerts = [];
      if (live.firstOut) alerts.push(`Out of ${SUPPLY_WORDS[live.firstOut]}!`);
      else if (live.line > 2) alerts.push("The line's backing up");
      $("hud-left").innerHTML = `<span class="pill">${G.clockAt(progress)}</span>
        <span class="pill">Sold ${live.sold}</span><span class="pill">${G.money(live.revenue)}</span>
        ${alerts.map((a) => `<span class="pill alert">${esc(a)}</span>`).join("")}`;
      $("sun").style.setProperty("--sun-x", `${18 + 64 * progress}%`);
      renderStats();
    };

    const frame = (now) => {
      elapsed += Math.min(100, now - last) * selling.speed;
      last = now;
      if (selling.skip) elapsed = dayMs;
      while (si < spawns.length && spawns[si].at <= elapsed) {
        if (!selling.skip) spawn(spawns[si]);
        si++;
      }
      while (ci < customers.length && customers[ci].t * dayMs <= elapsed) tally(customers[ci++]);
      const progress = Math.min(1, elapsed / dayMs);
      hud(progress);
      if (progress >= 1) {
        while (ci < customers.length) tally(customers[ci++]);
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function openStand() {
  if (selling || G.openBlocker(state)) return;
  const before = state;
  state = G.runDay(state);
  save();
  notice = null;
  $("scene").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
  await playDay(before, state.lastReport);
  selling = null;
  drawn.receipt = null;
  dayNotice(state.lastReport);
  render();
  $("receipt").classList.add("printing");
  $("receipt").addEventListener("animationend", () => $("receipt").classList.remove("printing"), { once: true });
}

function dayNotice(r) {
  const unlocked = r.unlockedNow.map((id) => G.LOCATIONS.find((l) => l.id === id).name);
  const made = r.profit >= 0 ? `made <strong>${G.money(r.profit)}</strong>` : `lost <strong>${G.money(-r.profit)}</strong>`;
  const stocked = r.profit < 0 && r.expenses.supplies > r.revenue ? " Most of that went on supplies you still have." : "";
  const unlock = unlocked.length ? ` Word is getting around: you can now set up at ${G.listJoin(unlocked)}.` : "";
  notice = {
    warn: r.profit < 0,
    html: `<p><strong>Day ${r.day} is done.</strong> You sold ${plural(r.sold, "cup")} for ${G.money(r.revenue)} and ${made}.${stocked}${unlock}</p>
      <a href="#receipt">Read the receipt</a>`,
  };
}

// ---------- drawing ----------

function renderStats() {
  const s = state;
  const day = selling ? selling.day : Math.min(s.day, s.endless ? Infinity : G.SEASON_DAYS);
  $("stat-day").innerHTML = s.endless ? `${day}` : `${day} <small>of ${G.SEASON_DAYS}</small>`;
  $("stat-cash").textContent = G.money(selling ? selling.cash : s.cash);
  const rep = selling ? selling.rep : s.rep;
  $("stat-rep").textContent = Math.round(rep);
  const meter = $("rep-meter");
  meter.setAttribute("aria-valuenow", Math.round(rep));
  meter.querySelector(".fill").style.width = `${rep}%`;
}

function renderScene() {
  const s = state;
  const scene = $("scene");
  const wx = selling ? selling.weather : G.weatherFor(s.seed, s.day).forecast;
  scene.dataset.wx = wx.cond;
  scene.dataset.loc = s.location;
  if (drawn.backdrop !== s.location) {
    drawn.backdrop = s.location;
    $("backdrop").innerHTML = BACKDROPS[s.location];
  }
  if (!drawn.stand) {
    drawn.stand = true;
    $("stand").innerHTML = STAND;
  }
  const fxKey = `${wx.cond}:${reduceMotion.matches}`;
  if (drawn.fx !== fxKey) {
    drawn.fx = fxKey;
    const clouds = { sunny: 1, partly: 3, cloudy: 5, rain: 6, storm: 7 }[wx.cond];
    const tone = { sunny: "#ffffff", partly: "#ffffff", cloudy: "#eef1f3", rain: "#cfd6dc", storm: "#9aa3ad" }[wx.cond];
    let html = "";
    for (let i = 0; i < clouds; i++) {
      const w = 70 + ((i * 37) % 60);
      html += `<div class="cloud" style="--cloud:${tone};left:${(i * 23 + 6) % 92}%;top:${8 + ((i * 13) % 28)}%;width:${w}px;--drift:${50 + i * 9}s;--drift-by:${i % 2 ? -50 : 60}px"></div>`;
    }
    if (wx.cond === "rain" || wx.cond === "storm") {
      const drops = wx.cond === "storm" ? 90 : 55;
      for (let i = 0; i < drops; i++) {
        html += `<span class="drop" style="left:${(i * 97) % 104}%;animation-delay:-${((i * 0.137) % 1).toFixed(2)}s;--fall:${(0.55 + (i % 5) * 0.06).toFixed(2)}s"></span>`;
      }
    }
    if (wx.cond === "storm") html += `<div class="flash"></div>`;
    $("sky-fx").innerHTML = html;
  }
  $("stand-price").textContent = cents(selling ? state.lastReport.recipe.price : s.recipe.price);
  $("stand-open").textContent = selling ? "OPEN" : "CLOSED";
  $("stand-open").setAttribute("fill", selling ? "#23743a" : "#b23a1e");
  $("hud-speed").hidden = !selling;
  if (!selling) {
    $("sun").style.setProperty("--sun-x", "22%");
    $("hud-left").innerHTML = G.seasonOver(s)
      ? `<span class="pill">Summer's over</span>`
      : `<span class="pill">${esc(dateLabel(s.day).split(",")[0])} morning · opens 9:00 AM</span>`;
  } else {
    for (const v of ["1", "3"]) $(`speed-${v}`).setAttribute("aria-pressed", String(selling.speed === Number(v)));
  }
}

function renderNotice() {
  const box = $("notice");
  let n = notice;
  if (!selling && !G.seasonOver(state) && G.isStuck(state)) {
    n = {
      warn: true,
      html: `<p><strong>You're out of stock and can't afford a refill.</strong> This summer is over for your stand.</p>
        <button type="button" class="btn-plain" id="stuck-restart">Start a new summer</button>`,
    };
  }
  box.hidden = !n || !!selling;
  if (!n) return;
  box.classList.toggle("warn", !!n.warn);
  if (box.dataset.html !== n.html) {
    box.dataset.html = n.html;
    box.innerHTML = n.html;
  }
}

function buildPrep() {
  $("spots").innerHTML = G.LOCATIONS.map((l) => `
    <button type="button" class="choice" id="spot-${l.id}" data-loc="${l.id}" aria-pressed="false">
      <span class="choice-top"><span class="choice-name">${esc(l.name)}</span><span class="choice-meta">${l.rent ? `${G.money(l.rent)}/day` : "Free"}</span></span>
      <span class="choice-text">${esc(l.blurb)}</span>
      <span class="choice-text num" id="spot-${l.id}-crowd"></span>
      <span class="choice-lock" id="spot-${l.id}-lock">Unlocks at reputation ${l.unlockRep}</span>
    </button>`).join("");

  $("shop").innerHTML = G.SUPPLY_IDS.map((id) => `
    <div class="shop-row">
      <div class="item">
        <span class="glyph">${GLYPHS[id]}</span>
        <span class="item-name">${esc(G.SUPPLIES[id].name)} <span class="market" id="mkt-${id}" hidden></span></span>
        <span class="item-have" id="have-${id}"></span>
      </div>
      <div class="packs">
        ${G.SUPPLIES[id].packs.map((p, i) => `
          <button type="button" class="pack" id="buy-${id}-${i}" data-buy="${id}" data-pack="${i}">
            <span class="qty">${p.qty} ${esc(G.SUPPLIES[id].unit)}</span><span class="cost" id="cost-${id}-${i}"></span>
          </button>`).join("")}
      </div>
    </div>`).join("");

  $("ads").innerHTML = G.ADS.map((a) => `
    <button type="button" class="choice" id="ad-${a.id}" data-ad="${a.id}" aria-pressed="false">
      <span class="choice-top"><span class="choice-name">${esc(a.name)}</span><span class="choice-meta">${a.cost ? G.money(a.cost) : "Free"}</span></span>
      <span class="choice-text">${a.boost ? `${Math.round(a.boost * 100)}% more passersby` : "Just the regulars"}</span>
    </button>`).join("");

  $("upgrades").innerHTML = G.UPGRADES.map((u) => `
    <div class="upgrade" id="up-${u.id}">
      <h3>${esc(u.name)}</h3>
      <p>${esc(u.effect)}</p>
      <button type="button" class="buy" id="buy-up-${u.id}" data-upgrade="${u.id}">${G.money(u.cost)}</button>
    </div>`).join("");

  const meter = $("rep-meter");
  for (const l of G.LOCATIONS.filter((x) => x.unlockRep > 0)) {
    const tick = document.createElement("i");
    tick.style.left = `${l.unlockRep}%`;
    tick.title = `${l.name} unlocks at ${l.unlockRep}`;
    meter.append(tick);
  }
}

function renderToday() {
  const s = state;
  const { forecast } = G.weatherFor(s.seed, s.day);
  $("today-date").textContent = `Day ${s.day} · ${dateLabel(s.day)}`;
  if (drawn.icon !== forecast.cond) {
    drawn.icon = forecast.cond;
    $("wx-icon").innerHTML = `<svg viewBox="0 0 64 64" role="img" aria-label="${G.CONDITIONS[forecast.cond].name}">${WX_ICONS[forecast.cond]}</svg>`;
  }
  $("wx-temp").innerHTML = `${forecast.temp}°F <small>${G.CONDITIONS[forecast.cond].name}</small>`;
  $("wx-note").textContent = `${forecastNote(forecast)} Forecasts can be a few degrees off.`;
  for (const l of G.LOCATIONS) {
    const btn = $(`spot-${l.id}`);
    const open = s.unlocked.includes(l.id);
    btn.setAttribute("aria-pressed", String(s.location === l.id));
    btn.disabled = !open;
    $(`spot-${l.id}-lock`).hidden = open;
    $(`spot-${l.id}-crowd`).textContent = open
      ? `About ${Math.round(G.expectedCrowd(s, l, forecast) / 5) * 5} passersby today`
      : "";
  }
}

function renderRecipe() {
  const s = state;
  const { recipe } = s;
  for (const key of ["lemons", "sugar", "ice"]) {
    const [lo, hi] = G.RECIPE_LIMITS[key];
    const unit = key === "lemons" ? "" : key === "sugar" ? (recipe.sugar === 1 ? "cup" : "cups") : (recipe.ice === 1 ? "cube" : "cubes");
    $(`val-${key}`).innerHTML = `${recipe[key]}${unit ? `<small>${unit}</small>` : ""}`;
    $(`dec-${key}`).disabled = recipe[key] <= lo;
    $(`inc-${key}`).disabled = recipe[key] >= hi;
  }
  const [plo, phi] = G.RECIPE_LIMITS.price;
  $("price").value = recipe.price;
  $("price-out").textContent = G.money(recipe.price);
  $("dec-price").disabled = recipe.price <= plo;
  $("inc-price").disabled = recipe.price >= phi;
  $("pitcher-size").textContent = `${G.cupsPerPitcher(s)} cups a pitcher`;
  const cost = G.costPerCup(s);
  $("fact-cost").textContent = G.money(cost);
  const margin = recipe.price - cost;
  $("fact-margin").innerHTML = margin >= 0 ? G.money(margin) : `${G.money(margin)}<small>You lose money on every cup</small>`;
  const { cups, limit } = G.cupsPossible(s);
  $("fact-pour").innerHTML = cups > 0
    ? `${plural(cups, "cup")}<small>until the ${SUPPLY_WORDS[limit]} runs out</small>`
    : `0 cups<small>Buy ${SUPPLY_WORDS[limit]} below</small>`;
}

function renderShop() {
  const s = state;
  const market = G.marketFor(s.seed, s.day);
  for (const id of G.SUPPLY_IDS) {
    const have = s.inventory[id];
    let note = `${have.toLocaleString("en-US")} on hand`;
    if (id === "ice") note += G.has(s, "cooler") ? " · half melts tonight" : " · melts tonight";
    $(`have-${id}`).textContent = note;
    const tag = $(`mkt-${id}`);
    const m = market[id];
    const cheap = m <= (id === "lemons" ? 0.9 : 0.95);
    const dear = m >= (id === "lemons" ? 1.12 : 1.05);
    tag.hidden = !(cheap || dear);
    tag.className = `market ${cheap ? "cheap" : "dear"}`;
    tag.textContent = cheap ? "Cheap today" : "Pricey today";
    G.SUPPLIES[id].packs.forEach((p, i) => {
      $(`cost-${id}-${i}`).textContent = G.money(G.packPrice(s, id, i));
      const btn = $(`buy-${id}-${i}`);
      const why = G.buyBlocker(s, id, i);
      btn.disabled = !!why;
      btn.title = why ?? "";
    });
  }
}

function renderAds() {
  for (const a of G.ADS) {
    const btn = $(`ad-${a.id}`);
    btn.setAttribute("aria-pressed", String(state.ad === a.id));
    btn.disabled = a.cost > state.cash && state.ad !== a.id;
  }
}

function renderUpgrades() {
  for (const u of G.UPGRADES) {
    const owned = G.has(state, u.id);
    const btn = $(`buy-up-${u.id}`);
    $(`up-${u.id}`).classList.toggle("owned", owned);
    btn.textContent = owned ? "Owned" : G.money(u.cost);
    btn.disabled = owned || !!G.upgradeBlocker(state, u.id);
  }
}

function renderOpenBar() {
  const s = state;
  const why = G.openBlocker(s);
  const due = G.locationOf(s).rent + G.adOf(s).cost;
  if (selling) {
    $("open-status").innerHTML = `<strong>The stand is open.</strong> Watch the street, or skip to closing time.`;
  } else if (why) {
    $("open-status").innerHTML = `<span class="why">${esc(why)}</span>`;
  } else {
    const { cups } = G.cupsPossible(s);
    $("open-status").innerHTML = `<strong>Ready to pour ${plural(cups, "cup")} at ${cents(s.recipe.price)}.</strong>
      ${due ? `Opening costs ${G.money(due)} in rent and ads.` : "Nothing to pay to open today."}`;
  }
  $("open-btn").disabled = !!why || !!selling;
}

function renderSeasonEnd() {
  const sum = G.seasonSummary(state);
  $("rank-name").textContent = sum.rank.name;
  $("season-facts").innerHTML = `
    <div><dt>Cash at the end</dt><dd>${G.money(sum.finalCash)}</dd></div>
    <div><dt>Cups sold</dt><dd>${sum.cupsSold.toLocaleString("en-US")}</dd></div>
    <div><dt>Total sales</dt><dd>${G.money(sum.revenue)}</dd></div>
    <div><dt>Best day</dt><dd>${sum.bestDay ? `Day ${sum.bestDay.day}<small>${G.money(sum.bestDay.profit)} profit</small>` : "None"}</dd></div>`;
  $("ladder").innerHTML = G.RANKS.map((r) => `
    <li class="${r === sum.rank ? "here" : ""}"><b>${esc(r.name)}</b><span>${r.min ? `${G.money(r.min)}+` : "Any cash"}</span></li>`).join("");
}

function receiptHTML(r) {
  const loc = G.LOCATIONS.find((l) => l.id === r.location);
  const row = (label, value, cls = "") => `<div class="row ${cls}"><span>${label}</span><span>${value}</span></div>`;
  const neg = (v) => (v ? `-${G.money(v)}` : "$0.00");
  const said = Object.entries(r.comments).sort((a, b) => b[1] - a[1]);
  const missed = [["pricey", "Too pricey"], ["line", "Line too long"], ["soldout", "We'd sold out"]]
    .filter(([k]) => r.counts[k] > 0);
  const repChange = Math.round((r.repAfter - r.repBefore) * 10) / 10;
  const upgrades = r.expenses.upgrades;
  return `
    <h2>Lemonade</h2>
    <p class="center">${esc(loc.name)}<br>Day ${r.day} · ${esc(dateLabel(r.day))}</p>
    <p class="center muted">${esc(G.CONDITIONS[r.weather.cond].name)}, ${r.weather.temp}°F
      (forecast ${r.forecast.temp}°F${r.forecast.cond !== r.weather.cond ? `, ${esc(G.CONDITIONS[r.forecast.cond].name.toLowerCase())}` : ""})</p>
    <hr>
    ${row("Lemons, sugar / pitcher", `${r.recipe.lemons}, ${r.recipe.sugar}`)}
    ${row("Ice / cup", r.recipe.ice)}
    ${row("Passersby", r.passersby)}
    ${row("Stopped to look", r.interested)}
    ${row(`Cups sold @ ${cents(r.recipe.price)}`, r.sold)}
    <hr>
    ${row("Sales", G.money(r.revenue))}
    ${row("Supplies", neg(r.expenses.supplies))}
    ${row("Rent", neg(r.expenses.rent))}
    ${row("Advertising", neg(r.expenses.ads))}
    ${row("PROFIT", `${r.profit >= 0 ? "+" : ""}${G.money(r.profit)}`, "big")}
    ${upgrades ? row("Upgrades bought", neg(upgrades)) : ""}
    ${row("Cash on hand", G.money(r.cashAfter))}
    ${row("Reputation", `${Math.round(r.repBefore)} → ${Math.round(r.repAfter)} (${repChange >= 0 ? "+" : ""}${repChange})`)}
    <hr>
    <p class="section">WHAT PEOPLE SAID</p>
    ${said.length ? said.map(([text, n]) => row(`"${esc(text)}"`, n, "indent")).join("") : `<p class="muted">Nobody bought a cup.</p>`}
    ${missed.map(([k, label]) => row(label, r.counts[k], "indent")).join("")}
    <hr>
    ${row("Pitchers made", r.pitchers)}
    ${row("Ice melted", `${r.iceMelted} cubes`)}
    <p class="note">${esc(tillNote(r))}</p>
    <p class="center muted note">THANK YOU · COME AGAIN</p>`;
}

// The one thing the day's numbers most want you to know.
function tillNote(r) {
  if (r.ranOut) {
    return `Ran out of ${SUPPLY_WORDS[r.ranOut.item]} at ${G.clockAt(r.ranOut.t)}. ${plural(r.counts.soldout, "customer")} went home thirsty.`;
  }
  if (r.counts.line > 3) return `${plural(r.counts.line, "customer")} gave up on the line. A helper would serve twice as fast.`;
  if (r.interested && r.counts.pricey / r.interested > 0.4) return "Lots of people balked at the price today.";
  const [top] = Object.entries(r.comments).sort((a, b) => b[1] - a[1]);
  if (top && !["Delicious!", "Pretty good"].includes(top[0])) return `Most common complaint: "${top[0]}"`;
  if (r.sold === 0) return "No sales today.";
  return "A smooth day. Customers liked what they got.";
}

function renderReceipt() {
  const box = $("receipt");
  const key = selling ? "selling" : state.lastReport ? `day-${state.lastReport.day}-${state.seed}` : "empty";
  if (drawn.receipt === key) return;
  drawn.receipt = key;
  if (selling) {
    box.innerHTML = `<h2>Lemonade</h2><p class="receipt-empty">The till is open.<br>Today's receipt prints at 5:00 PM.</p>`;
  } else if (state.lastReport) {
    box.innerHTML = receiptHTML(state.lastReport);
  } else {
    box.innerHTML = `<h2>Lemonade</h2><p class="receipt-empty">No sales yet.<br>Your first receipt prints when you close up tonight.</p>`;
  }
}

function niceStep(range, target = 4) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function axisMoney(c) {
  const d = Math.abs(c) / 100;
  const text = d >= 1000 ? `$${(d / 1000).toFixed(d % 1000 ? 1 : 0)}K` : `$${d % 1 ? d.toFixed(2) : d}`;
  return c < 0 ? `-${text}` : text;
}

function renderChart() {
  const hist = selling ? state.history.slice(0, -1) : state.history;
  const box = $("chart");
  const width = Math.round(box.clientWidth) || 360;
  const key = `${hist.length}:${width}:${state.seed}`;
  if (drawn.chart === key) return;
  drawn.chart = key;
  $("chart-legend").hidden = !hist.length;
  $("chart-table").hidden = !hist.length;
  if (!hist.length) {
    box.innerHTML = `<p class="chart-empty">Each day's profit lands here after you close up.</p>`;
    $("chart-rows").innerHTML = "";
    return;
  }
  const H = 200;
  const pad = { l: 46, r: 6, t: 18, b: 24 };
  const slots = Math.max(G.SEASON_DAYS, hist.length);
  const vals = hist.map((h) => h.profit);
  let hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  if (hi === lo) hi = 1000;
  const step = niceStep(hi - lo);
  const top = Math.ceil(hi / step) * step;
  const bottom = Math.floor(lo / step) * step;
  const y = (v) => pad.t + ((top - v) / (top - bottom)) * (H - pad.t - pad.b);
  const band = (width - pad.l - pad.r) / slots;
  const bw = Math.max(2, Math.min(16, band - 2));
  const firstDay = hist[0].day;
  const cx = (i) => pad.l + (i + 0.5) * band;

  let svg = "";
  for (let v = bottom; v <= top + 1e-9; v += step) {
    svg += `<line class="${v === 0 ? "zero" : "grid"}" x1="${pad.l}" x2="${width - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="tick" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${axisMoney(v)}</text>`;
  }
  const y0 = y(0);
  hist.forEach((h, i) => {
    const x = cx(i) - bw / 2;
    const y1 = y(h.profit);
    const len = Math.abs(y1 - y0);
    if (len < 0.5) return;
    const r = Math.min(3, bw / 2, len);
    const up = h.profit > 0;
    const d = up
      ? `M${x} ${y0}V${y1 + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${y0}z`
      : `M${x} ${y0}V${y1 - r}q0 ${r} ${r} ${r}h${bw - 2 * r}q${r} 0 ${r} -${r}V${y0}z`;
    svg += `<path class="${up ? "gain" : "loss"}" d="${d}"/>`;
  });
  const best = hist.reduce((a, b) => (b.profit > a.profit ? b : a));
  if (best.profit > 0) {
    const i = hist.indexOf(best);
    const anchor = cx(i) > width - pad.r - 30 ? "end" : cx(i) < pad.l + 30 ? "start" : "middle";
    svg += `<text class="label" x="${cx(i)}" y="${y(best.profit) - 5}" text-anchor="${anchor}">${G.money(best.profit)}</text>`;
  }
  for (let i = 0; i < slots; i++) {
    const day = firstDay + i;
    if (day === 1 || day % 5 === 0) svg += `<text class="tick" x="${cx(i)}" y="${H - 6}" text-anchor="middle">${day}</text>`;
  }
  hist.forEach((h, i) => {
    svg += `<rect class="hit" data-i="${i}" x="${pad.l + i * band}" y="${pad.t}" width="${band}" height="${H - pad.t - pad.b}"/>`;
  });
  box.innerHTML = `<svg viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img"
    aria-label="Profit for each of ${hist.length} days, best ${G.money(best.profit)} on day ${best.day}">${svg}</svg><div class="tip" hidden></div>`;

  $("chart-rows").innerHTML = `<table><thead><tr><th>Day</th><th>Spot</th><th>Weather</th><th>Sold</th><th>Sales</th><th>Profit</th><th>Cash</th></tr></thead><tbody>
    ${hist.map((h) => `<tr><td>${h.day}</td><td>${esc(G.LOCATIONS.find((l) => l.id === h.location).name)}</td>
      <td>${esc(G.CONDITIONS[h.weather.cond].name)}, ${h.weather.temp}°F</td><td>${h.sold}</td><td>${G.money(h.revenue)}</td>
      <td>${G.money(h.profit)}</td><td>${G.money(h.cash)}</td></tr>`).join("")}</tbody></table>`;
}

function chartHover(e) {
  const box = $("chart");
  const tip = box.querySelector(".tip");
  if (!tip) return;
  const hit = e.target.closest?.(".hit");
  box.querySelectorAll(".hit.on").forEach((el) => el !== hit && el.classList.remove("on"));
  if (!hit) {
    tip.hidden = true;
    return;
  }
  hit.classList.add("on");
  const hist = selling ? state.history.slice(0, -1) : state.history;
  const h = hist[Number(hit.dataset.i)];
  if (!h) return;
  const rect = hit.getBoundingClientRect();
  const outer = box.getBoundingClientRect();
  const loc = G.LOCATIONS.find((l) => l.id === h.location).name;
  tip.innerHTML = `<strong>Day ${h.day}</strong> · ${esc(loc)}<br>${esc(G.CONDITIONS[h.weather.cond].name)}, ${h.weather.temp}°F · ${plural(h.sold, "cup")}<br>Profit ${G.money(h.profit)}`;
  tip.hidden = false;
  const half = tip.offsetWidth / 2;
  const x = Math.min(outer.width - half, Math.max(half, rect.left - outer.left + rect.width / 2));
  tip.style.left = `${x}px`;
  tip.style.top = `${rect.top - outer.top + 12}px`;
}

function render() {
  const over = G.seasonOver(state);
  document.body.classList.toggle("is-selling", !!selling);
  renderStats();
  renderScene();
  renderNotice();
  $("season-end").hidden = !over || !!selling;
  $("prep-fields").hidden = over && !selling;
  $("open-bar").hidden = over && !selling;
  $("prep-fields").disabled = !!selling;
  if (over && !selling) renderSeasonEnd();
  else {
    renderToday();
    renderRecipe();
    renderShop();
    renderAds();
    renderUpgrades();
    renderOpenBar();
  }
  renderReceipt();
  renderChart();
}

// ---------- input ----------

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function act(move) {
  if (selling) return;
  try {
    state = move();
    save();
    render();
  } catch (err) {
    toast(err.message);
  }
}

function newSummer() {
  selling = null;
  notice = null;
  state = G.newGame(randomSeed());
  for (const k of Object.keys(drawn)) delete drawn[k];
  save();
  render();
  resetRestart();
  window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
}

function resetRestart() {
  $("restart-box").innerHTML = `<button type="button" class="btn-plain" id="restart">Start over</button>`;
}

function wire() {
  $("prep").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    const d = btn.dataset;
    if (d.loc) act(() => G.setLocation(state, d.loc));
    else if (d.buy) act(() => G.buySupply(state, d.buy, Number(d.pack)));
    else if (d.ad) act(() => G.setAd(state, d.ad));
    else if (d.upgrade) act(() => G.buyUpgrade(state, d.upgrade));
    else if (d.step) act(() => G.setRecipe(state, { [d.step]: state.recipe[d.step] + Number(d.delta) }));
    else if (btn.id === "open-btn") openStand();
    else if (btn.id === "new-season" || btn.id === "stuck-restart") newSummer();
    else if (btn.id === "keep-going") act(() => G.keepPlaying(state));
  });
  $("price").addEventListener("input", (e) => act(() => G.setRecipe(state, { price: Number(e.target.value) })));
  $("hud-speed").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !selling) return;
    if (btn.dataset.speed === "skip") selling.skipToClose();
    else selling.setSpeed(Number(btn.dataset.speed));
    renderScene();
  });
  $("restart-box").addEventListener("click", (e) => {
    const id = e.target.closest("button")?.id;
    if (id === "restart") {
      $("restart-box").innerHTML = `<span>Start a new summer? This one will be lost.</span>
        <button type="button" class="btn-plain" id="restart-yes">Yes, start over</button>
        <button type="button" class="btn-plain" id="restart-no">Keep playing</button>`;
      $("restart-no").focus();
    } else if (id === "restart-yes") newSummer();
    else if (id === "restart-no") {
      resetRestart();
      $("restart").focus();
    }
  });
  $("chart").addEventListener("pointermove", chartHover);
  $("chart").addEventListener("pointerleave", () => chartHover({ target: document.body }));
  new ResizeObserver(() => renderChart()).observe($("chart"));
  reduceMotion.addEventListener?.("change", () => render());
}

function start(data) {
  state = data?.state ?? loadSaved() ?? G.newGame(randomSeed());
  buildPrep();
  wire();
  render();
}

window.claude?.hot?.snapshot?.(() => ({ state }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
