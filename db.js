/* db.js (FINAL)
   - Local-only storage (localStorage)
   - Years are manual + isolated (per-year categories/data)
   - Prepared for Goals, Habits (binary), Calendar, Budget Pro
   - Includes safe migrations
*/

const DB_KEY = "plans_app_db_v1";

// ---------- Utils ----------
function dbUid() {
  // Prefer crypto UUID
  return (crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2)));
}

function dbTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- Defaults ----------
function defaultCategoriesPerYear() {
  return {
    goals: [],         // {id, name, archived}
    habits: [],        // {id, name, archived}
    budgetIncome: [],  // {id, name, archived}
    budgetExpense: []  // {id, name, archived}
  };
}

function defaultBudgetPro() {
  return {
    currency: "RON",
    accounts: [
      { id: dbUid(), name: "Bank", type: "bank" },
      { id: dbUid(), name: "Cash", type: "cash" },
      { id: dbUid(), name: "Savings", type: "savings" }
    ],
    // Transactions (Pro):
    // { id, type: "income"|"expense"|"transfer", amount, date, accountId, toAccountId?, categoryId?, note?, createdAt }
    transactions: [],
    // Recurring rules:
    // { id, type:"income"|"expense", amount, accountId, categoryId, note?, schedule, startDate?, endDate?, lastGeneratedThrough? }
    // schedule: { kind:"monthly"|"weekly"|"weekdays"|"daysOfWeek"|"everyNDays", interval?, daysOfWeek?[], dayOfMonth? }
    recurringRules: []
  };
}

function defaultYearModel(yearNum) {
  return {
    year: Number(yearNum),

    // per-year categories (your decision)
    categories: defaultCategoriesPerYear(),

    // Goals:
    // { id, title, categoryId, startDate?, endDate?, targetValue?, currentValue?, unit?, notes?,
    //   milestones:[{id,title,dueDate?,tasks:[{id,title,dueDate?,done}]}],
    //   linkedHabitIds:[]
    // }
    goals: [],

    // Habits (binary only):
    // { id, title, categoryId, notes?, recurrenceRule, checks:{[isoDate]:true}, linkedGoalIds:[] }
    habits: [],

    // Calendar preferences (optional; can be expanded later)
    calendar: {
      defaultView: "week",      // "week" | "month" | "year"
      filters: { tasks:true, habits:true, milestones:true, goals:true },
      focus: { type:"all", id:"" } // {type:"all"|"goal"|"habit", id}
    },

    // Budget Pro
    budget: defaultBudgetPro()
  };
}

function dbFresh() {
  return {
    version: 1,
    settings: {
      currency: "RON",
      weekStartsOn: "monday",
      currentYear: 2026
    },
    yearsOrder: [2026, 2027, 2028],
    years: {
      "2026": defaultYearModel(2026),
      "2027": defaultYearModel(2027),
      "2028": defaultYearModel(2028)
    }
  };
}

