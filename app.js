// Plans Dashboard v3 (offline static). Data stored in localStorage.
// Added in v3:
// - Habits calendar: monthly heatmap + per-habit heatmap mode
// - Yearly heatmap overview (all months)
// - Recurrence: x/week restricted to selected weekdays
// - Bimonthly: every 2 months from startDate (if provided)
// - Goals dashboard: deadline risk (on track/behind/overdue)

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "plans_dashboard_v3";
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

const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; // UI

// ---------- Storage ----------
function loadDB() {
  try {
    const db = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (db && typeof db === "object") return db;
  } catch {}

  // migrate from v2/v1 if present
  for (const key of ["plans_dashboard_v2", "plans_dashboard_v1"]) {
    try {
      const old = JSON.parse(localStorage.getItem(key) || "null");
      if (old && typeof old === "object") {
        const migrated = migrateToV3(old);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch {}
  }
  return null;
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function uid() {
  return crypto.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2));
}

function emptyYear() {
  return {
    habits: [],
    goals: [],
    budget: {}
  };
}

function ensureDB() {
  let db = loadDB();
  if (db) return db;

  db = {
    version: 3,
    years: { "2026": emptyYear(), "2027": emptyYear(), "2028": emptyYear() },
    settings: { yearList: [2026, 2027, 2028] }
  };
  saveDB(db);
  return db;
}

function getYear(db, year) {
  const y = String(year);
  if (!db.years[y]) db.years[y] = emptyYear();
  return db.years[y];
}

function addYear(db, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  if (!db.settings.yearList.includes(y)) db.settings.yearList.push(y);
  db.settings.yearList.sort((a,b)=>a-b);
  db.years[String(y)] = db.years[String(y)] || emptyYear();
  saveDB(db);
}

function migrateToV3(old) {
  const v3 = {
    version: 3,
    years: old.years || {},
    settings: old.settings || { yearList: [2026,2027,2028] }
  };
  // normalize
  for (const y of Object.keys(v3.years)) {
    const yr = v3.years[y] || emptyYear();
    yr.habits = yr.habits || [];
    yr.goals = yr.goals || [];
    yr.budget = yr.budget || {};
    for (const h of yr.habits) {
      h.checks = h.checks || {};
      h.linkedGoalIds = h.linkedGoalIds || [];
      h.frequency = normalizeFreq(h.frequency);
    }
    for (const g of yr.goals) g.linkedHabitIds = g.linkedHabitIds || [];
    v3.years[y] = yr;
  }
  return v3;
}

// ---------- Helpers ----------
function el(tag, attrs={}, children=[]) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of children) e.appendChild(c);
  return e;
}

function parseHash() {
  const h = (location.hash || "#/dashboard").replace(/^#/, "");
  return h.split("/").filter(Boolean);
}
function navTo(hash) { location.hash = hash; }
function setCrumb(text) { crumb.textContent = text || ""; }

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function isoToDate(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, (m||1)-1, d||1);
}
function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDays(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return dateToISO(d);
}
function startOfWeekISO(iso) {
  const d = isoToDate(iso);
  const js = d.getDay(); // 0..6
  const mondayOffset = (js === 0 ? -6 : 1 - js);
  d.setDate(d.getDate() + mondayOffset);
  return dateToISO(d);
}
function endOfWeekISO(iso) { return addDays(startOfWeekISO(iso), 6); }

function categoryLabel(key){ return (CATEGORIES.find(c=>c.key===key)?.label) || key; }
function fmtMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// ---------- Recurrence engine ----------
function normalizeFreq(freq) {
  const f = freq || { type:"daily" };
  if (!f.type) f.type = "daily";

  // Types:
  // daily
  // weekdays
  // weekly_days: {days:[1..7]}
  // x_per_week: {times:2} (flexible days)
  // x_per_week_days: {times:2, days:[2,4]} (restricted to specific days)
  // monthly: {day:1}
  // bimonthly: {day:1} (every 2 months from startDate if startDate exists; otherwise odd months)
  // custom: {everyNDays:3}

  if (f.type === "custom") f.everyNDays = Math.max(1, Number(f.everyNDays || 1));
  if (f.type === "weekly_days") f.days = Array.isArray(f.days) ? f.days : [1,3,5];
  if (f.type === "x_per_week") f.times = Math.max(1, Number(f.times || 2));
  if (f.type === "x_per_week_days") {
    f.times = Math.max(1, Number(f.times || 2));
    f.days = Array.isArray(f.days) ? f.days : [2,4];
  }
  if (f.type === "monthly" || f.type === "bimonthly") f.day = Math.max(1, Math.min(31, Number(f.day || 1)));
  return f;
}

function freqLabel(f) {
  f = normalizeFreq(f);
  switch (f.type) {
    case "daily": return "Daily";
    case "weekdays": return "Weekdays only";
    case "weekly_days": return `Weekly: ${f.days.map(d=>DOW[d-1]).join("/")}`;
    case "x_per_week": return `${f.times}x / week (flex)`;
    case "x_per_week_days": return `${f.times}x / week (${f.days.map(d=>DOW[d-1]).join("/")})`;
    case "monthly": return `Monthly (day ${f.day})`;
    case "bimonthly": return `Every 2 months (day ${f.day})`;
    case "custom": return `Every ${f.everyNDays} days`;
    default: return f.type;
  }
}

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
  const js = d.getDay(); // 0 Sun .. 6 Sat
  const dow = js === 0 ? 7 : js; // 1 Mon .. 7 Sun

  if (f.type === "daily") return true;
  if (f.type === "weekdays") return dow >= 1 && dow <= 5;
  if (f.type === "weekly_days") return f.days.includes(dow);

  if (f.type === "monthly") {
    return d.getDate() === f.day;
  }

  if (f.type === "bimonthly") {
    if (d.getDate() !== f.day) return false;

    if (start) {
      // every 2 months from startDate month
      const s = isoToDate(start);
      const monthDiff = (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
      return monthDiff >= 0 && (monthDiff % 2 === 0);
    } else {
      // fallback: odd months
      const month = d.getMonth() + 1;
      return month % 2 === 1;
    }
  }

  if (f.type === "custom") {
    const base = start || `${dateISO.slice(0,4)}-01-01`;
    const diff = Math.floor((isoToDate(dateISO) - isoToDate(base)) / (24*3600*1000));
    return diff >= 0 && diff % f.everyNDays === 0;
  }

  if (f.type === "x_per_week") {
    const wkStart = startOfWeekISO(dateISO);
    const wkEnd = endOfWeekISO(dateISO);
    const done = countChecksInRange(habit, wkStart, wkEnd);
    return done < f.times;
  }

  if (f.type === "x_per_week_days") {
    // restricted to chosen weekdays; due only on those days UNTIL quota reached
    if (!f.days.includes(dow)) return false;
    const wkStart = startOfWeekISO(dateISO);
    const wkEnd = endOfWeekISO(dateISO);
    const done = countChecksInRange(habit, wkStart, wkEnd);
    return done < f.times;
  }

  return false;
}

