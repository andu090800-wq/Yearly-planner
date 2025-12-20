// Plans Dashboard (Glass UI + Charts)
// NOTE: Needs Chart.js loaded in index.html

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

function uid() {
  return crypto.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function isoToDate(iso){ const [y,m,d] = iso.split("-").map(Number); return new Date(y,(m||1)-1,d||1); }
function dateToISO(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function addDaysISO(iso, n){ const d=isoToDate(iso); d.setDate(d.getDate()+n); return dateToISO(d); }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function emptyYear() {
  return { habits:[], goals:[], budget:{} };
}

function loadDB() {
  try {
    const db = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (db && typeof db === "object") return db;
  } catch {}
  // fresh
  const db = {
    version: 3,
    years: { "2026": emptyYear(), "2027": emptyYear(), "2028": emptyYear() },
    settings: { yearList: [2026,2027,2028] }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}
function saveDB(db){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function getYear(db, year){
  const y=String(year);
  if (!db.years[y]) db.years[y] = emptyYear();
  return db.years[y];
}
function addYear(db, year){
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  db.settings.yearList = db.settings.yearList || [];
  if (!db.settings.yearList.includes(y)) db.settings.yearList.push(y);
  db.settings.yearList.sort((a,b)=>a-b);
  db.years[String(y)] = db.years[String(y)] || emptyYear();
  saveDB(db);
}

function parseHash(){
  const h = (location.hash || "#/dashboard").replace(/^#/, "");
  return h.split("/").filter(Boolean);
}
function navTo(hash){ location.hash = hash; }
function setCrumb(text){ crumb.textContent = text || ""; }

function categoryLabel(key){ return (CATEGORIES.find(c=>c.key===key)?.label) || key; }

// --- Minimal recurrence (kept simple): you can re-plug your v3 engine here if you want
function isHabitDueOn(habit, iso){
  // If you already have the v3 recurrence engine, paste it here.
  // For now: daily default; weekdays; weekly days; x/week is "always due" until you mark it (simple).
  const f = habit.frequency || { type:"daily" };
  const start = habit.startDate || "";
  if (start && iso < start) return false;

  const d = isoToDate(iso);
  const js = d.getDay(); // 0 Sun..6 Sat
  const dow = js === 0 ? 7 : js; // 1 Mon..7 Sun

  if (f.type === "weekdays") return dow>=1 && dow<=5;
  if (f.type === "weekly_days") return (f.days || [1,3,5]).includes(dow);
  if (f.type === "monthly") return d.getDate() === (f.day || 1);
  if (f.type === "custom"){
    const base = start || `${iso.slice(0,4)}-01-01`;
    const diff = Math.floor((isoToDate(iso) - isoToDate(base)) / (24*3600*1000));
    const n = Math.max(1, Number(f.everyNDays||1));
    return diff>=0 && diff % n === 0;
  }
  return true; // daily default
}

function toggleHabitCheck(db, year, habitId, iso){
  const yr = getYear(db, year);
  const h = yr.habits.find(x=>x.id===habitId);
  if (!h) return;
  h.checks = h.checks || {};
  if (h.checks[iso]) delete h.checks[iso];
  else h.checks[iso] = true;
  saveDB(db);
  render();
}

// ---------- Charts helpers ----------
let _charts = [];
function destroyCharts(){
  for (const ch of _charts) { try{ ch.destroy(); } catch {} }
  _charts = [];
}

function makeLineChart(canvas, labels, values){
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Completion", data: values, tension: 0.35, borderWidth: 2, pointRadius: 2 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero:true, suggestedMax: 100 } }
    }
  });
  _charts.push(ch);
  return ch;
}

function makeBarChart(canvas, labels, values){
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Progress %", data: values, borderWidth: 1 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero:true, max: 100 } }
    }
  });
  _charts.push(ch);
  return ch;
}

function makeDonutChart(canvas, labels, values){
  if (!window.Chart) return null;
  const ch = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, borderWidth: 1 }] },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });
  _charts.push(ch);
  return ch;
}

// ---------- Views ----------
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/dashboard";
render();

function render(){
  destroyCharts();
  const db = loadDB();
  const p = parseHash();

  if (p[0] === "year" && p[1]) {
    const year = Number(p[1]);
    if (!db.settings.yearList.includes(year)) addYear(db, year);
    const section = p[2] || "";

    if (!section) return renderYearHome(db, year);
    if (section === "goals-dashboard") return renderGoalsDashboard(db, year);
    if (section === "budget") return renderBudget(db, year, p[3] || "");
    // (optional) keep your other routes here
    return renderYearHome(db, year);
  }

  return renderDashboard(db);
}