// ---------- Migrations / Normalization ----------
function normalizeYearModel(yearModel, yearNumFallback) {
  const y = Number(yearModel?.year ?? yearNumFallback);
  const out = (yearModel && typeof yearModel === "object") ? yearModel : defaultYearModel(y);

  out.year = y;

  // Categories
  if (!out.categories || typeof out.categories !== "object") out.categories = defaultCategoriesPerYear();
  const c = out.categories;
  c.goals = Array.isArray(c.goals) ? c.goals : [];
  c.habits = Array.isArray(c.habits) ? c.habits : [];
  c.budgetIncome = Array.isArray(c.budgetIncome) ? c.budgetIncome : [];
  c.budgetExpense = Array.isArray(c.budgetExpense) ? c.budgetExpense : [];

  // Ensure category items shape
  for (const k of ["goals","habits","budgetIncome","budgetExpense"]) {
    c[k] = c[k].map(x => ({
      id: String(x?.id || dbUid()),
      name: String(x?.name || "Category"),
      archived: !!x?.archived
    }));
  }

  // Goals
  out.goals = Array.isArray(out.goals) ? out.goals : [];
  out.goals = out.goals.map(g => ({
    id: String(g?.id || dbUid()),
    title: String(g?.title || "Untitled goal"),
    categoryId: String(g?.categoryId || ""),
    startDate: g?.startDate ? String(g.startDate) : "",
    endDate: g?.endDate ? String(g.endDate) : "",
    targetValue: (g?.targetValue ?? ""),
    currentValue: (g?.currentValue ?? ""),
    unit: String(g?.unit || ""),
    notes: String(g?.notes || ""),
    milestones: Array.isArray(g?.milestones) ? g.milestones.map(ms => ({
      id: String(ms?.id || dbUid()),
      title: String(ms?.title || "Milestone"),
      dueDate: ms?.dueDate ? String(ms.dueDate) : "",
      tasks: Array.isArray(ms?.tasks) ? ms.tasks.map(t => ({
        id: String(t?.id || dbUid()),
        title: String(t?.title || "Task"),
        dueDate: t?.dueDate ? String(t.dueDate) : "",
        done: !!t?.done
      })) : []
    })) : [],
    linkedHabitIds: Array.isArray(g?.linkedHabitIds) ? g.linkedHabitIds.map(String) : []
  }));

  // Habits
  out.habits = Array.isArray(out.habits) ? out.habits : [];
  out.habits = out.habits.map(h => ({
    id: String(h?.id || dbUid()),
    title: String(h?.title || "Untitled habit"),
    categoryId: String(h?.categoryId || ""),
    notes: String(h?.notes || ""),
    recurrenceRule: (h?.recurrenceRule && typeof h.recurrenceRule === "object")
      ? h.recurrenceRule
      : { kind: "daily" }, // placeholder default; engine comes in Habits stage
    checks: (h?.checks && typeof h.checks === "object") ? h.checks : {}, // { "YYYY-MM-DD": true }
    linkedGoalIds: Array.isArray(h?.linkedGoalIds) ? h.linkedGoalIds.map(String) : []
  }));

  // Calendar prefs
  if (!out.calendar || typeof out.calendar !== "object") out.calendar = defaultYearModel(y).calendar;
  out.calendar.defaultView = ["week","month","year"].includes(out.calendar.defaultView) ? out.calendar.defaultView : "week";
  if (!out.calendar.filters || typeof out.calendar.filters !== "object") {
    out.calendar.filters = { tasks:true, habits:true, milestones:true, goals:true };
  } else {
    out.calendar.filters.tasks = out.calendar.filters.tasks !== false;
    out.calendar.filters.habits = out.calendar.filters.habits !== false;
    out.calendar.filters.milestones = out.calendar.filters.milestones !== false;
    out.calendar.filters.goals = out.calendar.filters.goals !== false;
  }
  if (!out.calendar.focus || typeof out.calendar.focus !== "object") out.calendar.focus = { type:"all", id:"" };
  if (!["all","goal","habit"].includes(out.calendar.focus.type)) out.calendar.focus.type = "all";
  out.calendar.focus.id = String(out.calendar.focus.id || "");

  // Budget Pro
  if (!out.budget || typeof out.budget !== "object") out.budget = defaultBudgetPro();
  out.budget.currency = String(out.budget.currency || "RON");

  out.budget.accounts = Array.isArray(out.budget.accounts) ? out.budget.accounts : [];
  if (!out.budget.accounts.length) out.budget.accounts = defaultBudgetPro().accounts;

  out.budget.accounts = out.budget.accounts.map(a => ({
    id: String(a?.id || dbUid()),
    name: String(a?.name || "Account"),
    type: String(a?.type || "bank")
  }));

  out.budget.transactions = Array.isArray(out.budget.transactions) ? out.budget.transactions : [];
  out.budget.transactions = out.budget.transactions.map(tx => ({
    id: String(tx?.id || dbUid()),
    type: (tx?.type === "income" || tx?.type === "expense" || tx?.type === "transfer") ? tx.type : "expense",
    amount: Number(tx?.amount || 0),
    date: tx?.date ? String(tx.date) : dbTodayISO(),
    accountId: String(tx?.accountId || out.budget.accounts[0]?.id || ""),
    toAccountId: tx?.toAccountId ? String(tx.toAccountId) : "",
    categoryId: tx?.categoryId ? String(tx.categoryId) : "",
    note: String(tx?.note || ""),
    createdAt: tx?.createdAt ? String(tx.createdAt) : dbTodayISO()
  }));

  out.budget.recurringRules = Array.isArray(out.budget.recurringRules) ? out.budget.recurringRules : [];
  out.budget.recurringRules = out.budget.recurringRules.map(r => ({
    id: String(r?.id || dbUid()),
    type: (r?.type === "income" || r?.type === "expense") ? r.type : "expense",
    amount: Number(r?.amount || 0),
    accountId: String(r?.accountId || out.budget.accounts[0]?.id || ""),
    categoryId: String(r?.categoryId || ""),
    note: String(r?.note || ""),
    schedule: (r?.schedule && typeof r.schedule === "object") ? r.schedule : { kind: "monthly", dayOfMonth: 1, interval: 1 },
    startDate: r?.startDate ? String(r.startDate) : "",
    endDate: r?.endDate ? String(r.endDate) : "",
    lastGeneratedThrough: r?.lastGeneratedThrough ? String(r.lastGeneratedThrough) : ""
  }));

  return out;
}