// streaks
function computeStreaks(habit, upToISO) {
  const checks = habit.checks || {};
  const end = isoToDate(upToISO);
  const start = new Date(end);
  start.setDate(start.getDate() - 365);

  let best = 0;
  let run = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = dateToISO(d);
    if (!isHabitDueOn(habit, iso)) continue;
    if (checks[iso]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  // current streak: backwards on due days
  let current = 0;
  let d = isoToDate(upToISO);
  for (let i=0;i<370;i++){
    const iso = dateToISO(d);
    if (isHabitDueOn(habit, iso)) {
      if (checks[iso]) current++;
      else break;
    }
    d.setDate(d.getDate() - 1);
  }

  return { current, best };
}

// ---------- Router ----------
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/dashboard";

// ---------- Views ----------
function render() {
  const db = ensureDB();
  const parts = parseHash();

  // routes
  // #/dashboard
  // #/year/2026
  // #/year/2026/habits
  // #/year/2026/habits/personal
  // #/year/2026/habits-calendar
  // #/year/2026/habits-yearly
  // #/year/2026/plans
  // #/year/2026/goals
  // #/year/2026/goals/money
  // #/year/2026/goals-dashboard
  // #/year/2026/budget
  // #/year/2026/budget/2026-01

  if (parts[0] === "year" && parts[1]) {
    const year = Number(parts[1]);
    if (!db.settings.yearList.includes(year)) addYear(db, year);
    const section = parts[2] || "";

    if (!section) return renderYearHome(db, year);
    if (section === "habits") return renderHabits(db, year, parts[3] || "");
    if (section === "habits-calendar") return renderHabitsCalendar(db, year);
    if (section === "habits-yearly") return renderHabitsYearly(db, year);
    if (section === "plans") return renderPlans(db, year);
    if (section === "goals") return renderGoals(db, year, parts[3] || "");
    if (section === "goals-dashboard") return renderGoalsDashboard(db, year);
    if (section === "budget") return renderBudget(db, year, parts[3] || "");
  }

  return renderDashboard(db);
}

function renderDashboard(db) {
  setCrumb("Dashboard");
  view.innerHTML = "";

  const yearsCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Years" }),
    el("div", { class:"muted", html:"Tap a year. Each year contains Habits, Goals, Plans and Budget." })
  ]);

  const grid = el("div", { class:"grid" });
  for (const y of db.settings.yearList) {
    const yr = getYear(db, y);
    const box = el("div", { class:"card stack" });
    box.appendChild(el("div", { class:"kpi", html:String(y) }));
    box.appendChild(el("div", { class:"row" }, [
      el("span", { class:"pill", html:`Habits <b>${yr.habits.length}</b>` }),
      el("span", { class:"pill", html:`Goals <b>${yr.goals.length}</b>` }),
      el("span", { class:"pill", html:`Budget months <b>${Object.keys(yr.budget||{}).length}</b>` })
    ]));
    box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${y}`) }, [document.createTextNode("Open")]));
    grid.appendChild(box);
  }
  yearsCard.appendChild(grid);

  const addCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Add a new year" })
  ]);
  const inp = el("input", { class:"input", type:"number", min:"2000", max:"2100", placeholder:"e.g. 2029" });
  addCard.appendChild(inp);
  addCard.appendChild(el("button", {
    class:"btn secondary",
    onclick: () => {
      const y = Number(inp.value);
      if (!Number.isFinite(y) || y < 2000 || y > 2100) return alert("Enter a valid year.");
      addYear(db, y);
      renderDashboard(db);
    }
  }, [document.createTextNode("Add year")]));

  view.appendChild(yearsCard);
  view.appendChild(addCard);
}

function renderYearHome(db, year) {
  const yr = getYear(db, year);
  const today = todayISO();

  setCrumb(`Year ${year}`);
  view.innerHTML = "";

  const checkedToday = yr.habits.filter(h => (h.checks||{})[today]).length;
  const dueToday = yr.habits.filter(h => isHabitDueOn(h, today)).length;

  const grid = el("div", { class:"grid" });

  grid.appendChild(menuCard("Habits", `${yr.habits.length} total • due today ${dueToday} • done ${checkedToday}`, [
    ["Open habits", `#/year/${year}/habits`],
    ["Monthly calendar", `#/year/${year}/habits-calendar`],
    ["Yearly heatmap", `#/year/${year}/habits-yearly`]
  ]));

  grid.appendChild(menuCard("Goals", `${yr.goals.length} total • link habits for execution`, [
    ["Open goals", `#/year/${year}/goals`],
    ["Progress dashboard", `#/year/${year}/goals-dashboard`]
  ]));

  grid.appendChild(menuCard("Plans", "Weekly & monthly breakdown (based on recurrence)", [
    ["Open plans", `#/year/${year}/plans`]
  ]));

  grid.appendChild(menuCard("Budget", "Monthly income/expenses", [
    ["Open budget", `#/year/${year}/budget`]
  ]));

  view.appendChild(grid);

  // quick today list
  const todayCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Today" }),
    el("div", { class:"muted", html:`${today} • Due habits based on recurrence.` })
  ]);

  const due = yr.habits.filter(h => isHabitDueOn(h, today));
  if (!due.length) {
    todayCard.appendChild(el("div", { class:"muted", html:"No habits due today." }));
  } else {
    const list = el("div", { class:"list" });
    for (const h of due) {
      const done = !!(h.checks||{})[today];
      const st = computeStreaks(h, today);
      const it = el("div", { class:"item" });
      it.appendChild(el("div", { class:"item-top" }, [
        el("div", {}, [
          el("div", { class:"item-title", html:`${done ? "✅" : "⬜️"} ${h.title}` }),
          el("div", { class:"item-sub", html:`${categoryLabel(h.category)} • ${freqLabel(h.frequency)} • streak ${st.current} (best ${st.best})` })
        ]),
        el("div", { class:"item-actions" }, [
          el("button", {
            class:"btn small " + (done ? "secondary" : ""),
            onclick: ()=>toggleHabitCheck(db, year, h.id, today)
          }, [document.createTextNode(done ? "Undo" : "Done")])
        ])
      ]));
      list.appendChild(it);
    }
    todayCard.appendChild(list);
  }
  view.appendChild(todayCard);
}

function menuCard(title, subtitle, actions) {
  const c = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:title }),
    el("div", { class:"muted", html:subtitle })
  ]);
  const row = el("div", { class:"row" });
  for (const [label, hash] of actions) {
    row.appendChild(el("button", { class:"btn", onclick: ()=>navTo(hash) }, [document.createTextNode(label)]));
  }
  c.appendChild(row);
  return c;
}

function toggleHabitCheck(db, year, habitId, dateISO) {
  const yr = getYear(db, year);
  const h = yr.habits.find(x=>x.id===habitId);
  if (!h) return;
  h.checks = h.checks || {};
  if (h.checks[dateISO]) delete h.checks[dateISO];
  else h.checks[dateISO] = true;
  saveDB(db);
  render();
}

// ---------- Habits ----------
function renderHabits(db, year, categoryKey) {
  const yr = getYear(db, year);

  if (!categoryKey) {
    setCrumb(`Year ${year} • Habits`);
    view.innerHTML = "";

    const top = el("div", { class:"card stack" });
    top.appendChild(el("div", { class:"row" }, [
      el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
      el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits-calendar`) }, [document.createTextNode("Monthly calendar")]),
      el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits-yearly`) }, [document.createTextNode("Yearly heatmap")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Habits categories" }),
        el("div", { class:"muted", html:"Create habits by category. Set recurrence. Track checks daily." })
      ])
    ]));

    const grid = el("div", { class:"grid" });
    for (const c of CATEGORIES) {
      const count = yr.habits.filter(h=>h.category===c.key).length;
      const box = el("div", { class:"card stack" });
      box.appendChild(el("div", { class:"item-title", html:c.label }));
      box.appendChild(el("div", { class:"muted", html:`${count} habits` }));
      box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits/${c.key}`) }, [document.createTextNode("Open")] ));
      grid.appendChild(box);
    }
    top.appendChild(grid);
    view.appendChild(top);
    return;
  }

  const cat = CATEGORIES.find(c=>c.key===categoryKey);
  setCrumb(`Year ${year} • Habits • ${cat?.label || categoryKey}`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}/habits`) }, [document.createTextNode("← Categories")]);
  const form = habitForm(db, year, categoryKey);
  const list = habitsList(db, year, categoryKey);

  view.appendChild(el("div", { class:"stack" }, [
    el("div", { class:"row" }, [back]),
    form,
    list
  ]));
}