function heroSVG(){
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

function renderDashboard(db){
  setCrumb("Dashboard");
  view.innerHTML = "";

  const years = db.settings.yearList || [2026,2027,2028];

  const hero = el("div", { class:"card big hero" });
  hero.appendChild(el("div", { class:"heroGlow" }));
  hero.appendChild(el("div", {}, [
    el("div", { class:"kpi", html:`Your Plans` }),
    el("div", { class:"muted", html:"Glass UI • charts • everything stored locally" }),
    el("div", { class:"row", style:"margin-top:10px" }, [
      el("span", { class:"pill", html:`Years <b>${years.length}</b>` }),
      el("span", { class:"pill", html:`Today <b>${todayISO()}</b>` }),
      el("span", { class:"pill", html:`Offline <b>Yes</b>` })
    ])
  ]));
  hero.insertAdjacentHTML("beforeend", heroSVG());

  // Year cards
  const grid = el("div", { class:"grid" });
  for (const y of years){
    const yr = getYear(db, y);
    const today = todayISO();
    const dueToday = yr.habits.filter(h=>isHabitDueOn(h, today)).length;
    const doneToday = yr.habits.filter(h=>(h.checks||{})[today]).length;

    const c = el("div", { class:"card glass2 stack" });
    c.appendChild(el("div", { class:"kpi", html:String(y) }));
    c.appendChild(el("div", { class:"row" }, [
      el("span", { class:"pill", html:`Habits <b>${yr.habits.length}</b>` }),
      el("span", { class:"pill", html:`Goals <b>${yr.goals.length}</b>` })
    ]));
    c.appendChild(el("div", { class:"muted", html:`Today: due <b>${dueToday}</b> • done <b>${doneToday}</b>` }));
    c.appendChild(el("button", { class:"btn", onclick:()=>navTo(`#/year/${y}`) }, [document.createTextNode("Open year")]));
    grid.appendChild(c);
  }

  // Charts: last 30 days completion for 2026 (default)
  const y = years.includes(2026) ? 2026 : years[0];
  const yr = getYear(db, y);

  const chartsRow = el("div", { class:"grid" });

  const c1 = el("div", { class:"card big stack" });
  c1.appendChild(el("div", { class:"item-title", html:`Habits completion (last 30 days) • ${y}` }));
  c1.appendChild(el("div", { class:"muted", html:"Percent = done/due for that day" }));
  const cv1 = el("div", { class:"chartBox" }, [el("canvas")]);
  c1.appendChild(cv1);

  const c2 = el("div", { class:"card big stack" });
  c2.appendChild(el("div", { class:"item-title", html:`Goals progress by category • ${y}` }));
  c2.appendChild(el("div", { class:"muted", html:"Shows only goals with Target + Current" }));
  const cv2 = el("div", { class:"chartBox" }, [el("canvas")]);
  c2.appendChild(cv2);

  const c3 = el("div", { class:"card big stack" });
  c3.appendChild(el("div", { class:"item-title", html:`Top goals progress • ${y}` }));
  const cv3 = el("div", { class:"chartBox" }, [el("canvas")]);
  c3.appendChild(cv3);

  chartsRow.appendChild(c1);
  chartsRow.appendChild(c2);
  chartsRow.appendChild(c3);

  view.appendChild(hero);
  view.appendChild(grid);
  view.appendChild(chartsRow);

  // Build chart data
  const today = todayISO();
  const labels = [];
  const values = [];
  for (let i=29;i>=0;i--){
    const iso = addDaysISO(today, -i);
    labels.push(iso.slice(5)); // MM-DD
    const due = yr.habits.filter(h=>isHabitDueOn(h, iso)).length;
    const done = yr.habits.filter(h=>(h.checks||{})[iso]).length;
    const pct = due ? Math.round((done/due)*100) : 0;
    values.push(pct);
  }
  makeLineChart(cv1.querySelector("canvas"), labels, values);

  // Goals by category donut
  const goals = yr.goals || [];
  const goalsWithNumbers = goals.filter(g =>
    g.targetValue !== "" && g.currentValue !== "" &&
    Number(g.targetValue) > 0
  );

  const catLabels = CATEGORIES.map(c=>c.label);
  const catAvg = CATEGORIES.map(c=>{
    const arr = goalsWithNumbers.filter(g=>g.category===c.key)
      .map(g=>Math.round(clamp01(Number(g.currentValue)/Number(g.targetValue))*100));
    if (!arr.length) return 0;
    return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  });
  makeDonutChart(cv2.querySelector("canvas"), catLabels, catAvg);

  // Top goals bar
  const top = goalsWithNumbers
    .map(g=>({ title:g.title, pct: Math.round(clamp01(Number(g.currentValue)/Number(g.targetValue))*100) }))
    .sort((a,b)=>b.pct-a.pct)
    .slice(0,8);
  makeBarChart(cv3.querySelector("canvas"), top.map(x=>x.title.slice(0,14)), top.map(x=>x.pct));
}

function renderYearHome(db, year){
  setCrumb(`Year ${year}`);
  view.innerHTML = "";

  const yr = getYear(db, year);
  const today = todayISO();

  const hero = el("div", { class:"card big hero" });
  hero.appendChild(el("div", { class:"heroGlow" }));
  hero.appendChild(el("div", {}, [
    el("div", { class:"kpi", html:String(year) }),
    el("div", { class:"muted", html:"Habits → Goals → Budget. Tap cards below." }),
    el("div", { class:"row", style:"margin-top:10px" }, [
      el("span", { class:"pill", html:`Habits <b>${yr.habits.length}</b>` }),
      el("span", { class:"pill", html:`Goals <b>${yr.goals.length}</b>` }),
      el("span", { class:"pill", html:`Today <b>${today}</b>` })
    ]),
    el("div", { class:"row", style:"margin-top:10px" }, [
      el("button", { class:"btn", onclick:()=>navTo(`#/year/${year}/goals-dashboard`) }, [document.createTextNode("Goals dashboard")]),
      el("button", { class:"btn secondary", onclick:()=>navTo(`#/year/${year}/budget`) }, [document.createTextNode("Budget")]),
      el("button", { class:"btn secondary", onclick:()=>navTo(`#/dashboard`) }, [document.createTextNode("Back to dashboard")])
    ])
  ]));
  hero.insertAdjacentHTML("beforeend", heroSVG());

  // Today due list
  const due = yr.habits.filter(h=>isHabitDueOn(h, today));
  const card = el("div", { class:"card big stack" }, [
    el("div", { class:"item-title", html:"Today" }),
    el("div", { class:"muted", html:`Due habits: <b>${due.length}</b>` })
  ]);

  const list = el("div", { class:"list" });
  for (const h of due.slice(0,10)){
    const done = !!(h.checks||{})[today];
    const it = el("div", { class:"item" });
    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html:`${done ? "✅" : "⬜️"} ${h.title}` }),
        el("div", { class:"item-sub", html:`${categoryLabel(h.category)}` })
      ]),
      el("div", { class:"item-actions" }, [
        el("button", { class:"btn small " + (done ? "secondary" : ""), onclick:()=>toggleHabitCheck(db, year, h.id, today) }, [
          document.createTextNode(done ? "Undo" : "Done")
        ])
      ])
    ]));
    list.appendChild(it);
  }
  if (!due.length) list.appendChild(el("div", { class:"muted", html:"No habits due today." }));
  card.appendChild(list);

  view.appendChild(hero);
  view.appendChild(card);
}