function normalizeDb(db) {
  const out = (db && typeof db === "object") ? db : dbFresh();

  out.version = 1;

  // Settings
  out.settings = out.settings && typeof out.settings === "object" ? out.settings : {};
  out.settings.currency = "RON"; // per your decision
  out.settings.weekStartsOn = "monday"; // per your decision
  out.settings.currentYear = Number(out.settings.currentYear || 2026);

  // Years
  out.years = out.years && typeof out.years === "object" ? out.years : {};
  out.yearsOrder = Array.isArray(out.yearsOrder) ? out.yearsOrder.map(Number).filter(Number.isFinite) : [];

  // Ensure yearsOrder matches years keys
  const keys = Object.keys(out.years);
  for (const k of keys) {
    const n = Number(k);
    if (Number.isFinite(n) && !out.yearsOrder.includes(n)) out.yearsOrder.push(n);
  }

  // If empty, seed defaults
  if (!out.yearsOrder.length) {
    out.yearsOrder = [2026, 2027, 2028];
    out.years["2026"] = defaultYearModel(2026);
    out.years["2027"] = defaultYearModel(2027);
    out.years["2028"] = defaultYearModel(2028);
  }

  out.yearsOrder.sort((a,b)=>a-b);

  // Normalize each year model
  for (const y of out.yearsOrder) {
    const key = String(y);
    out.years[key] = normalizeYearModel(out.years[key], y);
    // Ensure currency matches settings for consistency
    out.years[key].budget.currency = "RON";
  }

  // Ensure currentYear exists
  const cy = Number(out.settings.currentYear);
  if (!out.yearsOrder.includes(cy)) {
    out.yearsOrder.push(cy);
    out.yearsOrder.sort((a,b)=>a-b);
    out.years[String(cy)] = defaultYearModel(cy);
  }

  return out;
}

// ---------- Public DB API ----------
function dbLoad() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const fresh = normalizeDb(dbFresh());
      localStorage.setItem(DB_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeDb(parsed);
    // Write back normalized to keep schema clean
    localStorage.setItem(DB_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const fresh = normalizeDb(dbFresh());
    localStorage.setItem(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function dbSave(db) {
  const normalized = normalizeDb(db);
  localStorage.setItem(DB_KEY, JSON.stringify(normalized));
}

function dbEnsureYear(db, yearNum) {
  const y = Number(yearNum);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) throw new Error("Invalid year");

  db.years = db.years && typeof db.years === "object" ? db.years : {};
  db.yearsOrder = Array.isArray(db.yearsOrder) ? db.yearsOrder : [];

  const key = String(y);
  if (!db.years[key]) db.years[key] = defaultYearModel(y);
  db.years[key] = normalizeYearModel(db.years[key], y);

  if (!db.yearsOrder.includes(y)) {
    db.yearsOrder.push(y);
    db.yearsOrder.sort((a,b)=>a-b);
  }

  // Keep consistent currency
  db.years[key].budget.currency = "RON";
  return db.years[key];
}

function dbAddYear(db, yearNum) {
  const y = Number(yearNum);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) throw new Error("Invalid year");
  dbEnsureYear(db, y);
  db.settings.currentYear = y;
  dbSave(db);
}

function dbExport(db) {
  // Export normalized so it can be re-imported safely
  return JSON.stringify(normalizeDb(db), null, 2);
}

function dbImport(jsonText) {
  const parsed = JSON.parse(jsonText);
  const normalized = normalizeDb(parsed);
  return normalized;
}

// ---------- Convenience helpers for future modules ----------
function dbGetYear(db, yearNum) {
  return dbEnsureYear(db, yearNum);
}

function dbGetCurrentYearModel(db) {
  const y = Number(db?.settings?.currentYear || 2026);
  return dbEnsureYear(db, y);
}

function dbSetCurrentYear(db, yearNum) {
  const y = Number(yearNum);
  dbEnsureYear(db, y);
  db.settings.currentYear = y;
  dbSave(db);
}
