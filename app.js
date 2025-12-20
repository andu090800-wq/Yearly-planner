// Plans Dashboard v4 (Glass UI + Goals->Milestones->Tasks + Habits linking)
// Data stored in localStorage. Static app (GitHub Pages friendly).
// Requires Chart.js in index.html (optional; charts degrade gracefully).

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "plans_dashboard_v4";

const view = $("view");
const crumb = $("crumb");
const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const importFile = $("importFile");
const wipeBtn = $("wipeBtn");

const CATEGORIES = [
  { key: "personal", label: "Personal" },
  { key: "money", label: "Money" },
  { key: "sports", label: "Sports" },
  { key: "job", label: "Job" },
  { key: "study", label: "Study" },
  { key: "language", label: "Language learning" }
];

const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of children) e.appendChild(c);
  return e;
}

function uid() {
  return crypto.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return dateToISO(d);
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function parseHash() {
  const h = (location.hash || "#/dashboard").replace(/^#/, "");
  return h.split("/").filter(Boolean);
}
function navTo(hash) { location.hash = hash; }
function setCrumb(text) { crumb.textContent = text || ""; }

function categoryLabel(key) {
  return CATEGORIES.find(c => c.key === key)?.label || key;
}

// ---------------- Storage ----------------
function emptyYear() {
  return {
    habits: [],
    goals: [],
    budget: {}
  };
}

function ensureDB() {
  try {
    const db = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (db && typeof db === "object") return db;
  } catch {}

  // migrate from previous keys if exist (best-effort)
  for (const k of ["plans_dashboard_v3", "plans_dashboard_v2", "plans_dashboard_v1"]) {
    try {
      const old = JSON.parse(localStorage.getItem(k) || "null");
      if (old && typeof old === "object") {
        const migrated = migrateToV4(old);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch {}
  }

  const fresh = {
    version: 4,
    years: { "2026": emptyYear(), "2027": emptyYear(), "2028": emptyYear() },
    settings: { yearList: [2026, 2027, 2028] }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function migrateToV4(old) {
  const db = {
    version: 4,
    years: old.years || { "2026": emptyYear() },
    settings: old.settings || { yearList: [2026, 2027, 2028] }
  };

  for (const y of Object.keys(db.years)) {
    const yr = db.years[y] || emptyYear();
    yr.habits = Array.isArray(yr.habits) ? yr.habits : [];
    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    yr.budget = yr.budget || {};

    // normalize habits
    for (const h of yr.habits) {
      h.id = h.id || uid();
      h.checks = h.checks || {};
      h.category = h.category || "personal";
      h.linkedGoalIds = h.linkedGoalIds || [];
      h.frequency = normalizeFreq(h.frequency);
    }

    // normalize goals, add milestones/tasks structure if missing
    for (const g of yr.goals) {
      g.id = g.id || uid();
      g.category = g.category || "personal";
      g.linkedHabitIds = g.linkedHabitIds || [];
      g.milestones = Array.isArray(g.milestones) ? g.milestones : [];
      for (const ms of g.milestones) {
        ms.id = ms.id || uid();
        ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        for (const t of ms.tasks) t.id = t.id || uid();
      }
    }

    db.years[y] = yr;
  }
  return db;
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function getYear(db, year) {
  const y = String(year);
  if (!db.years[y]) db.years[y] = emptyYear();
  return db.years[y];
}

function addYear(db, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  db.settings.yearList = db.settings.yearList || [];
  if (!db.settings.yearList.includes(y)) db.settings.yearList.push(y);
  db.settings.yearList.sort((a, b) => a - b);
  db.years[String(y)] = db.years[String(y)] || emptyYear();
  saveDB(db);
}

// ---------------- Recurrence (kept solid, but simple enough) ----------------
// Types:
// daily
// weekdays
// weekly_days: {days:[1..7]}
// x_per_week: {times:2} (flex days)
// x_per_week_days: {times:2, days:[1..7]} restricted days
// monthly: {day:1}
// bimonthly: {day:1} every 2 months from startDate if present, else odd months
// custom: {everyNDays:3}

function normalizeFreq(freq) {
  const f = freq || { type: "daily" };
  if (!f.type) f.type = "daily";
  if (f.type === "custom") f.everyNDays = Math.max(1, Number(f.everyNDays || 1));
  if (f.type === "weekly_days") f.days = Array.isArray(f.days) ? f.days : [1, 3, 5];
  if (f.type === "x_per_week") f.times = Math.max(1, Number(f.times || 2));
  if (f.type === "x_per_week_days") {
    f.times = Math.max(1, Number(f.times || 2));
    f.days = Array.isArray(f.days) ? f.days : [2, 4];
  }
  if (f.type === "monthly" || f.type === "bimonthly") f.day = Math.max(1, Math.min(31, Number(f.day || 1)));
  return f;
}

function freqLabel(f) {
  f = normalizeFreq(f);
  switch (f.type) {
    case "daily": return "Daily";
    case "weekdays": return "Weekdays only";
    case "weekly_days": return `Weekly: ${f.days.map(d => DOW[d - 1]).join("/")}`;
    case "x_per_week": return `${f.times}x / week (flex)`;
    case "x_per_week_days": return `${f.times}x / week (${f.days.map(d => DOW[d - 1]).join("/")})`;
    case "monthly": return `Monthly (day ${f.day})`;
    case "bimonthly": return `Every 2 months (day ${f.day})`;
    case "custom": return `Every ${f.everyNDays} days`;
    default: return f.type;
  }
}

function startOfWeekISO(iso) {
  const d = isoToDate(iso);
  const js = d.getDay();
  const mondayOffset = (js === 0 ? -6 : 1 - js);
  d.setDate(d.getDate() + mondayOffset);
  return dateToISO(d);
}
function endOfWeekISO(iso) { return addDays(startOfWeekISO(iso), 6); }

function countChecksInRange(habit, fromISO, toISO) {
  const checks = habit.checks || {};
  let count = 0;
  let cur = fromISO;
  while (cur <= toISO) {
    if (checks[cur]) count++;
    cur = addDays(cur, 1);
  }
  return count;
}

function isHabitDueOn(habit, dateISO) {
  const f = normalizeFreq(habit.frequency);
  const start = habit.startDate || "";
  if (start && dateISO < start) return false;

  const d = isoToDate(dateISO);
  const js = d.getDay();
  const dow = js === 0 ? 7 : js;

  if (f.type === "daily") return true;
  if (f.type === "weekdays") return dow >= 1 && dow <= 5;
  if (f.type === "weekly_days") return f.days.includes(dow);

  if (f.type === "monthly") return d.getDate() === f.day;

  if (f.type === "bimonthly") {
    if (d.getDate() !== f.day) return false;
    if (start) {
      const s = isoToDate(start);
      const monthDiff = (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
      return monthDiff >= 0 && (monthDiff % 2 === 0);
    } else {
      const month = d.getMonth() + 1;
      return month % 2 === 1;
    }
  }

  if (f.type === "custom") {
    const base = start || `${dateISO.slice(0, 4)}-01-01`;
    const diff = Math.floor((isoToDate(dateISO) - isoToDate(base)) / (24 * 3600 * 1000));
    return diff >= 0 && diff % f.everyNDays === 0;
  }

  if (f.type === "x_per_week") {
    const wkStart = startOfWeekISO(dateISO);
    const wkEnd = endOfWeekISO(dateISO);
    const done = countChecksInRange(habit, wkStart, wkEnd);
    return done < f.times;
  }

  if (f.type === "x_per_week_days") {
    if (!f.days.includes(dow)) return false;
    const wkStart = startOfWeekISO(dateISO);
    const wkEnd = endOfWeekISO(dateISO);
    const done = countChecksInRange(habit, wkStart, wkEnd);
    return done < f.times;
  }

  return false;
}

function toggleHabitCheck(db, year, habitId, dateISO) {
  const yr = getYear(db, year);
  const h = yr.habits.find(x => x.id === habitId);
  if (!h) return;
  h.checks = h.checks || {};
  if (h.checks[dateISO]) delete h.checks[dateISO];
  else h.checks[dateISO] = true;
  saveDB(db);
  render();
}

// ---------------- Charts (optional) ----------------
let _charts = [];
function destroyCharts() {
  for (const ch of _charts) { try { ch.destroy(); } catch {} }
  _charts = [];
}
function makeLineChart(canvas, labels, values) {
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ data: values, tension: 0.35, borderWidth: 2, pointRadius: 2 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: 100 } } }
  });
  _charts.push(ch);
  return ch;
}
function makeBarChart(canvas, labels, values) {
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: values, borderWidth: 1 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
  });
  _charts.push(ch);
  return ch;
}
function makeDonutChart(canvas, labels, values) {
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, borderWidth: 1 }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
  _charts.push(ch);
  return ch;
}