function habitForm(db, year, categoryKey) {
  const yr = getYear(db, year);
  let editingId = null;

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Add / Edit Habit" }));
  wrap.appendChild(el("div", { class:"muted", html:"Supports: Weekdays, Mon/Wed/Fri, X/week (flex), X/week on selected days, Monthly, Bimonthly, Every N days." }));

  const title = el("input", { class:"input", placeholder:"Habit title (e.g. Gym session)" });
  const startDate = el("input", { class:"input", type:"date" });

  const freqType = el("select", { class:"input" });
  const freqOpts = [
    ["daily","Daily"],
    ["weekdays","Weekdays only"],
    ["weekly_days","Specific weekdays (Mon/Wed/Fri)"],
    ["x_per_week","X times per week (flex days)"],
    ["x_per_week_days","X times per week (restricted days)"],
    ["monthly","Monthly (day of month)"],
    ["bimonthly","Every 2 months (from startDate if set)"],
    ["custom","Every N days"]
  ];
  for (const [v,l] of freqOpts) freqType.appendChild(el("option", { value:v }, [document.createTextNode(l)]));

  // weekday pickers
  const makeWeekdayPicker = (defaultDays) => {
    const box = el("div", { class:"card stack", style:"padding:12px; box-shadow:none; background:#fff; border:1px dashed var(--border)" });
    box.appendChild(el("div", { class:"muted", html:"Pick weekdays:" }));
    const row = el("div", { class:"row" });
    const checks = [];
    for (let i=1;i<=7;i++){
      const id = `dow_${i}_${uid()}`;
      const cb = el("input", { type:"checkbox", id });
      cb.checked = defaultDays.includes(i);
      checks.push([i, cb]);
      row.appendChild(el("label", { for:id, class:"pill" }, [cb, document.createTextNode(DOW[i-1])]));
    }
    box.appendChild(row);
    return { box, checks };
  };

  const weeklyDays = makeWeekdayPicker([1,3,5]); // M/W/F
  const restrictedDays = makeWeekdayPicker([2,4]); // Tue/Thu

  const xPerWeekWrap = el("div", { class:"card stack", style:"padding:12px; box-shadow:none; background:#fff; border:1px dashed var(--border)" });
  xPerWeekWrap.appendChild(el("div", { class:"muted", html:"Times per week:" }));
  const times = el("input", { class:"input", type:"number", min:"1", value:"2" });
  xPerWeekWrap.appendChild(times);

  const monthlyWrap = el("div", { class:"card stack", style:"padding:12px; box-shadow:none; background:#fff; border:1px dashed var(--border)" });
  monthlyWrap.appendChild(el("div", { class:"muted", html:"Day of month (1-31):" }));
  const dayOfMonth = el("input", { class:"input", type:"number", min:"1", max:"31", value:"1" });
  monthlyWrap.appendChild(dayOfMonth);

  const customWrap = el("div", { class:"card stack", style:"padding:12px; box-shadow:none; background:#fff; border:1px dashed var(--border)" });
  customWrap.appendChild(el("div", { class:"muted", html:"Every N days:" }));
  const everyNDays = el("input", { class:"input", type:"number", min:"1", value:"3" });
  customWrap.appendChild(everyNDays);

  const notes = el("textarea", { class:"input", placeholder:"Notes (optional)" });

  const saveBtn = el("button", { class:"btn" }, [document.createTextNode("Save habit")]);
  const cancelBtn = el("button", { class:"btn secondary hidden" }, [document.createTextNode("Cancel edit")]);

  function showParamBlocks() {
    weeklyDays.box.classList.add("hidden");
    restrictedDays.box.classList.add("hidden");
    xPerWeekWrap.classList.add("hidden");
    monthlyWrap.classList.add("hidden");
    customWrap.classList.add("hidden");

    if (freqType.value === "weekly_days") weeklyDays.box.classList.remove("hidden");
    if (freqType.value === "x_per_week") xPerWeekWrap.classList.remove("hidden");
    if (freqType.value === "x_per_week_days") { xPerWeekWrap.classList.remove("hidden"); restrictedDays.box.classList.remove("hidden"); }
    if (freqType.value === "monthly" || freqType.value === "bimonthly") monthlyWrap.classList.remove("hidden");
    if (freqType.value === "custom") customWrap.classList.remove("hidden");
  }
  freqType.onchange = showParamBlocks;

  function buildFreq() {
    const t = freqType.value;
    const f = { type: t };

    if (t === "weekly_days") f.days = weeklyDays.checks.filter(([,cb])=>cb.checked).map(([i])=>i);
    if (t === "x_per_week") f.times = Math.max(1, Number(times.value || 1));
    if (t === "x_per_week_days") {
      f.times = Math.max(1, Number(times.value || 1));
      f.days = restrictedDays.checks.filter(([,cb])=>cb.checked).map(([i])=>i);
    }
    if (t === "monthly" || t === "bimonthly") f.day = Math.max(1, Math.min(31, Number(dayOfMonth.value || 1)));
    if (t === "custom") f.everyNDays = Math.max(1, Number(everyNDays.value || 1));

    return normalizeFreq(f);
  }

  function reset() {
    editingId = null;
    title.value = "";
    startDate.value = "";
    freqType.value = "daily";
    times.value = "2";
    dayOfMonth.value = "1";
    everyNDays.value = "3";

    for (const [i,cb] of weeklyDays.checks) cb.checked = [1,3,5].includes(i);
    for (const [i,cb] of restrictedDays.checks) cb.checked = [2,4].includes(i);

    notes.value = "";
    cancelBtn.classList.add("hidden");
    saveBtn.textContent = "Save habit";
    showParamBlocks();
    updatePreview();
  }

  function updatePreview() {
    prev.innerHTML = `<b>${freqLabel(buildFreq())}</b>`;
  }

  saveBtn.onclick = () => {
    const t = title.value.trim();
    if (!t) return alert("Enter a habit title.");

    const payload = {
      title: t,
      category: categoryKey,
      startDate: startDate.value || "",
      frequency: buildFreq(),
      notes: notes.value.trim(),
    };

    if (editingId) {
      const h = yr.habits.find(x=>x.id===editingId);
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
    const h = yr.habits.find(x=>x.id===habitId);
    if (!h) return;

    editingId = habitId;
    title.value = h.title || "";
    startDate.value = h.startDate || "";

    const f = normalizeFreq(h.frequency);
    freqType.value = f.type || "daily";

    // set params
    for (const [i,cb] of weeklyDays.checks) cb.checked = (f.days || []).includes(i);
    for (const [i,cb] of restrictedDays.checks) cb.checked = (f.days || []).includes(i);

    times.value = String(f.times || 2);
    dayOfMonth.value = String(f.day || 1);
    everyNDays.value = String(f.everyNDays || 3);

    notes.value = h.notes || "";
    cancelBtn.classList.remove("hidden");
    saveBtn.textContent = "Update habit";
    showParamBlocks();
    updatePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  showParamBlocks();

  const prev = el("div", { class:"pill" }, [document.createTextNode("")]);

  // live preview listeners
  freqType.addEventListener("change", updatePreview);
  times.addEventListener("input", updatePreview);
  dayOfMonth.addEventListener("input", updatePreview);
  everyNDays.addEventListener("input", updatePreview);
  for (const [,cb] of weeklyDays.checks) cb.addEventListener("change", updatePreview);
  for (const [,cb] of restrictedDays.checks) cb.addEventListener("change", updatePreview);
  updatePreview();

  wrap.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("div", { class:"muted", html:"Title" }), title]),
    el("div", {}, [el("div", { class:"muted", html:"Start date" }), startDate]),
    el("div", {}, [el("div", { class:"muted", html:"Recurrence type" }), freqType]),
    el("div", {}, [el("div", { class:"muted", html:"Preview" }), prev])
  ]));

  wrap.appendChild(weeklyDays.box);
  wrap.appendChild(xPerWeekWrap);
  wrap.appendChild(restrictedDays.box);
  wrap.appendChild(monthlyWrap);
  wrap.appendChild(customWrap);

  wrap.appendChild(el("div", {}, [el("div", { class:"muted", html:"Notes" }), notes]));
  wrap.appendChild(el("div", { class:"row" }, [saveBtn, cancelBtn]));
  return wrap;
}

