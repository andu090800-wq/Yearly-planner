// Plans Dashboard (static, offline). Data stored in localStorage.
// Routes (hash):
// #/dashboard
// #/year/2026
// #/year/2026/habits
// #/year/2026/habits/personal
// #/year/2026/goals
// #/year/2026/goals/money
// #/year/2026/budget
// #/year/2026/budget/2026-01

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "plans_dashboard_v1";
const CATEGORIES = [
  { key: "personal", label: "Personal" },
  { key: "money", label: "Money" },
  { key: "sports", label: "Sports" },
  { key: "job", label: "Job" },
  { key: "study", label: "Study" },
  { key: "language", label: "Language learning" }
];

const view = $("view");
const crumb = $("crumb");

const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const importFile = $("importFile");
const wipeBtn = $("wipeBtn");

// ---------- Storage ----------
function loadDB() {
  try {
    const db = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (db && typeof db === "object") return db;
  } catch {}
  return null;
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function uid() {
  return crypto.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2));
}

function ensureDB() {
  let db = loadDB();
  if (db) return db;

  const years = {};
  for (const y of [2026, 2027, 2028]) years[String(y)] = emptyYear();

  db = {
    version: 1,
    years,
    settings: { yearList: [2026, 2027, 2028] }
  };
  saveDB(db);
  return db;
}

function emptyYear() {
  return {
    habits: [], // {id, title, category, frequency:{type, everyNDays}, startDate, notes, linkedGoalIds:[] , checks:{ "YYYY-MM-DD": true } }
    goals: [],  // {id, title, category, targetDate, metric, targetValue, currentValue, notes, linkedHabitIds:[] }
    budget: {}  // {"YYYY-MM": { entries:[{id,type:'income'|'expense', label, amount, category, date}] }}
  };
}

function getYear(db, year) {
  if (!db.years[String(year)]) db.years[String(year)] = emptyYear();
  return db.years[String(year)];
}

function addYear(db, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  if (!db.settings.yearList.includes(y)) db.settings.yearList.push(y);
  db.settings.yearList.sort((a,b)=>a-b);
  db.years[String(y)] = db.years[String(y)] || emptyYear();
  saveDB(db);
}

// ---------- Helpers ----------
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function monthKeyFromISODate(iso) {
  // YYYY-MM-DD -> YYYY-MM
  return iso.slice(0,7);
}

function fmtMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function categoryLabel(key) {
  return (CATEGORIES.find(c=>c.key===key)?.label) || key;
}

function freqLabel(freq) {
  if (!freq) return "—";
  if (freq.type === "daily") return "Daily";
  if (freq.type === "weekly") return "Weekly";
  if (freq.type === "biweekly") return "Biweekly";
  if (freq.type === "monthly") return "Monthly";
  if (freq.type === "bimonthly") return "Bimonthly";
  if (freq.type === "custom") return `Every ${freq.everyNDays || 1} days`;
  return freq.type;
}