// ---------------- UI helpers ----------------
function heroSVG() {
  return `
  <svg class="heroArt" viewBox="0 0 220 140" aria-hidden="true">
    <rect x="10" y="14" width="200" height="112" rx="22" fill="rgba(0,0,0,.06)"/>
    <rect x="26" y="34" width="86" height="10" rx="6" fill="rgba(0,0,0,.18)"/>
    <rect x="26" y="56" width="150" height="10" rx="6" fill="rgba(0,0,0,.10)"/>
    <rect x="26" y="78" width="120" height="10" rx="6" fill="rgba(0,0,0,.10)"/>
    <path d="M30 110 C56 84, 78 124, 108 92 C132 68, 156 84, 188 56"
          fill="none" stroke="black" stroke-width="5" stroke-linecap="round"/>
    <circle cx="30" cy="110" r="6" fill="black"/>
    <circle cx="108" cy="92" r="6" fill="black"/>
    <circle cx="188" cy="56" r="6" fill="black"/>
  </svg>`;
}

// ---------------- Router ----------------
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/dashboard";
render();

function render() {
  destroyCharts();
  const db = ensureDB();
  const p = parseHash();

  // routes:
  // #/dashboard
  // #/year/2026
  // #/year/2026/habits
  // #/year/2026/habits/<category>
  // #/year/2026/goals
  // #/year/2026/goals/<category>
  // #/year/2026/goal/<goalId>
  // #/year/2026/goals-dashboard

  if (p[0] === "year" && p[1]) {
    const year = Number(p[1]);
    if (!db.settings.yearList.includes(year)) addYear(db, year);

    const section = p[2] || "";
    if (!section) return renderYearHome(db, year);

    if (section === "habits") return renderHabits(db, year, p[3] || "");
    if (section === "goals") return renderGoals(db, year, p[3] || "");
    if (section === "goal" && p[3]) return renderGoalDetail(db, year, p[3]);
    if (section === "goals-dashboard") return renderGoalsDashboard(db, year);

    // fallback
    return renderYearHome(db, year);
  }

  return renderDashboard(db);
}