function habitsList(db, year, categoryKey) {
  const yr = getYear(db, year);

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Habits in this category" }));

  const habits = yr.habits.filter(h=>h.category===categoryKey);
  if (!habits.length) {
    wrap.appendChild(el("div", { class:"muted", html:"No habits yet." }));
    return wrap;
  }

  function findFormCard() {
    const cards = view.querySelectorAll(".card");
    for (const c of cards) if (c.textContent.includes("Add / Edit Habit")) return c;
    return null;
  }

  const list = el("div", { class:"list" });
  const today = todayISO();

  for (const h of habits) {
    const st = computeStreaks(h, today);
    const it = el("div", { class:"item" });
    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html: h.title }),
        el("div", { class:"item-sub", html: `${freqLabel(h.frequency)} • streak ${st.current} (best ${st.best})` }),
        h.notes ? el("div", { class:"muted", html:h.notes }) : el("div")
      ]),
      el("div", { class:"item-actions" }, [
        el("button", { class:"btn small secondary", onclick: ()=> {
          const form = findFormCard();
          if (form && form._startEdit) form._startEdit(h.id);
        }}, [document.createTextNode("Edit")]),
        el("button", { class:"btn small danger", onclick: ()=> {
          if (!confirm("Delete this habit?")) return;
          for (const g of yr.goals) g.linkedHabitIds = (g.linkedHabitIds || []).filter(x=>x!==h.id);
          yr.habits = yr.habits.filter(x=>x.id!==h.id);
          saveDB(db);
          renderHabits(db, year, categoryKey);
        }}, [document.createTextNode("Delete")])
      ])
    ]));
    list.appendChild(it);
  }

  wrap.appendChild(list);
  return wrap;
}