function parseHash() {
  const h = (location.hash || "#/dashboard").replace(/^#/, "");
  const parts = h.split("/").filter(Boolean);
  // ["dashboard"] or ["year","2026","habits","personal"]
  return parts;
}

function navTo(hash) {
  location.hash = hash;
}

function setCrumb(text) {
  crumb.textContent = text || "";
}

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

// ---------- UI building blocks ----------
function card(title, subtitle, bodyEl) {
  const top = el("div", { class:"row" }, [
    el("div", {}, [
      el("div", { class:"item-title", html: title }),
      el("div", { class:"muted", html: subtitle || "" })
    ])
  ]);
  const c = el("div", { class:"card stack" }, [top]);
  if (bodyEl) c.appendChild(bodyEl);
  return c;
}

function buttonRow(btns) {
  const row = el("div", { class:"row" });
  for (const b of btns) row.appendChild(b);
  return row;
}

// ---------- Views ----------
function render() {
  const db = ensureDB();
  const parts = parseHash();

  if (parts[0] === "year" && parts[1]) {
    const year = Number(parts[1]);
    const section = parts[2] || "";
    const sub = parts[3] || "";

    if (!db.settings.yearList.includes(year)) addYear(db, year);

    if (!section) return renderYearHome(db, year);
    if (section === "habits") return renderHabits(db, year, sub);
    if (section === "goals") return renderGoals(db, year, sub);
    if (section === "budget") return renderBudget(db, year, sub);
  }

  return renderDashboard(db);
}

// Dashboard with years
function renderDashboard(db) {
  setCrumb("Dashboard");
  view.innerHTML = "";

  const yearsCard = el("div", { class:"card stack" });
  yearsCard.appendChild(el("div", { class:"row" }, [
    el("div", {}, [
      el("div", { class:"item-title", html:"Years" }),
      el("div", { class:"muted", html:"Tap a year to plan & track habits, goals and budget." })
    ])
  ]));

  const grid = el("div", { class:"grid" });
  for (const y of db.settings.yearList) {
    const yr = getYear(db, y);
    const habitsCount = yr.habits.length;
    const goalsCount = yr.goals.length;

    // budget months count
    const monthsCount = Object.keys(yr.budget || {}).length;

    const box = el("div", { class:"card stack" });
    box.appendChild(el("div", { class:"kpi", html: String(y) }));
    box.appendChild(el("div", { class:"row" }, [
      el("span", { class:"pill", html:`Habits: <b>${habitsCount}</b>` }),
      el("span", { class:"pill", html:`Goals: <b>${goalsCount}</b>` }),
      el("span", { class:"pill", html:`Budget months: <b>${monthsCount}</b>` })
    ]));
    box.appendChild(el("button", {
      class:"btn",
      onclick: ()=>navTo(`#/year/${y}`)
    }, [document.createTextNode("Open")] ));
    grid.appendChild(box);
  }
  yearsCard.appendChild(grid);

  const addCard = el("div", { class:"card stack" });
  addCard.appendChild(el("div", { class:"item-title", html:"Add a new year" }));
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

// Year home menu
function renderYearHome(db, year) {
  setCrumb(`Year ${year}`);
  view.innerHTML = "";

  const yr = getYear(db, year);
  const today = todayISO();

  // Quick KPIs
  const checkedToday = yr.habits.filter(h => h.checks?.[today]).length;

  const kpi = el("div", { class:"grid" });
  kpi.appendChild(card("Habits", `${yr.habits.length} total • ${checkedToday} checked today`, buttonRow([
    el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits`) }, [document.createTextNode("Open habits")])
  ])));
  kpi.appendChild(card("Goals", `${yr.goals.length} total`, buttonRow([
    el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/goals`) }, [document.createTextNode("Open goals")])
  ])));
  kpi.appendChild(card("Budget", `Monthly income/expenses`, buttonRow([
    el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/budget`) }, [document.createTextNode("Open budget")])
  ])));
  kpi.appendChild(card("Categories", `Personal • Money • Sports • Job • Study • Language`, el("div", { class:"muted", html:"Habits and Goals are organized by category inside each section." })));

  view.appendChild(kpi);

  // Quick today habits list (simple)
  const todayCard = el("div", { class:"card stack" });
  todayCard.appendChild(el("div", { class:"item-title", html:"Today quick check" }));
  todayCard.appendChild(el("div", { class:"muted", html:`${today} • Tap a habit to toggle done/not done.` }));

  if (!yr.habits.length) {
    todayCard.appendChild(el("div", { class:"muted", html:"No habits yet. Add some in Habits." }));
  } else {
    const list = el("div", { class:"list" });
    for (const h of yr.habits) {
      const done = !!h.checks?.[today];
      const it = el("div", { class:"item" });
      it.appendChild(el("div", { class:"item-top" }, [
        el("div", {}, [
          el("div", { class:"item-title", html: `${done ? "✅" : "⬜️"} ${h.title}` }),
          el("div", { class:"item-sub", html: `${categoryLabel(h.category)} • ${freqLabel(h.frequency)}` })
        ]),
        el("button", { class:"btn small secondary", onclick: ()=>toggleHabitCheck(db, year, h.id, today) }, [
          document.createTextNode(done ? "Undo" : "Done")
        ])
      ]));
      list.appendChild(it);
    }
    todayCard.appendChild(list);
  }

  view.appendChild(todayCard);
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

// Habits list/category
function renderHabits(db, year, categoryKey) {
  const yr = getYear(db, year);
  if (!categoryKey) {
    setCrumb(`Year ${year} • Habits`);
    view.innerHTML = "";

    const top = el("div", { class:"card stack" });
    top.appendChild(el("div", { class:"row" }, [
      el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Habits" }),
        el("div", { class:"muted", html:"Choose a category. Habits support goals." })
      ])
    ]));
    const grid = el("div", { class:"grid" });
    for (const c of CATEGORIES) {
      const count = yr.habits.filter(h=>h.category===c.key).length;
      const box = el("div", { class:"card stack" });
      box.appendChild(el("div", { class:"item-title", html:c.label }));
      box.appendChild(el("div", { class:"muted", html:`${count} habits` }));
      box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/habits/${c.key}`) }, [
        document.createTextNode("Open")
      ]));
      grid.appendChild(box);
    }
    top.appendChild(grid);
    view.appendChild(top);
    return;
  }

  // Category habits
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
  wrap.appendChild(el("div", { class:"muted", html:"Frequency options: daily, weekly, biweekly, monthly, bimonthly, custom every N days." }));

  const title = el("input", { class:"input", placeholder:"Habit title (e.g. Gym session)" });
  const startDate = el("input", { class:"input", type:"date" });

  const freqType = el("select", { class:"input" });
  for (const opt of [
    ["daily","Daily"], ["weekly","Weekly"], ["biweekly","Biweekly"],
    ["monthly","Monthly"], ["bimonthly","Bimonthly"], ["custom","Custom (every N days)"]
  ]) freqType.appendChild(el("option", { value: opt[0] }, [document.createTextNode(opt[1])]));

  const everyNDays = el("input", { class:"input", type:"number", min:"1", placeholder:"N (only for custom)" });

  const notes = el("textarea", { class:"input", placeholder:"Notes (optional)" });

  const saveBtn = el("button", { class:"btn" }, [document.createTextNode("Save habit")]);
  const cancelBtn = el("button", { class:"btn secondary" }, [document.createTextNode("Cancel edit")]);
  cancelBtn.classList.add("hidden");

  function reset() {
    editingId = null;
    title.value = "";
    startDate.value = "";
    freqType.value = "daily";
    everyNDays.value = "";
    notes.value = "";
    cancelBtn.classList.add("hidden");
    saveBtn.textContent = "Save habit";
  }

  saveBtn.onclick = () => {
    const t = title.value.trim();
    if (!t) return alert("Enter a habit title.");
    const freq = { type: freqType.value };
    if (freq.type === "custom") freq.everyNDays = Math.max(1, Number(everyNDays.value || 1));

    const payload = {
      title: t,
      category: categoryKey,
      startDate: startDate.value || "",
      frequency: freq,
      notes: notes.value.trim(),
    };

    if (editingId) {
      const h = yr.habits.find(x=>x.id===editingId);
      if (!h) return;
      Object.assign(h, payload);
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

  // expose edit function via window-scoped hook for this view
  wrap._startEdit = (habitId) => {
    const h = yr.habits.find(x=>x.id===habitId);
    if (!h) return;
    editingId = habitId;
    title.value = h.title || "";
    startDate.value = h.startDate || "";
    freqType.value = h.frequency?.type || "daily";
    everyNDays.value = h.frequency?.everyNDays || "";
    notes.value = h.notes || "";
    cancelBtn.classList.remove("hidden");
    saveBtn.textContent = "Update habit";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  wrap.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("div", { class:"muted", html:"Title" }), title]),
    el("div", {}, [el("div", { class:"muted", html:"Start date" }), startDate]),
    el("div", {}, [el("div", { class:"muted", html:"Frequency" }), freqType]),
    el("div", {}, [el("div", { class:"muted", html:"Custom N days" }), everyNDays])
  ]));
  wrap.appendChild(el("div", {}, [el("div", { class:"muted", html:"Notes" }), notes]));
  wrap.appendChild(buttonRow([saveBtn, cancelBtn]));

  return wrap;
}