// ---------------- Dashboard ----------------
function renderDashboard(db) {
  setCrumb("Dashboard");
  view.innerHTML = "";

  const years = db.settings.yearList || [2026, 2027, 2028];

  const hero = el("div", { class: "card big hero" });
  hero.appendChild(el("div", { class: "heroGlow" }));
  hero.appendChild(el("div", {}, [
    el("div", { class: "kpi", html: "Plans" }),
    el("div", { class: "muted", html: "Goals → Milestones → Tasks + Habits (execution)" }),
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("span", { class: "pill", html: `Years <b>${years.length}</b>` }),
      el("span", { class: "pill", html: `Today <b>${todayISO()}</b>` }),
      el("span", { class: "pill", html: `Local <b>Only</b>` })
    ])
  ]));
  hero.insertAdjacentHTML("beforeend", heroSVG());

  const grid = el("div", { class: "grid" });
  for (const y of years) {
    const yr = getYear(db, y);
    const t = todayISO();
    const due = yr.habits.filter(h => isHabitDueOn(h, t)).length;
    const done = yr.habits.filter(h => (h.checks || {})[t]).length;

    const card = el("div", { class: "card glass2 stack" }, [
      el("div", { class: "kpi", html: String(y) }),
      el("div", { class: "row" }, [
        el("span", { class: "pill", html: `Habits <b>${yr.habits.length}</b>` }),
        el("span", { class: "pill", html: `Goals <b>${yr.goals.length}</b>` })
      ]),
      el("div", { class: "muted", html: `Today: due <b>${due}</b> • done <b>${done}</b>` }),
      el("button", { class: "btn", onclick: () => navTo(`#/year/${y}`) }, [document.createTextNode("Open year")])
    ]);
    grid.appendChild(card);
  }

  view.appendChild(hero);
  view.appendChild(grid);

  // pretty charts for 2026 (if exists)
  const y = years.includes(2026) ? 2026 : years[0];
  const yr = getYear(db, y);

  const charts = el("div", { class: "grid" });

  const c1 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: `Habits completion (last 30 days) • ${y}` }),
    el("div", { class: "muted", html: "Percent = done/due" }),
    el("div", { class: "chartBox" }, [el("canvas")])
  ]);
  const c2 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: `Goals progress by category • ${y}` }),
    el("div", { class: "chartBox" }, [el("canvas")])
  ]);
  const c3 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: `Top goals • ${y}` }),
    el("div", { class: "chartBox" }, [el("canvas")])
  ]);

  charts.appendChild(c1);
  charts.appendChild(c2);
  charts.appendChild(c3);
  view.appendChild(charts);

  // chart data
  const t = todayISO();
  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i--) {
    const iso = addDays(t, -i);
    labels.push(iso.slice(5));
    const due = yr.habits.filter(h => isHabitDueOn(h, iso)).length;
    const done = yr.habits.filter(h => (h.checks || {})[iso]).length;
    values.push(due ? Math.round((done / due) * 100) : 0);
  }
  makeLineChart(c1.querySelector("canvas"), labels, values);

  const goalsWithNums = (yr.goals || []).filter(g => g.targetValue !== "" && g.currentValue !== "" && Number(g.targetValue) > 0);
  const catLabels = CATEGORIES.map(c => c.label);
  const catAvg = CATEGORIES.map(c => {
    const arr = goalsWithNums.filter(g => g.category === c.key).map(g => clamp01(Number(g.currentValue) / Number(g.targetValue)));
    return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : 0;
  });
  makeDonutChart(c2.querySelector("canvas"), catLabels, catAvg);

  const top = goalsWithNums
    .map(g => ({ title: g.title, pct: Math.round(clamp01(Number(g.currentValue) / Number(g.targetValue)) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
  makeBarChart(c3.querySelector("canvas"), top.map(x => x.title.slice(0, 14)), top.map(x => x.pct));
}

// ---------------- Year Home ----------------
function renderYearHome(db, year) {
  const yr = getYear(db, year);
  const t = todayISO();

  setCrumb(`Year ${year}`);
  view.innerHTML = "";

  const hero = el("div", { class: "card big hero" });
  hero.appendChild(el("div", { class: "heroGlow" }));
  hero.appendChild(el("div", {}, [
    el("div", { class: "kpi", html: String(year) }),
    el("div", { class: "muted", html: "Execution system: create Goals → Milestones → Tasks, then attach Habits." }),
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("span", { class: "pill", html: `Habits <b>${yr.habits.length}</b>` }),
      el("span", { class: "pill", html: `Goals <b>${yr.goals.length}</b>` }),
      el("span", { class: "pill", html: `Today <b>${t}</b>` })
    ]),
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("button", { class: "btn", onclick: () => navTo(`#/year/${year}/goals`) }, [document.createTextNode("Goals")]),
      el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/habits`) }, [document.createTextNode("Habits")]),
      el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/goals-dashboard`) }, [document.createTextNode("Goals dashboard")])
    ])
  ]));
  hero.insertAdjacentHTML("beforeend", heroSVG());

  // Due today list (habits)
  const due = yr.habits.filter(h => isHabitDueOn(h, t));
  const todayCard = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Today — Habits due" }),
    el("div", { class: "muted", html: `Due: <b>${due.length}</b>` })
  ]);

  const list = el("div", { class: "list" });
  if (!due.length) {
    list.appendChild(el("div", { class: "muted", html: "No habits due today." }));
  } else {
    for (const h of due.slice(0, 10)) {
      const done = !!(h.checks || {})[t];
      list.appendChild(el("div", { class: "item" }, [
        el("div", { class: "item-top" }, [
          el("div", {}, [
            el("div", { class: "item-title", html: `${done ? "✅" : "⬜️"} ${h.title}` }),
            el("div", { class: "item-sub", html: `${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
          ]),
          el("div", { class: "item-actions" }, [
            el("button", { class: "btn small " + (done ? "secondary" : ""), onclick: () => toggleHabitCheck(db, year, h.id, t) }, [
              document.createTextNode(done ? "Undo" : "Done")
            ])
          ])
        ])
      ]));
    }
  }
  todayCard.appendChild(list);

  view.appendChild(hero);
  view.appendChild(todayCard);
}

// ---------------- Habits ----------------
function renderHabits(db, year, categoryKey) {
  const yr = getYear(db, year);

  if (!categoryKey) {
    setCrumb(`Year ${year} • Habits`);
    view.innerHTML = "";

    const top = el("div", { class: "card big stack" }, [
      el("div", { class: "row" }, [
        el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
        el("div", {}, [
          el("div", { class: "item-title", html: "Habits" }),
          el("div", { class: "muted", html: "Create habits by category. Then link them to goals from the goal page." })
        ])
      ])
    ]);

    const grid = el("div", { class: "grid" });
    for (const c of CATEGORIES) {
      const count = yr.habits.filter(h => h.category === c.key).length;
      grid.appendChild(el("div", { class: "card glass2 stack" }, [
        el("div", { class: "item-title", html: c.label }),
        el("div", { class: "muted", html: `${count} habits` }),
        el("button", { class: "btn", onclick: () => navTo(`#/year/${year}/habits/${c.key}`) }, [document.createTextNode("Open")])
      ]));
    }

    view.appendChild(top);
    view.appendChild(grid);
    return;
  }

  const cat = CATEGORIES.find(c => c.key === categoryKey);
  setCrumb(`Year ${year} • Habits • ${cat?.label || categoryKey}`);
  view.innerHTML = "";

  const back = el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/habits`) }, [document.createTextNode("← Categories")]);

  const form = habitForm(db, year, categoryKey);
  const list = habitsList(db, year, categoryKey);

  view.appendChild(el("div", { class: "stack" }, [
    el("div", { class: "row" }, [back]),
    form,
    list
  ]));
}

function habitForm(db, year, categoryKey) {
  const yr = getYear(db, year);
  let editingId = null;

  const wrap = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Add / Edit Habit" }),
    el("div", { class: "muted", html: "Recurrence supports weekdays, specific weekdays, X/week, monthly, every N days." })
  ]);

  const title = el("input", { class: "input", placeholder: "Habit title (e.g. Gym)" });
  const startDate = el("input", { class: "input", type: "date" });
  const notes = el("textarea", { class: "input", placeholder: "Notes (optional)" });

  const freqType = el("select", { class: "input" });
  const freqOpts = [
    ["daily", "Daily"],
    ["weekdays", "Weekdays only"],
    ["weekly_days", "Specific weekdays (Mon/Wed/Fri)"],
    ["x_per_week", "X times per week (flex)"],
    ["x_per_week_days", "X times per week (restricted days)"],
    ["monthly", "Monthly (day of month)"],
    ["bimonthly", "Every 2 months (from startDate)"],
    ["custom", "Every N days"]
  ];
  for (const [v, l] of freqOpts) freqType.appendChild(el("option", { value: v }, [document.createTextNode(l)]));

  const times = el("input", { class: "input", type: "number", min: "1", value: "2" });
  const dayOfMonth = el("input", { class: "input", type: "number", min: "1", max: "31", value: "1" });
  const everyNDays = el("input", { class: "input", type: "number", min: "1", value: "3" });

  const weekdayPicker = makeWeekdayPicker([1, 3, 5]);
  const restrictedPicker = makeWeekdayPicker([2, 4]);

  const blocks = {
    weekly_days: weekdayPicker.box,
    x_per_week: el("div", { class: "item" }, [
      el("div", { class: "muted", html: "Times per week:" }), times
    ]),
    x_per_week_days: el("div", { class: "stack" }, [
      el("div", { class: "item" }, [el("div", { class: "muted", html: "Times per week:" }), times]),
      restrictedPicker.box
    ]),
    monthly: el("div", { class: "item" }, [el("div", { class: "muted", html: "Day of month:" }), dayOfMonth]),
    bimonthly: el("div", { class: "item" }, [el("div", { class: "muted", html: "Day of month:" }), dayOfMonth]),
    custom: el("div", { class: "item" }, [el("div", { class: "muted", html: "Every N days:" }), everyNDays])
  };

  const preview = el("div", { class: "pill", html: "<b>Daily</b>" });

  function showBlocks() {
    for (const b of Object.values(blocks)) b.classList.add("hidden");
    const t = freqType.value;
    if (blocks[t]) blocks[t].classList.remove("hidden");
    preview.innerHTML = `<b>${freqLabel(buildFreq())}</b>`;
  }

  function buildFreq() {
    const t = freqType.value;
    const f = { type: t };
    if (t === "weekly_days") f.days = weekdayPicker.days();
    if (t === "x_per_week") f.times = Math.max(1, Number(times.value || 1));
    if (t === "x_per_week_days") {
      f.times = Math.max(1, Number(times.value || 1));
      f.days = restrictedPicker.days();
    }
    if (t === "monthly" || t === "bimonthly") f.day = Math.max(1, Math.min(31, Number(dayOfMonth.value || 1)));
    if (t === "custom") f.everyNDays = Math.max(1, Number(everyNDays.value || 1));
    return normalizeFreq(f);
  }

  freqType.addEventListener("change", showBlocks);
  times.addEventListener("input", showBlocks);
  dayOfMonth.addEventListener("input", showBlocks);
  everyNDays.addEventListener("input", showBlocks);
  weekdayPicker.onChange(showBlocks);
  restrictedPicker.onChange(showBlocks);

  const saveBtn = el("button", { class: "btn" }, [document.createTextNode("Save habit")]);
  const cancelBtn = el("button", { class: "btn secondary hidden" }, [document.createTextNode("Cancel edit")]);

  function reset() {
    editingId = null;
    title.value = "";
    startDate.value = "";
    notes.value = "";
    freqType.value = "daily";
    times.value = "2";
    dayOfMonth.value = "1";
    everyNDays.value = "3";
    weekdayPicker.set([1, 3, 5]);
    restrictedPicker.set([2, 4]);
    cancelBtn.classList.add("hidden");
    saveBtn.textContent = "Save habit";
    showBlocks();
  }

  saveBtn.onclick = () => {
    const t = title.value.trim();
    if (!t) return alert("Enter a habit title.");

    const payload = {
      title: t,
      category: categoryKey,
      startDate: startDate.value || "",
      frequency: buildFreq(),
      notes: notes.value.trim()
    };

    if (editingId) {
      const h = yr.habits.find(x => x.id === editingId);
      if (!h) return;
      Object.assign(h, payload);
      h.frequency = normalizeFreq(h.frequency);
    } else {
      yr.habits.push({
        id: uid(),
        ...payload,
        checks: {},
        linkedGoalIds: []
      });
    }

    saveDB(db);
    renderHabits(db, year, categoryKey);
  };

  cancelBtn.onclick = reset;

  wrap._startEdit = (habitId) => {
    const h = yr.habits.find(x => x.id === habitId);
    if (!h) return;
    editingId = habitId;
    title.value = h.title || "";
    startDate.value = h.startDate || "";
    notes.value = h.notes || "";

    const f = normalizeFreq(h.frequency);
    freqType.value = f.type || "daily";
    times.value = String(f.times || 2);
    dayOfMonth.value = String(f.day || 1);
    everyNDays.value = String(f.everyNDays || 3);
    if (f.type === "weekly_days") weekdayPicker.set(f.days || [1, 3, 5]);
    if (f.type === "x_per_week_days") restrictedPicker.set(f.days || [2, 4]);

    cancelBtn.classList.remove("hidden");
    saveBtn.textContent = "Update habit";
    showBlocks();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  showBlocks();

  wrap.appendChild(el("div", { class: "grid" }, [
    el("div", {}, [el("div", { class: "muted", html: "Title" }), title]),
    el("div", {}, [el("div", { class: "muted", html: "Start date" }), startDate]),
    el("div", {}, [el("div", { class: "muted", html: "Recurrence" }), freqType]),
    el("div", {}, [el("div", { class: "muted", html: "Preview" }), preview])
  ]));

  for (const b of Object.values(blocks)) wrap.appendChild(b);

  wrap.appendChild(el("div", {}, [el("div", { class: "muted", html: "Notes" }), notes]));
  wrap.appendChild(el("div", { class: "row" }, [saveBtn, cancelBtn]));

  return wrap;
}

function makeWeekdayPicker(defaultDays) {
  const box = el("div", { class: "item stack" }, [
    el("div", { class: "muted", html: "Pick weekdays:" })
  ]);
  const row = el("div", { class: "row" });
  const checks = [];
  for (let i = 1; i <= 7; i++) {
    const id = `dow_${i}_${uid()}`;
    const cb = el("input", { type: "checkbox", id });
    cb.checked = defaultDays.includes(i);
    checks.push([i, cb]);
    row.appendChild(el("label", { for: id, class: "pill" }, [cb, document.createTextNode(DOW[i - 1])]));
  }
  box.appendChild(row);

  return {
    box,
    days: () => checks.filter(([, cb]) => cb.checked).map(([i]) => i),
    set: (arr) => { for (const [i, cb] of checks) cb.checked = arr.includes(i); },
    onChange: (fn) => { for (const [, cb] of checks) cb.addEventListener("change", fn); }
  };
}

function habitsList(db, year, categoryKey) {
  const yr = getYear(db, year);
  const wrap = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Habits" })
  ]);

  const habits = yr.habits.filter(h => h.category === categoryKey);
  if (!habits.length) {
    wrap.appendChild(el("div", { class: "muted", html: "No habits yet." }));
    return wrap;
  }

  const list = el("div", { class: "list" });
  for (const h of habits) {
    const linkedGoals = (h.linkedGoalIds || []).map(id => yr.goals.find(g => g.id === id)?.title).filter(Boolean);
    list.appendChild(el("div", { class: "item" }, [
      el("div", { class: "item-top" }, [
        el("div", {}, [
          el("div", { class: "item-title", html: h.title }),
          el("div", { class: "item-sub", html: `${freqLabel(h.frequency)} • Start: ${h.startDate || "—"}` }),
          el("div", { class: "muted", html: `Linked goals: ${linkedGoals.length ? linkedGoals.join(", ") : "—"}` })
        ]),
        el("div", { class: "item-actions" }, [
          el("button", { class: "btn small secondary", onclick: () => {
            // find the form on page and call its edit hook
            const form = view.querySelector(".card.big.stack");
            form?._startEdit?.(h.id);
          } }, [document.createTextNode("Edit")]),
          el("button", { class: "btn small danger", onclick: () => {
            if (!confirm("Delete this habit?")) return;
            // unlink from goals
            for (const g of yr.goals) g.linkedHabitIds = (g.linkedHabitIds || []).filter(x => x !== h.id);
            yr.habits = yr.habits.filter(x => x.id !== h.id);
            saveDB(db);
            renderHabits(db, year, categoryKey);
          } }, [document.createTextNode("Delete")])
        ])
      ])
    ]));
  }

  wrap.appendChild(list);
  return wrap;
}

// ---------------- Goals (with milestones & tasks) ----------------
function renderGoals(db, year, categoryKey) {
  const yr = getYear(db, year);

  if (!categoryKey) {
    setCrumb(`Year ${year} • Goals`);
    view.innerHTML = "";

    const top = el("div", { class: "card big stack" }, [
      el("div", { class: "row" }, [
        el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
        el("button", { class: "btn", onclick: () => navTo(`#/year/${year}/goals-dashboard`) }, [document.createTextNode("Goals dashboard")]),
        el("div", {}, [
          el("div", { class: "item-title", html: "Goals" }),
          el("div", { class: "muted", html: "Create a Goal → add Milestones → add Tasks → attach Habits to execute." })
        ])
      ])
    ]);

    const grid = el("div", { class: "grid" });
    for (const c of CATEGORIES) {
      const count = yr.goals.filter(g => g.category === c.key).length;
      grid.appendChild(el("div", { class: "card glass2 stack" }, [
        el("div", { class: "item-title", html: c.label }),
        el("div", { class: "muted", html: `${count} goals` }),
        el("button", { class: "btn", onclick: () => navTo(`#/year/${year}/goals/${c.key}`) }, [document.createTextNode("Open")])
      ]));
    }

    view.appendChild(top);
    view.appendChild(grid);
    return;
  }

  const cat = CATEGORIES.find(c => c.key === categoryKey);
  setCrumb(`Year ${year} • Goals • ${cat?.label || categoryKey}`);
  view.innerHTML = "";

  const back = el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/goals`) }, [document.createTextNode("← Categories")]);
  const form = goalForm(db, year, categoryKey);
  const list = goalsList(db, year, categoryKey);

  view.appendChild(el("div", { class: "stack" }, [
    el("div", { class: "row" }, [back]),
    form,
    list
  ]));
}

function goalForm(db, year, categoryKey) {
  const yr = getYear(db, year);
  let editingId = null;

  const wrap = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Add / Edit Goal" }),
    el("div", { class: "muted", html: "You can add milestones & tasks inside each goal (open the goal). Link habits to execute it." })
  ]);

  const title = el("input", { class: "input", placeholder: "Goal title (e.g. Save 10,000 EUR)" });
  const targetDate = el("input", { class: "input", type: "date" });
  const metric = el("input", { class: "input", placeholder: "Metric (e.g. EUR, kg, hours)" });
  const targetValue = el("input", { class: "input", type: "number", placeholder: "Target value (optional)" });
  const currentValue = el("input", { class: "input", type: "number", placeholder: "Current value (optional)" });
  const notes = el("textarea", { class: "input", placeholder: "Notes (optional)" });

  // Habits link (same category by default, but you can link any if you want)
  const linkBox = el("div", { class: "item stack" }, [
    el("div", { class: "muted", html: "Attach habits to this goal (execution):" })
  ]);

  function renderHabitCheckboxes(selectedIds = []) {
    linkBox.querySelectorAll(".list").forEach(n => n.remove());
    const list = el("div", { class: "list" });

    const habits = yr.habits.slice().sort((a, b) => a.title.localeCompare(b.title));
    if (!habits.length) {
      list.appendChild(el("div", { class: "muted", html: "No habits created yet. Create habits first." }));
      linkBox.appendChild(list);
      return;
    }

    for (const h of habits) {
      const id = `hb_${h.id}`;
      const cb = el("input", { type: "checkbox", id });
      cb.checked = selectedIds.includes(h.id);
      list.appendChild(el("div", { class: "item" }, [
        el("label", { for: id, class: "row" }, [
          cb,
          el("span", { html: `<b>${h.title}</b> <span class="muted">(${categoryLabel(h.category)})</span>` })
        ])
      ]));
    }
    linkBox.appendChild(list);
  }
  renderHabitCheckboxes([]);

  const saveBtn = el("button", { class: "btn" }, [document.createTextNode("Save goal")]);
  const cancelBtn = el("button", { class: "btn secondary hidden" }, [document.createTextNode("Cancel edit")]);

  function reset() {
    editingId = null;
    title.value = "";
    targetDate.value = "";
    metric.value = "";
    targetValue.value = "";
    currentValue.value = "";
    notes.value = "";
    renderHabitCheckboxes([]);
    cancelBtn.classList.add("hidden");
    saveBtn.textContent = "Save goal";
  }

  saveBtn.onclick = () => {
    const t = title.value.trim();
    if (!t) return alert("Enter a goal title.");

    const linkedHabitIds = [];
    for (const h of yr.habits) {
      const cb = wrap.querySelector(`#hb_${h.id}`);
      if (cb && cb.checked) linkedHabitIds.push(h.id);
    }

    const payload = {
      title: t,
      category: categoryKey,
      targetDate: targetDate.value || "",
      metric: metric.value.trim(),
      targetValue: targetValue.value === "" ? "" : Number(targetValue.value),
      currentValue: currentValue.value === "" ? "" : Number(currentValue.value),
      notes: notes.value.trim(),
      linkedHabitIds
    };

    if (editingId) {
      const g = yr.goals.find(x => x.id === editingId);
      if (!g) return;
      Object.assign(g, payload);
      g.milestones = Array.isArray(g.milestones) ? g.milestones : [];
    } else {
      yr.goals.push({
        id: uid(),
        ...payload,
        milestones: []
      });
      editingId = yr.goals[yr.goals.length - 1].id;
    }

    // reverse linking in habits
    const goalId = editingId;
    for (const h of yr.habits) h.linkedGoalIds = (h.linkedGoalIds || []).filter(id => id !== goalId);
    for (const hid of linkedHabitIds) {
      const h = yr.habits.find(x => x.id === hid);
      if (!h) continue;
      h.linkedGoalIds = h.linkedGoalIds || [];
      if (!h.linkedGoalIds.includes(goalId)) h.linkedGoalIds.push(goalId);
    }

    saveDB(db);
    renderGoals(db, year, categoryKey);
  };

  cancelBtn.onclick = reset;

  wrap._startEdit = (goalId) => {
    const g = yr.goals.find(x => x.id === goalId);
    if (!g) return;
    editingId = goalId;
    title.value = g.title || "";
    targetDate.value = g.targetDate || "";
    metric.value = g.metric || "";
    targetValue.value = (g.targetValue === "" || g.targetValue === undefined) ? "" : String(g.targetValue);
    currentValue.value = (g.currentValue === "" || g.currentValue === undefined) ? "" : String(g.currentValue);
    notes.value = g.notes || "";
    renderHabitCheckboxes(g.linkedHabitIds || []);
    cancelBtn.classList.remove("hidden");
    saveBtn.textContent = "Update goal";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  wrap.appendChild(el("div", { class: "grid" }, [
    el("div", {}, [el("div", { class: "muted", html: "Title" }), title]),
    el("div", {}, [el("div", { class: "muted", html: "Target date" }), targetDate]),
    el("div", {}, [el("div", { class: "muted", html: "Metric" }), metric]),
    el("div", {}, [el("div", { class: "muted", html: "Target" }), targetValue]),
    el("div", {}, [el("div", { class: "muted", html: "Current" }), currentValue])
  ]));
  wrap.appendChild(el("div", {}, [el("div", { class: "muted", html: "Notes" }), notes]));
  wrap.appendChild(linkBox);
  wrap.appendChild(el("div", { class: "row" }, [saveBtn, cancelBtn]));

  return wrap;
}