// ---------- Habits Calendar (monthly heatmap + per-habit mode) ----------
function renderHabitsCalendar(db, year) {
  const yr = getYear(db, year);
  setCrumb(`Year ${year} • Habits Calendar`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

  const top = el("div", { class:"card stack" }, [
    el("div", { class:"row" }, [
      back,
      el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits-yearly`) }, [document.createTextNode("Yearly heatmap")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Monthly heatmap" }),
        el("div", { class:"muted", html:"Mode: total completed per day OR a specific habit (due vs done)." })
      ])
    ])
  ]);

  const monthSel = el("select", { class:"input" });
  for (let m=1; m<=12; m++) monthSel.appendChild(el("option", { value:`${year}-${String(m).padStart(2,"0")}` }, [document.createTextNode(`${year}-${String(m).padStart(2,"0")}`)]));
  monthSel.value = `${year}-${todayISO().slice(5,7)}`;

  const modeSel = el("select", { class:"input" });
  modeSel.appendChild(el("option", { value:"total" }, [document.createTextNode("Mode: Total done/day")]));
  modeSel.appendChild(el("option", { value:"habit" }, [document.createTextNode("Mode: Specific habit (due/done)")]));

  const habitSel = el("select", { class:"input" });
  habitSel.appendChild(el("option", { value:"" }, [document.createTextNode("Select habit…")] ));
  for (const h of yr.habits.slice().sort((a,b)=>a.title.localeCompare(b.title))) {
    habitSel.appendChild(el("option", { value:h.id }, [document.createTextNode(`${h.title} (${categoryLabel(h.category)})`)]));
  }
  habitSel.disabled = true;

  modeSel.onchange = () => {
    habitSel.disabled = (modeSel.value !== "habit");
    renderMonth();
  };
  habitSel.onchange = renderMonth;
  monthSel.onchange = renderMonth;

  const controls = el("div", { class:"card stack" }, [
    el("div", { class:"grid" }, [
      el("div", {}, [el("div", { class:"muted", html:"Month" }), monthSel]),
      el("div", {}, [el("div", { class:"muted", html:"View mode" }), modeSel]),
      el("div", {}, [el("div", { class:"muted", html:"Habit" }), habitSel]),
      el("div", {}, [el("div", { class:"muted", html:"Tip" }), el("div", { class:"muted", html:"Tap a day cell to open details and toggle Done." })])
    ])
  ]);

  const calCard = el("div", { class:"card stack" });
  const headers = el("div", { class:"calendar", style:"margin-top:6px" });
  for (const h of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) headers.appendChild(el("div", { class:"cal-head" }, [document.createTextNode(h)]));

  const cal = el("div", { class:"calendar" });
  calCard.appendChild(headers);
  calCard.appendChild(cal);

  const details = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Day details" }),
    el("div", { class:"muted", html:"Tap a day cell." })
  ]);

  // streak list
  const streaksCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Streaks (all habits)" }),
    el("div", { class:"muted", html:"Streak counts consecutive *due* days completed." })
  ]);

  if (!yr.habits.length) {
    streaksCard.appendChild(el("div", { class:"muted", html:"No habits yet." }));
  } else {
    const list = el("div", { class:"list" });
    const today = todayISO();
    const sorted = yr.habits.slice().sort((a,b)=>computeStreaks(b, today).current - computeStreaks(a, today).current);
    for (const h of sorted) {
      const st = computeStreaks(h, today);
      list.appendChild(el("div", { class:"item" }, [
        el("div", { class:"item-top" }, [
          el("div", {}, [
            el("div", { class:"item-title", html:h.title }),
            el("div", { class:"item-sub", html:`${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
          ]),
          el("div", { class:"row" }, [
            el("span", { class:"pill", html:`streak <b>${st.current}</b>` }),
            el("span", { class:"pill", html:`best <b>${st.best}</b>` })
          ])
        ])
      ]));
    }
    streaksCard.appendChild(list);
  }

  function renderMonth() {
    cal.innerHTML = "";
    const mk = monthSel.value;
    const first = isoToDate(`${mk}-01`);
    const firstDow = (first.getDay() === 0 ? 7 : first.getDay()); // 1..7
    const daysInMonth = new Date(first.getFullYear(), first.getMonth()+1, 0).getDate();

    // counts & scaling
    let max = 0;
    const counts = {};

    let habit = null;
    if (modeSel.value === "habit") {
      habit = yr.habits.find(h=>h.id === habitSel.value) || null;
    }

    for (let day=1; day<=daysInMonth; day++) {
      const iso = `${mk}-${String(day).padStart(2,"0")}`;

      let val = 0;
      if (modeSel.value === "total") {
        val = yr.habits.filter(h => (h.checks||{})[iso]).length;
      } else if (habit) {
        // 0 = not due, 1 = due not done, 2 = due done (we’ll map to intensity)
        const due = isHabitDueOn(habit, iso);
        const done = !!(habit.checks||{})[iso];
        val = due ? (done ? 2 : 1) : 0;
      }
      counts[iso] = val;
      max = Math.max(max, val);
    }

    // ghost leading
    for (let i=1;i<firstDow;i++) cal.appendChild(el("div", { class:"day ghost" }, [el("div", { class:"d", html:"" }), el("div", { class:"c", html:"" })]));

    for (let day=1; day<=daysInMonth; day++) {
      const iso = `${mk}-${String(day).padStart(2,"0")}`;
      const v = counts[iso];

      // intensity
      let intensity = 0;
      if (modeSel.value === "total") intensity = max ? Math.round((v / max) * 10) : 0;
      else intensity = (v === 2 ? 10 : v === 1 ? 6 : 0);

      const bg = intensity === 0 ? "#fff" : `rgba(0,0,0,${0.04 + intensity*0.05})`;
      const txt = intensity >= 7 ? "#fff" : "#0b0b0b";

      const cell = el("div", { class:"day clickable" });
      cell.style.background = bg;
      cell.style.color = txt;

      cell.appendChild(el("div", { class:"d", html:String(day) }));

      if (modeSel.value === "total") {
        cell.appendChild(el("div", { class:"c", html:`done ${v}` }));
      } else {
        if (!habit) cell.appendChild(el("div", { class:"c", html:"pick habit" }));
        else cell.appendChild(el("div", { class:"c", html: v===0 ? "not due" : v===1 ? "due" : "done" }));
      }

      cell.onclick = () => showDayDetails(iso);
      cal.appendChild(cell);
    }
  }

  function showDayDetails(iso) {
    if (modeSel.value === "habit") {
      const h = yr.habits.find(x=>x.id === habitSel.value);
      const body = el("div", { class:"list" });
      body.appendChild(el("div", { class:"muted", html:`<b>${iso}</b> • habit view` }));
      if (!h) {
        body.appendChild(el("div", { class:"muted", html:"Select a habit first." }));
      } else {
        const due = isHabitDueOn(h, iso);
        const done = !!(h.checks||{})[iso];

        const it = el("div", { class:"item" });
        it.appendChild(el("div", { class:"item-top" }, [
          el("div", {}, [
            el("div", { class:"item-title", html:`${done ? "✅" : "⬜️"} ${h.title}` }),
            el("div", { class:"item-sub", html:`${categoryLabel(h.category)} • ${freqLabel(h.frequency)} • ${due ? "DUE" : "NOT DUE"}` })
          ]),
          el("div", { class:"item-actions" }, [
            el("button", {
              class:"btn small " + (done ? "secondary" : ""),
              onclick: ()=>{ if (due) toggleHabitCheck(db, year, h.id, iso); else alert("Not due that day."); showDayDetails(iso); renderMonth(); }
            }, [document.createTextNode(done ? "Undo" : "Done")])
          ])
        ]));
        body.appendChild(it);
      }
      details.replaceChildren(el("div", { class:"item-title", html:"Day details" }), body);
      return;
    }

    // total mode
    const due = yr.habits.filter(h => isHabitDueOn(h, iso));
    const done = yr.habits.filter(h => (h.checks||{})[iso]);

    const list = el("div", { class:"list" });
    list.appendChild(el("div", { class:"muted", html:`<b>${iso}</b> • due ${due.length} • done ${done.length}` }));

    if (!due.length) {
      list.appendChild(el("div", { class:"muted", html:"No habits due that day." }));
    } else {
      for (const h of due) {
        const isDone = !!(h.checks||{})[iso];
        const it = el("div", { class:"item" });
        it.appendChild(el("div", { class:"item-top" }, [
          el("div", {}, [
            el("div", { class:"item-title", html:`${isDone ? "✅" : "⬜️"} ${h.title}` }),
            el("div", { class:"item-sub", html:`${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
          ]),
          el("div", { class:"item-actions" }, [
            el("button", {
              class:"btn small " + (isDone ? "secondary" : ""),
              onclick: ()=>{ toggleHabitCheck(db, year, h.id, iso); showDayDetails(iso); renderMonth(); }
            }, [document.createTextNode(isDone ? "Undo" : "Done")])
          ])
        ]));
        list.appendChild(it);
      }
    }

    details.replaceChildren(el("div", { class:"item-title", html:"Day details" }), list);
  }

  view.appendChild(top);
  view.appendChild(controls);
  view.appendChild(calCard);
  view.appendChild(details);
  view.appendChild(streaksCard);

  renderMonth();
}

// ---------- Yearly heatmap (12 months) ----------
function renderHabitsYearly(db, year) {
  const yr = getYear(db, year);
  setCrumb(`Year ${year} • Yearly heatmap`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

  const top = el("div", { class:"card stack" }, [
    el("div", { class:"row" }, [
      back,
      el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits-calendar`) }, [document.createTextNode("Monthly view")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Yearly heatmap" }),
        el("div", { class:"muted", html:"Shows total completed habits per day for the whole year." })
      ])
    ])
  ]);

  // compute per-day done across year for scaling
  const doneCountByDay = {};
  let max = 0;
  for (let m=1;m<=12;m++){
    const mk = `${year}-${String(m).padStart(2,"0")}`;
    const daysInMonth = new Date(year, m, 0).getDate();
    for (let d=1; d<=daysInMonth; d++){
      const iso = `${mk}-${String(d).padStart(2,"0")}`;
      const c = yr.habits.filter(h => (h.checks||{})[iso]).length;
      doneCountByDay[iso] = c;
      max = Math.max(max, c);
    }
  }

  const grid = el("div", { class:"stack" });
  for (let m=1;m<=12;m++){
    const mk = `${year}-${String(m).padStart(2,"0")}`;

    const monthCard = el("div", { class:"card stack" });
    monthCard.appendChild(el("div", { class:"row" }, [
      el("div", { class:"item-title", html: mk }),
      el("button", { class:"btn small secondary", onclick: ()=>navTo(`#/year/${year}/habits-calendar`) }, [document.createTextNode("Open monthly")])
    ]));

    const headers = el("div", { class:"calendar", style:"margin-top:6px" });
    for (const h of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) headers.appendChild(el("div", { class:"cal-head" }, [document.createTextNode(h)]));

    const cal = el("div", { class:"calendar" });

    const first = isoToDate(`${mk}-01`);
    const firstDow = (first.getDay() === 0 ? 7 : first.getDay());
    const daysInMonth = new Date(first.getFullYear(), first.getMonth()+1, 0).getDate();

    for (let i=1;i<firstDow;i++){
      cal.appendChild(el("div", { class:"day ghost" }, [el("div", { class:"d", html:"" }), el("div", { class:"c", html:"" })]));
    }

    for (let day=1; day<=daysInMonth; day++){
      const iso = `${mk}-${String(day).padStart(2,"0")}`;
      const v = doneCountByDay[iso] || 0;
      const intensity = max ? Math.round((v / max) * 10) : 0;
      const bg = intensity === 0 ? "#fff" : `rgba(0,0,0,${0.04 + intensity*0.05})`;
      const txt = intensity >= 7 ? "#fff" : "#0b0b0b";

      const cell = el("div", { class:"day clickable" });
      cell.style.background = bg;
      cell.style.color = txt;
      cell.appendChild(el("div", { class:"d", html:String(day) }));
      cell.appendChild(el("div", { class:"c", html:`${v}` }));

      cell.onclick = () => navTo(`#/year/${year}/habits-calendar`);
      cal.appendChild(cell);
    }

    monthCard.appendChild(headers);
    monthCard.appendChild(cal);
    grid.appendChild(monthCard);
  }

  view.appendChild(top);
  view.appendChild(grid);
}

// ---------- Plans ----------
function renderPlans(db, year) {
  const yr = getYear(db, year);
  setCrumb(`Year ${year} • Plans`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

  const top = el("div", { class:"card stack" }, [
    el("div", { class:"row" }, [
      back,
      el("div", {}, [
        el("div", { class:"item-title", html:"Spaced plans" }),
        el("div", { class:"muted", html:"Breakdown of what’s due today, this week, and this month (based on recurrence)." })
      ])
    ])
  ]);

  const today = todayISO();
  const wkStart = startOfWeekISO(today);
  const wkEnd = endOfWeekISO(today);

  const month = today.slice(0,7);
  const monthStart = `${month}-01`;
  const monthEndDate = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
  const monthEnd = `${month}-${String(monthEndDate).padStart(2,"0")}`;

  const todayDue = yr.habits.filter(h => isHabitDueOn(h, today));
  const weekSchedule = buildScheduleForRange(yr.habits, wkStart, wkEnd);
  const monthSchedule = buildScheduleForRange(yr.habits, monthStart, monthEnd);

  const todayCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Today" }),
    el("div", { class:"muted", html:`${today} • due: ${todayDue.length}` }),
    renderScheduleList(db, year, today, todayDue)
  ]);

  const weekCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"This week" }),
    el("div", { class:"muted", html:`${wkStart} → ${wkEnd}` }),
    renderScheduleByDay(db, year, weekSchedule)
  ]);

  const monthCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"This month" }),
    el("div", { class:"muted", html:`${monthStart} → ${monthEnd}` }),
    renderScheduleByDay(db, year, monthSchedule)
  ]);

  view.appendChild(top);
  view.appendChild(el("div", { class:"stack" }, [todayCard, weekCard, monthCard]));
}