function habitsList(db, year, categoryKey) {
  const yr = getYear(db, year);

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Habits in this category" }));

  const list = el("div", { class:"list" });
  const habits = yr.habits.filter(h=>h.category===categoryKey);

  if (!habits.length) {
    wrap.appendChild(el("div", { class:"muted", html:"No habits yet." }));
    return wrap;
  }

  // Find the form card in the current view to call _startEdit
  function findFormCard() {
    // first card is back row; form is next
    const cards = view.querySelectorAll(".card");
    // safest: find card containing "Add / Edit Habit"
    for (const c of cards) {
      if (c.textContent.includes("Add / Edit Habit")) return c;
    }
    return null;
  }

  for (const h of habits) {
    const linkedGoals = (h.linkedGoalIds || []).map(id => yr.goals.find(g=>g.id===id)?.title).filter(Boolean);
    const it = el("div", { class:"item" });

    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html: h.title }),
        el("div", { class:"item-sub", html: `${freqLabel(h.frequency)} • start: ${h.startDate || "—"}` }),
        el("div", { class:"muted", html: linkedGoals.length ? `Linked goals: ${linkedGoals.join(", ")}` : "Linked goals: —" })
      ]),
      el("div", { class:"item-actions" }, [
        el("button", { class:"btn small secondary", onclick: ()=> {
          const form = findFormCard();
          if (form && form._startEdit) form._startEdit(h.id);
        }}, [document.createTextNode("Edit")]),
        el("button", { class:"btn small danger", onclick: ()=> {
          if (!confirm("Delete this habit?")) return;
          // remove links from goals
          for (const g of yr.goals) {
            g.linkedHabitIds = (g.linkedHabitIds || []).filter(x=>x!==h.id);
          }
          yr.habits = yr.habits.filter(x=>x.id!==h.id);
          saveDB(db);
          renderHabits(db, year, categoryKey);
        }}, [document.createTextNode("Delete")])
      ])
    ]));

    if (h.notes) it.appendChild(el("div", { class:"muted", html: h.notes }));

    list.appendChild(it);
  }

  wrap.appendChild(list);
  return wrap;
}