function goalsList(db, year, categoryKey) {
  const yr = getYear(db, year);
  const wrap = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Goals" })
  ]);

  const goals = yr.goals.filter(g => g.category === categoryKey);
  if (!goals.length) {
    wrap.appendChild(el("div", { class: "muted", html: "No goals yet." }));
    return wrap;
  }

  const list = el("div", { class: "list" });
  for (const g of goals) {
    const msCount = (g.milestones || []).length;
    const taskCount = (g.milestones || []).reduce((acc, ms) => acc + (ms.tasks || []).length, 0);
    const doneTasks = (g.milestones || []).reduce((acc, ms) => acc + (ms.tasks || []).filter(t => t.done).length, 0);

    const hasProgress = g.targetValue !== "" && g.currentValue !== "" && Number(g.targetValue) > 0;
    const pct = hasProgress ? Math.round(clamp01(Number(g.currentValue) / Number(g.targetValue)) * 100) : null;

    list.appendChild(el("div", { class: "item" }, [
      el("div", { class: "item-top" }, [
        el("div", {}, [
          el("div", { class: "item-title", html: g.title }),
          el("div", { class: "item-sub", html:
            `Target date: ${g.targetDate || "—"} • ` +
            (hasProgress ? `Progress: <b>${pct}%</b>` : `Progress: —`)
          }),
          el("div", { class: "muted", html: `Milestones: <b>${msCount}</b> • Tasks: <b>${doneTasks}/${taskCount}</b>` })
        ]),
        el("div", { class: "item-actions" }, [
          el("button", { class: "btn small", onclick: () => navTo(`#/year/${year}/goal/${g.id}`) }, [document.createTextNode("Open goal")]),
          el("button", { class: "btn small secondary", onclick: () => {
            const form = view.querySelector(".card.big.stack");
            form?._startEdit?.(g.id);
          } }, [document.createTextNode("Edit")]),
          el("button", { class: "btn small danger", onclick: () => {
            if (!confirm("Delete this goal (and its milestones/tasks)?")) return;
            // unlink from habits
            for (const h of yr.habits) h.linkedGoalIds = (h.linkedGoalIds || []).filter(x => x !== g.id);
            yr.goals = yr.goals.filter(x => x.id !== g.id);
            saveDB(db);
            renderGoals(db, year, categoryKey);
          } }, [document.createTextNode("Delete")])
        ])
      ])
    ]));
  }

  wrap.appendChild(list);
  return wrap;
}