function buildScheduleForRange(habits, fromISO, toISO) {
  const map = {};
  let cur = fromISO;
  while (cur <= toISO) {
    map[cur] = habits.filter(h => isHabitDueOn(h, cur));
    cur = addDays(cur, 1);
  }
  return map;
}

function renderScheduleByDay(db, year, scheduleMap) {
  const list = el("div", { class:"list" });
  for (const dateISO of Object.keys(scheduleMap).sort()) {
    const due = scheduleMap[dateISO] || [];
    if (!due.length) continue;

    const item = el("div", { class:"item stack" });
    item.appendChild(el("div", { class:"item-title", html:`${dateISO} • due ${due.length}` }));
    item.appendChild(renderScheduleList(db, year, dateISO, due));
    list.appendChild(item);
  }
  if (!list.children.length) return el("div", { class:"muted", html:"Nothing scheduled in this range." });
  return list;
}

function renderScheduleList(db, year, dateISO, dueHabits) {
  const list = el("div", { class:"list" });

  if (!dueHabits.length) {
    list.appendChild(el("div", { class:"muted", html:"No habits due." }));
    return list;
  }

  for (const h of dueHabits) {
    const done = !!(h.checks||{})[dateISO];
    const it = el("div", { class:"item" });
    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html:`${done ? "✅" : "⬜️"} ${h.title}` }),
        el("div", { class:"item-sub", html:`${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
      ]),
      el("div", { class:"item-actions" }, [
        el("button", {
          class:"btn small " + (done ? "secondary" : ""),
          onclick: ()=>toggleHabitCheck(db, year, h.id, dateISO)
        }, [document.createTextNode(done ? "Undo" : "Done")])
      ])
    ]));
    list.appendChild(it);
  }

  return list;
}

// ---------- Goals ----------
function renderGoals(db, year, categoryKey) {
  const yr = getYear(db, year);

  if (!categoryKey) {
    setCrumb(`Year ${year} • Goals`);
    view.innerHTML = "";

    const top = el("div", { class:"card stack" });
    top.appendChild(el("div", { class:"row" }, [
      el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
      el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/goals-dashboard`) }, [document.createTextNode("Progress dashboard")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Goals categories" }),
        el("div", { class:"muted", html:"Goals can be linked to habits (execution system)." })
      ])
    ]));

    const grid = el("div", { class:"grid" });
    for (const c of CATEGORIES) {
      const count = yr.goals.filter(g=>g.category===c.key).length;
      const box = el("div", { class:"card stack" });
      box.appendChild(el("div", { class:"item-title", html:c.label }));
      box.appendChild(el("div", { class:"muted", html:`${count} goals` }));
      box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/goals/${c.key}`) }, [document.createTextNode("Open")] ));
      grid.appendChild(box);
    }
    top.appendChild(grid);
    view.appendChild(top);
    return;
  }

  const cat = CATEGORIES.find(c=>c.key===categoryKey);
  setCrumb(`Year ${year} • Goals • ${cat?.label || categoryKey}`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}/goals`) }, [document.createTextNode("← Categories")]);

  const form = goalForm(db, year, categoryKey);
  const list = goalsList(db, year, categoryKey);

  view.appendChild(el("div", { class:"stack" }, [
    el("div", { class:"row" }, [back]),
    form,
    list
  ]));
}

function goalForm(db, year, categoryKey) {
  const yr = getYear(db, year);
  let editingId = null;

  const wrap = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Add / Edit Goal" }),
    el("div", { class:"muted", html:"Fill Current + Target to show charts. Use Target date for deadline risk." })
  ]);

  const title = el("input", { class:"input", placeholder:"Goal title (e.g. Save 10,000)" });
  const targetDate = el("input", { class:"input", type:"date" });
  const metric = el("input", { class:"input", placeholder:"Metric (e.g. EUR / kg / hours)" });
  const targetValue = el("input", { class:"input", type:"number", placeholder:"Target value (optional)" });
  const currentValue = el("input", { class:"input", type:"number", placeholder:"Current value (optional)" });
  const notes = el("textarea", { class:"input", placeholder:"Notes (optional)" });

  const habitsWrap = el("div", { class:"stack" }, [
    el("div", { class:"muted", html:"Link habits (same category) to this goal:" })
  ]);

  function renderHabitCheckboxes(selectedIds = []) {
    habitsWrap.querySelectorAll(".list").forEach(n => n.remove());
    const list = el("div", { class:"list" });
    const habits = yr.habits.filter(h => h.category === categoryKey);
    if (!habits.length) {
      list.appendChild(el("div", { class:"muted", html:"No habits in this category yet." }));
      habitsWrap.appendChild(list);
      return;
    }
    for (const h of habits) {
      const id = `hb_${h.id}`;
      const cb = el("input", { type:"checkbox", id });
      cb.checked = selectedIds.includes(h.id);
      list.appendChild(el("div", { class:"item" }, [
        el("label", { for:id, class:"row" }, [cb, el("span", { html: h.title })])
      ]));
    }
    habitsWrap.appendChild(list);
  }
  renderHabitCheckboxes([]);

  const saveBtn = el("button", { class:"btn" }, [document.createTextNode("Save goal")]);
  const cancelBtn = el("button", { class:"btn secondary hidden" }, [document.createTextNode("Cancel edit")]);

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
    const habits = yr.habits.filter(h => h.category === categoryKey);
    for (const h of habits) {
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
      const g = yr.goals.find(x=>x.id===editingId);
      if (!g) return;
      Object.assign(g, payload);
    } else {
      yr.goals.push({ id: uid(), ...payload });
    }

    // reverse links in habits
    const goalId = editingId || yr.goals[yr.goals.length - 1].id;
    for (const h of yr.habits) h.linkedGoalIds = (h.linkedGoalIds || []).filter(id => id !== goalId);
    for (const hid of linkedHabitIds) {
      const h = yr.habits.find(x=>x.id===hid);
      if (!h) continue;
      h.linkedGoalIds = h.linkedGoalIds || [];
      if (!h.linkedGoalIds.includes(goalId)) h.linkedGoalIds.push(goalId);
    }

    saveDB(db);
    renderGoals(db, year, categoryKey);
  };

  cancelBtn.onclick = reset;

  wrap._startEdit = (goalId) => {
    const g = yr.goals.find(x=>x.id===goalId);
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

  wrap.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("div", { class:"muted", html:"Title" }), title]),
    el("div", {}, [el("div", { class:"muted", html:"Target date" }), targetDate]),
    el("div", {}, [el("div", { class:"muted", html:"Metric" }), metric]),
    el("div", {}, [el("div", { class:"muted", html:"Target" }), targetValue]),
    el("div", {}, [el("div", { class:"muted", html:"Current" }), currentValue]),
  ]));
  wrap.appendChild(el("div", {}, [el("div", { class:"muted", html:"Notes" }), notes]));
  wrap.appendChild(habitsWrap);
  wrap.appendChild(el("div", { class:"row" }, [saveBtn, cancelBtn]));
  return wrap;
}