function renderGoalsDashboard(db, year){
  setCrumb(`Year ${year} • Goals dashboard`);
  view.innerHTML = "";

  const yr = getYear(db, year);
  const goals = yr.goals || [];
  const withNums = goals.filter(g =>
    g.targetValue !== "" && g.currentValue !== "" && Number(g.targetValue) > 0
  );

  const top = el("div", { class:"card big hero" });
  top.appendChild(el("div", { class:"heroGlow" }));
  top.appendChild(el("div", {}, [
    el("div", { class:"kpi", html:"Goals" }),
    el("div", { class:"muted", html:`${withNums.length} goals with numeric progress` }),
    el("div", { class:"row", style:"margin-top:10px" }, [
      el("button", { class:"btn secondary", onclick:()=>navTo(`#/year/${year}`) }, [document.createTextNode("Back to year")]),
      el("button", { class:"btn", onclick:()=>navTo(`#/dashboard`) }, [document.createTextNode("Dashboard")])
    ])
  ]));
  top.insertAdjacentHTML("beforeend", heroSVG());

  const grid = el("div", { class:"grid" });

  const c1 = el("div", { class:"card big stack" }, [
    el("div", { class:"item-title", html:"Average progress by category" }),
    el("div", { class:"chartBox" }, [el("canvas")])
  ]);

  const c2 = el("div", { class:"card big stack" }, [
    el("div", { class:"item-title", html:"Top goals" }),
    el("div", { class:"chartBox" }, [el("canvas")])
  ]);

  const c3 = el("div", { class:"card big stack" }, [
    el("div", { class:"item-title", html:"Deadline risk (simple)" }),
    el("div", { class:"muted", html:"Overdue = past date • Behind = progress < 50% and less than 30 days left (simple heuristic)" })
  ]);

  grid.appendChild(c1);
  grid.appendChild(c2);
  grid.appendChild(c3);

  view.appendChild(top);
  view.appendChild(grid);

  // Charts
  const catLabels = CATEGORIES.map(c=>c.label);
  const catAvg = CATEGORIES.map(c=>{
    const arr = withNums.filter(g=>g.category===c.key).map(g=>clamp01(Number(g.currentValue)/Number(g.targetValue)));
    if (!arr.length) return 0;
    return Math.round((arr.reduce((a,b)=>a+b,0)/arr.length)*100);
  });
  makeBarChart(c1.querySelector("canvas"), catLabels, catAvg);

  const topGoals = withNums
    .map(g=>({ title:g.title, pct: Math.round(clamp01(Number(g.currentValue)/Number(g.targetValue))*100), targetDate:g.targetDate }))
    .sort((a,b)=>b.pct-a.pct)
    .slice(0,10);
  makeBarChart(c2.querySelector("canvas"), topGoals.map(x=>x.title.slice(0,14)), topGoals.map(x=>x.pct));

  // Risk list
  const list = el("div", { class:"list" });
  const today = isoToDate(todayISO());
  const riskItems = withNums.map(g=>{
    const pct = clamp01(Number(g.currentValue)/Number(g.targetValue));
    const td = g.targetDate ? isoToDate(g.targetDate) : null;
    if (!td) return { g, label:"NO DATE", score:0 };
    const daysLeft = Math.ceil((td - today) / (24*3600*1000));
    if (daysLeft < 0) return { g, label:"OVERDUE", score:3 };
    if (daysLeft <= 30 && pct < 0.5) return { g, label:"BEHIND", score:2 };
    return { g, label:"ON TRACK", score:1 };
  }).sort((a,b)=>b.score-a.score);

  for (const it of riskItems.slice(0,12)){
    const g = it.g;
    const pct = Math.round(clamp01(Number(g.currentValue)/Number(g.targetValue))*100);
    list.appendChild(el("div", { class:"item" }, [
      el("div", { class:"item-top" }, [
        el("div", {}, [
          el("div", { class:"item-title", html:g.title }),
          el("div", { class:"item-sub", html:`Target: ${g.targetDate || "—"} • Progress: ${pct}%` })
        ]),
        el("span", { class:"pill", html:`<b>${it.label}</b>` })
      ])
    ]));
  }
  if (!riskItems.length) list.appendChild(el("div", { class:"muted", html:"No goals with numeric progress yet." }));
  c3.appendChild(list);
}