// ---------------- Goal Detail: Milestones + Tasks ----------------
function renderGoalDetail(db, year, goalId) {
  const yr = getYear(db, year);
  const g = yr.goals.find(x => x.id === goalId);
  if (!g) {
    setCrumb(`Year ${year} • Goal`);
    view.innerHTML = "";
    view.appendChild(el("div", { class: "card big stack" }, [
      el("div", { class: "item-title", html: "Goal not found" }),
      el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/goals`) }, [document.createTextNode("Back to goals")])
    ]));
    return;
  }

  g.milestones = Array.isArray(g.milestones) ? g.milestones : [];

  setCrumb(`Year ${year} • Goal • ${g.title}`);
  view.innerHTML = "";

  const back = el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}/goals/${g.category}`) }, [document.createTextNode("← Back to category")]);

  // header card
  const header = el("div", { class: "card big hero" });
  header.appendChild(el("div", { class: "heroGlow" }));
  header.appendChild(el("div", {}, [
    el("div", { class: "kpi", html: g.title }),
    el("div", { class: "muted", html: `${categoryLabel(g.category)} • Target: ${g.targetDate || "—"}` }),
    el("div", { class: "row", style: "margin-top:10px" }, [
      back,
      el("button", { class: "btn", onclick: () => navTo(`#/year/${year}/goals-dashboard`) }, [document.createTextNode("Dashboard")])
    ])
  ]));
  header.insertAdjacentHTML("beforeend", heroSVG());

  // habits attached list (quick)
  const linkedHabits = (g.linkedHabitIds || []).map(id => yr.habits.find(h => h.id === id)).filter(Boolean);
  const habitsCard = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Habits attached to this goal" }),
    el("div", { class: "muted", html: "These habits are your execution system for this goal." })
  ]);
  const hList = el("div", { class: "list" });
  if (!linkedHabits.length) {
    hList.appendChild(el("div", { class: "muted", html: "No habits attached yet. Edit the goal in its category page to attach habits." }));
  } else {
    for (const h of linkedHabits) {
      hList.appendChild(el("div", { class: "item" }, [
        el("div", { class: "item-top" }, [
          el("div", {}, [
            el("div", { class: "item-title", html: h.title }),
            el("div", { class: "item-sub", html: `${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
          ]),
          el("div", { class: "item-actions" }, [
            el("a", { class: "chip", href: `#/year/${year}/habits/${h.category}` }, [document.createTextNode("Open habits")])
          ])
        ])
      ]));
    }
  }
  habitsCard.appendChild(hList);

  // milestone form
  const msForm = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Add milestone" }),
    el("div", { class: "muted", html: "Milestone = intermediate objective. Then add tasks inside it." })
  ]);
  const msTitle = el("input", { class: "input", placeholder: "Milestone title (e.g. Save first 1,000)" });
  const msDue = el("input", { class: "input", type: "date" });
  const addMsBtn = el("button", { class: "btn" }, [document.createTextNode("Add milestone")]);
  addMsBtn.onclick = () => {
    const t = msTitle.value.trim();
    if (!t) return alert("Enter milestone title.");
    g.milestones.push({ id: uid(), title: t, dueDate: msDue.value || "", tasks: [] });
    msTitle.value = "";
    msDue.value = "";
    saveDB(db);
    renderGoalDetail(db, year, goalId);
  };
  msForm.appendChild(el("div", { class: "grid" }, [
    el("div", {}, [el("div", { class: "muted", html: "Title" }), msTitle]),
    el("div", {}, [el("div", { class: "muted", html: "Due date" }), msDue]),
    el("div", {}, [el("div", { class: "muted", html: "&nbsp;" }), addMsBtn])
  ]));

  // milestones list
  const msCard = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Milestones" })
  ]);

  if (!g.milestones.length) {
    msCard.appendChild(el("div", { class: "muted", html: "No milestones yet." }));
  } else {
    const list = el("div", { class: "list" });

    for (const ms of g.milestones) {
      ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
      const done = ms.tasks.filter(t => t.done).length;
      const total = ms.tasks.length;

      const box = el("div", { class: "item stack" });

      // milestone header
      box.appendChild(el("div", { class: "item-top" }, [
        el("div", {}, [
          el("div", { class: "item-title", html: ms.title }),
          el("div", { class: "item-sub", html: `Due: ${ms.dueDate || "—"} • Tasks: ${done}/${total}` })
        ]),
        el("div", { class: "item-actions" }, [
          el("button", { class: "btn small danger", onclick: () => {
            if (!confirm("Delete milestone and its tasks?")) return;
            g.milestones = g.milestones.filter(x => x.id !== ms.id);
            saveDB(db);
            renderGoalDetail(db, year, goalId);
          } }, [document.createTextNode("Delete milestone")])
        ])
      ]));

      // task add
      const taskRow = el("div", { class: "row" });
      const taskTitle = el("input", { class: "input", placeholder: "Add task (e.g. transfer 200 EUR)" });
      const taskDue = el("input", { class: "input", type: "date" });
      const addTaskBtn = el("button", { class: "btn small" }, [document.createTextNode("Add task")]);
      addTaskBtn.onclick = () => {
        const tt = taskTitle.value.trim();
        if (!tt) return alert("Enter task title.");
        ms.tasks.push({ id: uid(), title: tt, dueDate: taskDue.value || "", done: false });
        saveDB(db);
        renderGoalDetail(db, year, goalId);
      };
      taskRow.appendChild(taskTitle);
      taskRow.appendChild(taskDue);
      taskRow.appendChild(addTaskBtn);
      box.appendChild(taskRow);

      // tasks list
      const tlist = el("div", { class: "list" });
      if (!ms.tasks.length) {
        tlist.appendChild(el("div", { class: "muted", html: "No tasks yet." }));
      } else {
        for (const t of ms.tasks) {
          const pill = t.done ? "DONE" : "TODO";
          const item = el("div", { class: "item" }, [
            el("div", { class: "item-top" }, [
              el("div", {}, [
                el("div", { class: "item-title", html: `${t.done ? "✅" : "⬜️"} ${t.title}` }),
                el("div", { class: "item-sub", html: `Due: ${t.dueDate || "—"}` })
              ]),
              el("div", { class: "item-actions" }, [
                el("span", { class: "pill", html: `<b>${pill}</b>` }),
                el("button", { class: "btn small secondary", onclick: () => {
                  t.done = !t.done;
                  saveDB(db);
                  renderGoalDetail(db, year, goalId);
                } }, [document.createTextNode(t.done ? "Undo" : "Complete")]),
                el("button", { class: "btn small danger", onclick: () => {
                  if (!confirm("Delete task?")) return;
                  ms.tasks = ms.tasks.filter(x => x.id !== t.id);
                  saveDB(db);
                  renderGoalDetail(db, year, goalId);
                } }, [document.createTextNode("Delete")])
              ])
            ])
          ]);
          tlist.appendChild(item);
        }
      }
      box.appendChild(tlist);

      list.appendChild(box);
    }

    msCard.appendChild(list);
  }

  view.appendChild(header);
  view.appendChild(habitsCard);
  view.appendChild(msForm);
  view.appendChild(msCard);
}