function goalsList(db, year, categoryKey) {
  const yr = getYear(db, year);

  const wrap = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Goals in this category" })
  ]);

  const goals = yr.goals.filter(g=>g.category===categoryKey);
  if (!goals.length) {
    wrap.appendChild(el("div", { class:"muted", html:"No goals yet." }));
    return wrap;
  }

  function findFormCard() {
    const cards = view.querySelectorAll(".card");
    for (const c of cards) if (c.textContent.includes("Add / Edit Goal")) return c;
    return null;
  }

  const list = el("div", { class:"list" });

  for (const g of goals) {
    const linkedHabits = (g.linkedHabitIds || []).map(id => yr.habits.find(h=>h.id===id)?.title).filter(Boolean);

    const hasProgress = g.targetValue !== "" && g.currentValue !== "" && Number(g.targetValue)>0;
    const pct = hasProgress ? clamp01(Number(g.currentValue)/Number(g.targetValue)) : null;

    const it = el("div", { class:"item" });
    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html: g.title }),
        el("div", { class:"item-sub", html:
          `Target: ${g.targetDate || "—"} • ` +
          (hasProgress ? `Progress: ${Math.round(pct*100)}% (${g.currentValue}/${g.targetValue} ${g.metric||""})` : `Progress: ${g.metric || "—"}`)
        }),
        el("div", { class:"muted", html: linkedHabits.length ? `Linked habits: ${linkedHabits.join(", ")}` : "Linked habits: —" })
      ]),
      el("div", { class:"item-actions" }, [
        el("button", { class:"btn small secondary", onclick: ()=> {
          const form = findFormCard();
          if (form && form._startEdit) form._startEdit(g.id);
        }}, [document.createTextNode("Edit")]),
        el("button", { class:"btn small danger", onclick: ()=> {
          if (!confirm("Delete this goal?")) return;
          for (const h of yr.habits) h.linkedGoalIds = (h.linkedGoalIds || []).filter(x=>x!==g.id);
          yr.goals = yr.goals.filter(x=>x.id!==g.id);
          saveDB(db);
          renderGoals(db, year, categoryKey);
        }}, [document.createTextNode("Delete")])
      ])
    ]));

    if (hasProgress) {
      const bar = el("div", { style:"height:10px; border-radius:999px; background:#eee; overflow:hidden; margin-top:8px" });
      const fill = el("div", { style:`height:100%; width:${Math.round(pct*100)}%; background:#111;` });
      bar.appendChild(fill);
      it.appendChild(bar);
    }
    if (g.notes) it.appendChild(el("div", { class:"muted", html:g.notes }));
    list.appendChild(it);
  }

  wrap.appendChild(list);
  return wrap;
}

// ---------- Goals Dashboard (charts + deadline risk) ----------
function renderGoalsDashboard(db, year) {
  const yr = getYear(db, year);
  setCrumb(`Year ${year} • Goals Dashboard`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

  const top = el("div", { class:"card stack" }, [
    el("div", { class:"row" }, [
      back,
      el("div", {}, [
        el("div", { class:"item-title", html:"Goal progress dashboard" }),
        el("div", { class:"muted", html:"Charts include goals with Current + Target. Risk uses targetDate vs progress." })
      ])
    ])
  ]);

  const goalsWithProgress = yr.goals.filter(g =>
    g.targetValue !== "" && g.targetValue !== undefined &&
    g.currentValue !== "" && g.currentValue !== undefined &&
    Number(g.targetValue) > 0
  );

  const summary = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Summary" }),
    el("div", { class:"row" }, [
      el("span", { class:"pill", html:`Total goals <b>${yr.goals.length}</b>` }),
      el("span", { class:"pill", html:`With progress <b>${goalsWithProgress.length}</b>` })
    ])
  ]);

  // avg by category
  const byCat = {};
  for (const c of CATEGORIES) byCat[c.key] = { sum:0, n:0 };
  for (const g of goalsWithProgress) {
    const pct = clamp01(Number(g.currentValue)/Number(g.targetValue));
    if (!byCat[g.category]) byCat[g.category] = { sum:0, n:0 };
    byCat[g.category].sum += pct;
    byCat[g.category].n += 1;
  }

  const catChartCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Average progress by category" })
  ]);
  const canvas1 = el("canvas", { width:"800", height:"240" });
  catChartCard.appendChild(canvas1);

  const goalsChartCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Top goals by progress" })
  ]);
  const canvas2 = el("canvas", { width:"800", height:"260" });
  goalsChartCard.appendChild(canvas2);

  const riskCard = el("div", { class:"card stack" }, [
    el("div", { class:"item-title", html:"Deadline risk" }),
    el("div", { class:"muted", html:"On track = progress ≥ time elapsed. Behind = progress < time elapsed. Overdue = past target date." })
  ]);

  riskCard.appendChild(renderRiskList(goalsWithProgress));

  view.appendChild(top);
  view.appendChild(summary);
  view.appendChild(catChartCard);
  view.appendChild(goalsChartCard);
  view.appendChild(riskCard);

  drawCategoryBarChart(canvas1, byCat);
  drawGoalsBarChart(canvas2, goalsWithProgress);
}

function renderRiskList(goalsWithProgress) {
  const list = el("div", { class:"list" });

  const today = isoToDate(todayISO());

  const items = goalsWithProgress.map(g => {
    const pct = clamp01(Number(g.currentValue)/Number(g.targetValue));
    if (!g.targetDate) return { g, status:"No date", score:0.5 };

    const td = isoToDate(g.targetDate);
    const start = new Date(td); // assume year start if unknown -> use Jan 1 same year as targetDate
    start.setFullYear(td.getFullYear(), 0, 1);

    const total = (td - start) / (24*3600*1000);
    const elapsed = (today - start) / (24*3600*1000);

    if (today > td) return { g, status:"Overdue", score: 2 };

    const tfrac = total > 0 ? clamp01(elapsed / total) : 0;
    const status = pct + 0.02 >= tfrac ? "On track" : "Behind"; // tiny grace
    const score = status === "Behind" ? 1 : 0;
    return { g, status, score };
  });

  items.sort((a,b)=>b.score - a.score);

  for (const it of items) {
    const g = it.g;
    const pct = clamp01(Number(g.currentValue)/Number(g.targetValue));
    const pillText =
      it.status === "Overdue" ? "OVERDUE" :
      it.status === "Behind" ? "BEHIND" :
      it.status === "On track" ? "ON TRACK" : "NO DATE";

    const row = el("div", { class:"item" });
    row.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html:g.title }),
        el("div", { class:"item-sub", html:`Target date: ${g.targetDate || "—"} • Progress ${Math.round(pct*100)}%` })
      ]),
      el("span", { class:"pill", html:`<b>${pillText}</b>` })
    ]));
    list.appendChild(row);
  }

  if (!items.length) list.appendChild(el("div", { class:"muted", html:"No goals with progress numbers yet." }));
  return list;
}

// charts (B/W)
function drawCategoryBarChart(canvas, byCat) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const labels = CATEGORIES.map(c=>c.label);
  const values = CATEGORIES.map(c=>{
    const v = byCat[c.key];
    return v.n ? (v.sum / v.n) : 0;
  });

  drawBars(ctx, labels, values, W, H, { valueFormat: v=>`${Math.round(v*100)}%` });
}

function drawGoalsBarChart(canvas, goals) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const sorted = goals.slice()
    .sort((a,b)=> (Number(b.currentValue)/Number(b.targetValue)) - (Number(a.currentValue)/Number(a.targetValue)))
    .slice(0,10);

  const labels = sorted.map(g=>g.title.length > 18 ? g.title.slice(0,18)+"…" : g.title);
  const values = sorted.map(g=>clamp01(Number(g.currentValue)/Number(g.targetValue)));

  drawBars(ctx, labels, values, W, H, { valueFormat: v=>`${Math.round(v*100)}%` });
}

function drawBars(ctx, labels, values, W, H, opts={}) {
  const pad = 24;
  const chartH = H - pad*2 - 20;
  const chartW = W - pad*2;
  const n = labels.length;
  const max = 1;
  const barW = chartW / Math.max(1,n);

  ctx.fillStyle = "#0b0b0b";
  ctx.font = "12px -apple-system, system-ui, Arial";
  ctx.textBaseline = "middle";

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  for (const p of [0,0.5,1]) {
    const y = pad + (1 - p) * chartH;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W-pad, y); ctx.stroke();
    ctx.fillText(`${Math.round(p*100)}%`, 6, y);
  }

  for (let i=0;i<n;i++){
    const v = clamp01(values[i] || 0);
    const x = pad + i*barW + barW*0.15;
    const bw = barW*0.7;
    const bh = v/max * chartH;
    const y = pad + (chartH - bh);

    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(x, y, bw, bh);

    ctx.save();
    ctx.translate(x + bw/2, H - pad + 6);
    ctx.rotate(-0.45);
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], 0, 0);
    ctx.restore();

    ctx.fillStyle = "#0b0b0b";
    ctx.textAlign = "center";
    const vf = opts.valueFormat ? opts.valueFormat(v) : String(v);
    ctx.fillText(vf, x + bw/2, y - 10);
  }
}