function renderBudget(db, year, mk){
  // keep budget minimal here; you can paste your advanced budget module back in.
  const yr = getYear(db, year);
  if (!mk){
    setCrumb(`Year ${year} • Budget`);
    view.innerHTML = "";

    const top = el("div", { class:"card big stack" }, [
      el("div", { class:"row" }, [
        el("button", { class:"btn secondary", onclick:()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
        el("div", {}, [
          el("div", { class:"item-title", html:"Budget months" }),
          el("div", { class:"muted", html:"Open a month to add entries." })
        ])
      ])
    ]);

    const grid = el("div", { class:"grid" });
    for (let m=1;m<=12;m++){
      const key = `${year}-${String(m).padStart(2,"0")}`;
      const data = yr.budget[key] || { entries:[] };
      const totals = budgetTotals(data.entries);

      const c = el("div", { class:"card glass2 stack" }, [
        el("div", { class:"item-title", html:key }),
        el("div", { class:"muted", html:`Net <b>${fmtMoney(totals.net)}</b>` }),
        el("div", { class:"row" }, [
          el("span", { class:"pill", html:`Inc <b>${fmtMoney(totals.income)}</b>` }),
          el("span", { class:"pill", html:`Exp <b>${fmtMoney(totals.expense)}</b>` })
        ]),
        el("button", { class:"btn", onclick:()=>navTo(`#/year/${year}/budget/${key}`) }, [document.createTextNode("Open")])
      ]);
      grid.appendChild(c);
    }

    view.appendChild(top);
    view.appendChild(grid);
    return;
  }

  setCrumb(`Year ${year} • Budget • ${mk}`);
  view.innerHTML = "";

  if (!yr.budget[mk]) yr.budget[mk] = { entries: [] };
  const month = yr.budget[mk];

  const backRow = el("div", { class:"row" }, [
    el("button", { class:"btn secondary", onclick:()=>navTo(`#/year/${year}/budget`) }, [document.createTextNode("← Months")])
  ]);

  const form = el("div", { class:"card big stack" }, [
    el("div", { class:"item-title", html:"Add entry" })
  ]);

  const type = el("select", { class:"input" }, [
    el("option", { value:"income" }, [document.createTextNode("Income")]),
    el("option", { value:"expense" }, [document.createTextNode("Expense")])
  ]);
  const label = el("input", { class:"input", placeholder:"Label" });
  const amount = el("input", { class:"input", type:"number", step:"0.01", placeholder:"Amount" });

  const save = el("button", { class:"btn" }, [document.createTextNode("Save")]);
  save.onclick = ()=>{
    const l = label.value.trim();
    const a = Number(amount.value);
    if (!l) return alert("Label required");
    if (!Number.isFinite(a) || a<=0) return alert("Amount required");
    month.entries.push({ id: uid(), type:type.value, label:l, amount:a, date:`${mk}-01` });
    saveDB(db);
    renderBudget(db, year, mk);
  };

  form.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("div",{class:"muted",html:"Type"}), type]),
    el("div", {}, [el("div",{class:"muted",html:"Label"}), label]),
    el("div", {}, [el("div",{class:"muted",html:"Amount"}), amount]),
    el("div", {}, [el("div",{class:"muted",html:""}), save])
  ]));

  const totals = budgetTotals(month.entries);

  const tableCard = el("div", { class:"card big stack" }, [
    el("div", { class:"row" }, [
      el("div", { class:"item-title", html:"Entries" }),
      el("span", { class:"pill", html:`Net <b>${fmtMoney(totals.net)}</b>` }),
      el("span", { class:"pill", html:`Income <b>${fmtMoney(totals.income)}</b>` }),
      el("span", { class:"pill", html:`Expense <b>${fmtMoney(totals.expense)}</b>` })
    ])
  ]);

  const table = el("table", { class:"table" });
  table.appendChild(el("thead", {}, [
    el("tr", {}, [el("th",{html:"Type"}), el("th",{html:"Label"}), el("th",{html:"Amount"}), el("th",{html:""})])
  ]));
  const tb = el("tbody");
  for (const e of month.entries){
    const tr = el("tr");
    tr.appendChild(el("td",{html:e.type}));
    tr.appendChild(el("td",{html:e.label}));
    tr.appendChild(el("td",{html:fmtMoney(e.amount)}));
    const td = el("td");
    td.appendChild(el("button",{class:"btn small danger", onclick:()=>{
      month.entries = month.entries.filter(x=>x.id!==e.id);
      saveDB(db);
      renderBudget(db, year, mk);
    }},[document.createTextNode("Delete")]));
    tr.appendChild(td);
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  tableCard.appendChild(table);

  view.appendChild(backRow);
  view.appendChild(form);
  view.appendChild(tableCard);
}

function budgetTotals(entries){
  let income=0, expense=0;
  for (const e of entries){
    const a = Number(e.amount||0);
    if (e.type === "income") income += a;
    else expense += a;
  }
  return { income, expense, net: income-expense };
}
function fmtMoney(n){
  const x = Number(n||0);
  return x.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
}

// ---------- Export/Import/Wipe ----------
exportBtn.onclick = () => {
  const db = loadDB();
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
    } catch (e) { alert("Import failed: " + e.message); }
  };
  reader.readAsText(f);
  importFile.value = "";
};

wipeBtn.onclick = () => {
  if (!confirm("This will delete ALL local data on this device. Continue?")) return;
  localStorage.removeItem(STORAGE_KEY);
  navTo("#/dashboard");
  render();
};