// Goals
function renderGoals(db, year, categoryKey) {
  const yr = getYear(db, year);

  if (!categoryKey) {
    setCrumb(`Year ${year} • Goals`);
    view.innerHTML = "";

    const top = el("div", { class:"card stack" });
    top.appendChild(el("div", { class:"row" }, [
      el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}`) }, [document.createTextNode("← Back")]),
      el("div", {}, [
        el("div", { class:"item-title", html:"Goals" }),
        el("div", { class:"muted", html:"Choose a category. You can link habits to each goal." })
      ])
    ]));

    const grid = el("div", { class:"grid" });
    for (const c of CATEGORIES) {
      const count = yr.goals.filter(g=>g.category===c.key).length;
      const box = el("div", { class:"card stack" });
      box.appendChild(el("div", { class:"item-title", html:c.label }));
      box.appendChild(el("div", { class:"muted", html:`${count} goals` }));
      box.appendChild(el("button", { class:"btn", onclick: ()=>navTo(`#/year/${year}/goals/${c.key}`) }, [
        document.createTextNode("Open")
      ]));
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

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Add / Edit Goal" }));
  wrap.appendChild(el("div", { class:"muted", html:"Goals can be linked to habits (support system)." }));

  const title = el("input", { class:"input", placeholder:"Goal title (e.g. Save 10,000)" });
  const targetDate = el("input", { class:"input", type:"date" });
  const metric = el("input", { class:"input", placeholder:"Metric (optional) e.g. EUR saved / kg / hours" });
  const targetValue = el("input", { class:"input", type:"number", placeholder:"Target value (optional)" });
  const currentValue = el("input", { class:"input", type:"number", placeholder:"Current value (optional)" });
  const notes = el("textarea", { class:"input", placeholder:"Notes (optional)" });

  // habits multiselect (only within same category by default, but you can link any)
  const habitsWrap = el("div", { class:"stack" });
  const habitsHint = el("div", { class:"muted", html:"Link habits to this goal:" });
  habitsWrap.appendChild(habitsHint);

  function renderHabitCheckboxes(selectedIds = []) {
    habitsWrap.querySelectorAll(".list").forEach(n => n.remove());
    const list = el("div", { class:"list" });
    const habits = yr.habits.filter(h => h.category === categoryKey);
    if (!habits.length) {
      list.appendChild(el("div", { class:"muted", html:"No habits in this category yet. Add habits first if you want links." }));
      habitsWrap.appendChild(list);
      return;
    }
    for (const h of habits) {
      const id = `hb_${h.id}`;
      const cb = el("input", { type:"checkbox", id });
      cb.checked = selectedIds.includes(h.id);
      const lab = el("label", { for:id, class:"row" }, [
        cb,
        el("span", { html: h.title })
      ]);
      list.appendChild(el("div", { class:"item" }, [lab]));
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

    // collect linked habit IDs
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

    // also store reverse links in habits (for display)
    for (const h of yr.habits) {
      h.linkedGoalIds = (h.linkedGoalIds || []).filter(id => id !== (editingId || "__new__"));
    }
    const goalId = editingId || yr.goals[yr.goals.length - 1].id;
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

  // expose startEdit
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
    el("div", {}, [el("div", { class:"muted", html:"Target value" }), targetValue]),
    el("div", {}, [el("div", { class:"muted", html:"Current value" }), currentValue])
  ]));

  wrap.appendChild(el("div", {}, [el("div", { class:"muted", html:"Notes" }), notes]));
  wrap.appendChild(habitsWrap);
  wrap.appendChild(buttonRow([saveBtn, cancelBtn]));
  return wrap;
}