// ---------- Budget (kept as before) ----------
function renderBudget(db, year, monthKey) {
  const yr = getYear(db, year);

  if (!monthKey) {
    setCrumb(`Year ${year} • Budget`);
    view.innerHTML = "";

    const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]);

    const top = el("div", { class:"card stack" });
    top.appendChild(el("div", { class:"row" }, [
      back,
      el("div", {}, [
        el("div", { class:"item-title", html:"Budget by month" }),
        el("div", { class:"muted", html:"Open a month to add income/expense entries and see totals." })
      ])
    ]));

    const grid = el("div", { class:"grid" });
    for (let m=1; m<=12; m++) {
      const mk = `${year}-${String(m).padStart(2,"0")}`;
      const data = yr.budget[mk] || { entries: [] };
      const totals = budgetTotals(data.entries);

      const box = el("div", { class:"card stack" });
      box.appendChild(el("div", { class:"item-title", html: mk }));
      box.appendChild(el("div", { class:"muted", html:
        `Income: <b>${fmtMoney(totals.income)}</b> • Expense: <b>${fmtMoney(totals.expense)}</b> • Net: <b>${fmtMoney(totals.net)}</b>`
      }));
      box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/budget/${mk}`) }, [
        document.createTextNode("Open month")
      ]));
      grid.appendChild(box);
    }
    top.appendChild(grid);
    view.appendChild(top);
    return;
  }

  setCrumb(`Year ${year} • Budget • ${monthKey}`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}/budget`) }, [document.createTextNode("← Months")]);

  if (!yr.budget[monthKey]) yr.budget[monthKey] = { entries: [] };

  view.appendChild(el("div", { class:"stack" }, [
    el("div", { class:"row" }, [back]),
    budgetForm(db, year, monthKey),
    budgetTable(db, year, monthKey)
  ]));
}

function budgetTotals(entries) {
  let income=0, expense=0;
  for (const e of entries) {
    const amt = Number(e.amount||0);
    if (e.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, net: income-expense };
}

function budgetForm(db, year, monthKey) {
  const yr = getYear(db, year);
  const month = yr.budget[monthKey];

  let editingId = null;

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Add / Edit Entry" }));

  const type = el("select", { class:"input" }, [
    el("option", { value:"income" }, [document.createTextNode("Income")]),
    el("option", { value:"expense" }, [document.createTextNode("Expense")])
  ]);
  const label = el("input", { class:"input", placeholder:"Label (e.g. Salary / Rent / Groceries)" });
  const amount = el("input", { class:"input", type:"number", step:"0.01", placeholder:"Amount" });

  const cat = el("select", { class:"input" });
  for (const c of [...CATEGORIES, {key:"other", label:"Other"}]) {
    cat.appendChild(el("option", { value:c.key }, [document.createTextNode(c.label)]));
  }

  const date = el("input", { class:"input", type:"date" });

  const saveBtn = el("button", { class:"btn" }, [document.createTextNode("Save entry")]);
  const cancelBtn = el("button", { class:"btn secondary hidden" }, [document.createTextNode("Cancel edit")]);

  function reset() {
    editingId = null;
    type.value = "expense";
    label.value = "";
    amount.value = "";
    cat.value = "other";
    date.value = `${monthKey}-01`;
    cancelBtn.classList.add("hidden");
    saveBtn.textContent = "Save entry";
  }
  reset();

  saveBtn.onclick = () => {
    const l = label.value.trim();
    if (!l) return alert("Enter a label.");
    const a = Number(amount.value);
    if (!Number.isFinite(a) || a <= 0) return alert("Enter a positive amount.");
    const d = date.value || `${monthKey}-01`;
    const payload = { type: type.value, label:l, amount:a, category: cat.value, date:d };

    if (editingId) {
      const idx = month.entries.findIndex(e=>e.id===editingId);
      if (idx >= 0) month.entries[idx] = { ...month.entries[idx], ...payload };
    } else {
      month.entries.push({ id: uid(), ...payload });
    }
    saveDB(db);
    renderBudget(db, year, monthKey);
  };

  cancelBtn.onclick = reset;

  wrap._startEdit = (entryId) => {
    const e = month.entries.find(x=>x.id===entryId);
    if (!e) return;
    editingId = entryId;
    type.value = e.type || "expense";
    label.value = e.label || "";
    amount.value = String(e.amount || "");
    cat.value = e.category || "other";
    date.value = e.date || `${monthKey}-01`;
    cancelBtn.classList.remove("hidden");
    saveBtn.textContent = "Update entry";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  wrap.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("div", { class:"muted", html:"Type" }), type]),
    el("div", {}, [el("div", { class:"muted", html:"Label" }), label]),
    el("div", {}, [el("div", { class:"muted", html:"Amount" }), amount]),
    el("div", {}, [el("div", { class:"muted", html:"Category" }), cat]),
    el("div", {}, [el("div", { class:"muted", html:"Date" }), date])
  ]));
  wrap.appendChild(el("div", { class:"row" }, [saveBtn, cancelBtn]));
  return wrap;
}

function budgetTable(db, year, monthKey) {
  const yr = getYear(db, year);
  const month = yr.budget[monthKey];

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Entries" }));

  const totals = budgetTotals(month.entries);
  wrap.appendChild(el("div", { class:"row" }, [
    el("span", { class:"pill", html:`Income <b>${fmtMoney(totals.income)}</b>` }),
    el("span", { class:"pill", html:`Expense <b>${fmtMoney(totals.expense)}</b>` }),
    el("span", { class:"pill", html:`Net <b>${fmtMoney(totals.net)}</b>` })
  ]));

  if (!month.entries.length) {
    wrap.appendChild(el("div", { class:"muted", html:"No entries yet." }));
    return wrap;
  }

  function findFormCard() {
    const cards = view.querySelectorAll(".card");
    for (const c of cards) if (c.textContent.includes("Add / Edit Entry")) return c;
    return null;
  }

  const table = el("table", { class:"table" });
  table.appendChild(el("thead", {}, [
    el("tr", {}, [
      el("th", { html:"Date" }),
      el("th", { html:"Type" }),
      el("th", { html:"Label" }),
      el("th", { html:"Category" }),
      el("th", { html:"Amount" }),
      el("th", { html:"" })
    ])
  ]));

  const tbody = el("tbody");
  const sorted = month.entries.slice().sort((a,b)=> (a.date > b.date ? 1 : -1));

  for (const e of sorted) {
    const tr = el("tr");
    tr.appendChild(el("td", { html: e.date || "" }));
    tr.appendChild(el("td", { html: e.type }));
    tr.appendChild(el("td", { html: e.label }));
    tr.appendChild(el("td", { html: categoryLabel(e.category) }));
    tr.appendChild(el("td", { html: fmtMoney(e.amount) }));

    const actions = el("td", {});
    actions.appendChild(el("button", { class:"btn small secondary", onclick: ()=> {
      const form = findFormCard();
      if (form && form._startEdit) form._startEdit(e.id);
    }}, [document.createTextNode("Edit")]));
    actions.appendChild(document.createTextNode(" "));
    actions.appendChild(el("button", { class:"btn small danger", onclick: ()=> {
      if (!confirm("Delete this entry?")) return;
      month.entries = month.entries.filter(x=>x.id!==e.id);
      saveDB(db);
      renderBudget(db, year, monthKey);
    }}, [document.createTextNode("Delete")]));

    tr.appendChild(actions);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ---------- Export / Import / Wipe ----------
exportBtn.onclick = () => {
  const db = ensureDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type:"application/json" });
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
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
  if (!confirm("This will delete ALL local data. Continue?")) return;
  localStorage.removeItem(STORAGE_KEY);
  navTo("#/dashboard");
  render();
};

// first render
render();