// ---------------- Goals dashboard (kept) ----------------
function renderGoalsDashboard(db, year) {
  const yr = getYear(db, year);
  setCrumb(`Year ${year} • Goals Dashboard`);
  view.innerHTML = "";

  const back = el("button", { class: "btn secondary", onclick: () => navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

  const top = el("div", { class: "card big stack" }, [
    el("div", { class: "row" }, [
      back,
      el("div", {}, [
        el("div", { class: "item-title", html: "Goals dashboard" }),
        el("div", { class: "muted", html: "Charts use goals with numeric Target+Current." })
      ])
    ])
  ]);

  const goalsWithNums = (yr.goals || []).filter(g => g.targetValue !== "" && g.currentValue !== "" && Number(g.targetValue) > 0);

  const grid = el("div", { class: "grid" });

  const c1 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Average progress by category" }),
    el("div", { class: "chartBox" }, [el("canvas")])
  ]);
  const c2 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Top goals" }),
    el("div", { class: "chartBox" }, [el("canvas")])
  ]);

  const c3 = el("div", { class: "card big stack" }, [
    el("div", { class: "item-title", html: "Milestones & tasks status" }),
    el("div", { class: "muted", html: "This shows execution progress (tasks done) even if you don’t use numeric progress." })
  ]);

  grid.appendChild(c1);
  grid.appendChild(c2);
  grid.appendChild(c3);

  view.appendChild(top);
  view.appendChild(grid);

  // charts
  const catLabels = CATEGORIES.map(c => c.label);
  const catAvg = CATEGORIES.map(c => {
    const arr = goalsWithNums.filter(g => g.category === c.key).map(g => clamp01(Number(g.currentValue) / Number(g.targetValue)));
    return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : 0;
  });
  makeBarChart(c1.querySelector("canvas"), catLabels, catAvg);

  const topGoals = goalsWithNums
    .map(g => ({ title: g.title, pct: Math.round(clamp01(Number(g.currentValue) / Number(g.targetValue)) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
  makeBarChart(c2.querySelector("canvas"), topGoals.map(x => x.title.slice(0, 14)), topGoals.map(x => x.pct));

  // tasks summary list
  const list = el("div", { class: "list" });
  const items = (yr.goals || []).map(g => {
    const milestones = g.milestones || [];
    const tasks = milestones.flatMap(ms => ms.tasks || []);
    const done = tasks.filter(t => t.done).length;
    const total = tasks.length;
    return { g, done, total };
  }).sort((a, b) => (b.done / Math.max(1, b.total)) - (a.done / Math.max(1, a.total)));

  for (const it of items.slice(0, 12)) {
    const pct = it.total ? Math.round((it.done / it.total) * 100) : 0;
    list.appendChild(el("div", { class: "item" }, [
      el("div", { class: "item-top" }, [
        el("div", {}, [
          el("div", { class: "item-title", html: it.g.title }),
          el("div", { class: "item-sub", html: `Tasks: ${it.done}/${it.total} • ${pct}%` })
        ]),
        el("div", { class: "item-actions" }, [
          el("button", { class: "btn small", onclick: () => navTo(`#/year/${year}/goal/${it.g.id}`) }, [document.createTextNode("Open")])
        ])
      ])
    ]));
  }
  if (!items.length) list.appendChild(el("div", { class: "muted", html: "No goals yet." }));
  c3.appendChild(list);
}

// ---------------- Export / Import / Wipe ----------------
exportBtn.onclick = () => {
  const db = ensureDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plans-dashboard-backup.json";
  a.click();
  URL.revokeObjectURL(url);
};

importBtn.onclick = () => importFile.click();
importFile.onchange = () => {
  const f = importFile.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "null"));
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
      const migrated = migrateToV4(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      navTo("#/dashboard");
      render();
    } catch (e) {
      alert("Import failed: " + e.message);
    }
  };
  reader.readAsText(f);
  importFile.value = "";
};

wipeBtn.onclick = () => {
  if (!confirm("This deletes ALL data on this device. Continue?")) return;
  localStorage.removeItem(STORAGE_KEY);
  navTo("#/dashboard");
  render();
};
