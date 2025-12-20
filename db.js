/* db.js (FINAL)
   - Local-only storage (localStorage)
   - No preset years: user creates years manually from Dashboard
   - Global settings: currency (RON/EUR/USD), weekStartsOn Monday
   - Supports Goals, Habits (binary), Calendar, Budget Pro
   - Safe normalization/migrations
*/

const DB_KEY = "plans_app_db_v1";

// ---------- Utils ----------
function dbUid() {
  return (crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2)));
}

function dbTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    accounts: [
      { id: dbUid(), name: "Bank", type: "bank" },
      { id: dbUid(), name: "Cash", type: "cash" },
      { id: dbUid(), name: "Savings", type: "savings" }
    ],
    // transactions:
    // { id, type:"income"|"expense"|"transfer", amount, date, accountId, toAccountId?, categoryId?, note?, createdAt, _sig? }
    transactions: [],
    // recurringRules:
    // { id, type:"income"|"expense", amount, accountId, categoryId, note?, schedule, startDate?, endDate?, lastGeneratedThrough? }
    recurringRules: []
  };
}

function defaultYearModel(yearNum) {
  return {
    year: Number(yearNum),
    categories: defaultCategoriesPerYear(),
    goals: [],
    habits: [],
    calendar: {
      defaultView: "week",
      filters: { tasks: true, habits: true, milestones: true, goals: true },
      focus: { type: "all", id: "" }
    },
    budget: defaultBudgetPro()
  };
}

function dbFresh() {
  return {
    version: 1,
    settings: {
      currency: "RON",
      weekStartsOn: "monday",
      currentYear: null
    },
    yearsOrder: [],
    years: {}
  };
}

// ---------- Normalization ----------
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

  for (const k of ["goals", "habits", "budgetIncome", "budgetExpense"]) {
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
      : { kind: "weekdays" },
    checks: (h?.checks && typeof h.checks === "object") ? h.checks : {},
    linkedGoalIds: Array.isArray(h?.linkedGoalIds) ? h.linkedGoalIds.map(String) : [],
    createdAt: String(h?.createdAt || dbTodayISO())
  }));

  // Calendar
  if (!out.calendar || typeof out.calendar !== "object") out.calendar = defaultYearModel(y).calendar;
  out.calendar.defaultView = ["week", "month", "year"].includes(out.calendar.defaultView) ? out.calendar.defaultView : "week";
  if (!out.calendar.filters || typeof out.calendar.filters !== "object") {
    out.calendar.filters = { tasks: true, habits: true, milestones: true, goals: true };
  } else {
    out.calendar.filters.tasks = out.calendar.filters.tasks !== false;
    out.calendar.filters.habits = out.calendar.filters.habits !== false;
    out.calendar.filters.milestones = out.calendar.filters.milestones !== false;
    out.calendar.filters.goals = out.calendar.filters.goals !== false;
  }
  if (!out.calendar.focus || typeof out.calendar.focus !== "object") out.calendar.focus = { type: "all", id: "" };
  if (!["all", "goal", "habit"].includes(out.calendar.focus.type)) out.calendar.focus.type = "all";
  out.calendar.focus.id = String(out.calendar.focus.id || "");

  // Budget
  if (!out.budget || typeof out.budget !== "object") out.budget = defaultBudgetPro();

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
    createdAt: tx?.createdAt ? String(tx.createdAt) : dbTodayISO(),
    _sig: tx?._sig ? String(tx._sig) : undefined
  }));

  out.budget.recurringRules = Array.isArray(out.budget.recurringRules) ? out.budget.recurringRules : [];
  out.budget.recurringRules = out.budget.recurringRules.map(r => ({
    id: String(r?.id || dbUid()),
    type: (r?.type === "income" || r?.type === "expense") ? r.type : "expense",
    amount: Number(r?.amount || 0),
    accountId: String(r?.accountId || out.budget.accounts[0]?.id || ""),
    categoryId: String(r?.categoryId || ""),
    note: String(r?.note || ""),
    schedule: (r?.schedule && typeof r.schedule === "object")
      ? r.schedule
      : { kind: "monthly", dayOfMonth: 1, interval: 1 },
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
  out.settings.currency = String(out.settings.currency || "RON");
  out.settings.weekStartsOn = "monday";
  out.settings.currentYear =
    (out.settings.currentYear == null || out.settings.currentYear === "")
      ? null
      : Number(out.settings.currentYear);

  // Years
  out.years = out.years && typeof out.years === "object" ? out.years : {};
  out.yearsOrder = Array.isArray(out.yearsOrder) ? out.yearsOrder.map(Number).filter(Number.isFinite) : [];

  // Add keys present in years into yearsOrder
  for (const k of Object.keys(out.years)) {
    const n = Number(k);
    if (Number.isFinite(n) && !out.yearsOrder.includes(n)) out.yearsOrder.push(n);
  }
  out.yearsOrder.sort((a, b) => a - b);

  // Normalize each year model
  for (const y of out.yearsOrder) {
    out.years[String(y)] = normalizeYearModel(out.years[String(y)], y);
  }

  // If currentYear set but doesn't exist, create it
  if (out.settings.currentYear != null) {
    const cy = Number(out.settings.currentYear);
    if (!out.yearsOrder.includes(cy)) {
      out.yearsOrder.push(cy);
      out.yearsOrder.sort((a, b) => a - b);
      out.years[String(cy)] = defaultYearModel(cy);
    }
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
    db.yearsOrder.sort((a, b) => a - b);
  }

  return db.years[key];
}

function dbAddYear(db, yearNum) {
  const y = Number(yearNum);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) throw new Error("Invalid year");
  dbEnsureYear(db, y);
  db.settings.currentYear = y;
  dbSave(db);
}

/** Deletes a year AND all its data (goals/habits/budget/calendar settings). */
function dbDeleteYear(db, yearNum) {
  const y = Number(yearNum);
  if (!Number.isFinite(y)) throw new Error("Invalid year");

  const key = String(y);
  if (!db.years || !db.years[key]) throw new Error("Year not found");

  // Remove year model completely
  delete db.years[key];

  // Remove from years order
  db.yearsOrder = Array.isArray(db.yearsOrder) ? db.yearsOrder : [];
  db.yearsOrder = db.yearsOrder.filter(n => Number(n) !== y);

  // Fix current year
  if (db.settings?.currentYear === y) {
    db.settings.currentYear = db.yearsOrder.length ? db.yearsOrder[0] : null;
  }

  dbSave(db);
}

function dbExport(db) {
  return JSON.stringify(normalizeDb(db), null, 2);
}

function dbImport(jsonText) {
  const parsed = JSON.parse(jsonText);
  const normalized = normalizeDb(parsed);
  return normalized;
}

function dbGetYear(db, yearNum) {
  return dbEnsureYear(db, yearNum);
}

function dbGetCurrentYearModel(db) {
  const cy = db?.settings?.currentYear;
  if (cy == null) return null;
  return dbEnsureYear(db, Number(cy));
}

function dbSetCurrentYear(db, yearNum) {
  const y = Number(yearNum);
  dbEnsureYear(db, y);
  db.settings.currentYear = y;
  dbSave(db);
}