function goalsList(db, year, categoryKey) {
  const yr = getYear(db, year);

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Goals in this category" }));

  const list = el("div", { class:"list" });
  const goals = yr.goals.filter(g=>g.category===categoryKey);

  if (!goals.length) {
    wrap.appendChild(el("div", { class:"muted", html:"No goals yet." }));
    return wrap;
  }

  function findFormCard() {
    const cards = view.querySelectorAll(".card");
    for (const c of cards) {
      if (c.textContent.includes("Add / Edit Goal")) return c;
    }
    return null;
  }

  for (const g of goals) {
    const linkedHabits = (g.linkedHabitIds || []).map(id => yr.habits.find(h=>h.id===id)?.title).filter(Boolean);
    const progress =
      (g.targetValue !== "" && g.targetValue !== undefined && g.currentValue !== "" && g.currentValue !== undefined)
        ? `${g.currentValue}/${g.targetValue} ${g.metric || ""}`.trim()
        : (g.metric ? g.metric : "—");

    const it = el("div", { class:"item" });
    it.appendChild(el("div", { class:"item-top" }, [
      el("div", {}, [
        el("div", { class:"item-title", html: g.title }),
        el("div", { class:"item-sub", html: `Target: ${g.targetDate || "—"} • Progress: ${progress}` }),
        el("div", { class:"muted", html: linkedHabits.length ? `Linked habits: ${linkedHabits.join(", ")}` : "Linked habits: —" })
      ]),
      el("div", { class:"item-actions" }, [
        el("button", { class:"btn small secondary", onclick: ()=> {
          const form = findFormCard();
          if (form && form._startEdit) form._startEdit(g.id);
        }}, [document.createTextNode("Edit")]),
        el("button", { class:"btn small danger", onclick: ()=> {
          if (!confirm("Delete this goal?")) return;
          // remove reverse links from habits
          for (const h of yr.habits) {
            h.linkedGoalIds = (h.linkedGoalIds || []).filter(x=>x!==g.id);
          }
          yr.goals = yr.goals.filter(x=>x.id!==g.id);
          saveDB(db);
          renderGoals(db, year, categoryKey);
        }}, [document.createTextNode("Delete")])
      ])
    ]));

    if (g.notes) it.appendChild(el("div", { class:"muted", html: g.notes }));
    list.appendChild(it);
  }

  wrap.appendChild(list);
  return wrap;
}

// Budget
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
        el("div", { class:"muted", html:"Add income/expense entries per month and see totals." })
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

  // month detail
  setCrumb(`Year ${year} • Budget • ${monthKey}`);
  view.innerHTML = "";

  const back = el("button", { class:"btn secondary", onclick: ()=>navTo(`#/year/${year}/budget`) }, [document.createTextNode("← Months")]);

  if (!yr.budget[monthKey]) yr.budget[monthKey] = { entries: [] };
  const month = yr.budget[monthKey];

  const form = budgetForm(db, year, monthKey);
  const table = budgetTable(db, year, monthKey);

  view.appendChild(el("div", { class:"stack" }, [
    el("div", { class:"row" }, [back]),
    form,
    table
  ]));
}

function budgetTotals(entries) {
  let income = 0, expense = 0;
  for (const e of entries) {
    const amt = Number(e.amount || 0);
    if (e.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, net: income - expense };
}

function budgetForm(db, year, monthKey) {
  const yr = getYear(db, year);
  const month = yr.budget[monthKey];

  let editingId = null;

  const wrap = el("div", { class:"card stack" });
  wrap.appendChild(el("div", { class:"item-title", html:"Add / Edit Entry" }));

  const type = el("select", { class:"input" });
  type.appendChild(el("option", { value:"income" }, [document.createTextNode("Income")]));
  type.appendChild(el("option", { value:"expense" }, [document.createTextNode("Expense")]));

  const label = el("input", { class:"input", placeholder:"Label (e.g. Salary / Rent / Groceries)" });
  const amount = el("input", { class:"input", type:"number", step:"0.01", placeholder:"Amount" });

  const cat = el("select", { class:"input" });
  // reuse categories + "other"
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
    // default date inside selected month
    const y = monthKey.slice(0,4), m = monthKey.slice(5,7);
    date.value = `${y}-${m}-01`;
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

    const payload = { type: type.value, label: l, amount: a, category: cat.value, date: d };

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

  wrap.appendChild(buttonRow([saveBtn, cancelBtn]));
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
    for (const c of cards) {
      if (c.textContent.includes("Add / Edit Entry")) return c;
    }
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

// ---------- Router ----------
window.addEventListener("hashchange", render);

// First run
if (!location.hash) location.hash = "#/dashboard";
render();
