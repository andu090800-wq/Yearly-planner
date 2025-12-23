/* db.js (v2 - Goals by Category per Year + Habits inside Goals)
- Local-only storage (localStorage)
- Years are user-created
- Everything is per-year (currentYear), including goals/habits/budget/notes/calendar
- Goals MUST have a categoryId
- Habits are stored inside each goal (parallel to milestones)
- Safe normalization + migration from old structure
*/

const DB_KEY = "plans_app_db_v1"; // păstrat ca să NU pierzi datele vechi

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
    transactions: [],
    recurringRules: []
  };
}

function defaultYearModel(yearNum) {
  const t = dbTodayISO();
  return {
    year: Number(yearNum),

    categories: defaultCategoriesPerYear(),

    // goals per-year
    goals: [],

    // notes per-year (simplu pentru moment)
    notes: [], // {id, title, text, createdAt, updatedAt}

    calendar: {
      defaultView: "week", // day|week|month|year
      filters: { tasks: true, habits: true, milestones: true, goals: true },
      focus: { type: "all", id: "" },
      focusDate: t,
      selectedDate: t,
      panelsOpen: false
    },

    budget: defaultBudgetPro()
  };
}

function dbFresh() {
  return {
    version: 2,
    settings: {
      currency: "RON",
      weekStartsOn: "monday",
      currentYear: null
    },
    yearsOrder: [],
    years: {}
  };
}

// ---------- Normalize helpers ----------
function normCat(x) {
  return {
    id: String(x?.id || dbUid()),
    name: String(x?.name || "Category"),
    archived: !!x?.archived
  };
}

function normTask(t) {
  return {
    id: String(t?.id || dbUid()),
    title: String(t?.title || "Task"),
    dueDate: t?.dueDate ? String(t.dueDate) : "",
    done: !!t?.done
  };
}

function normMilestone(ms) {
  return {
    id: String(ms?.id || dbUid()),
    title: String(ms?.title || "Milestone"),
    dueDate: ms?.dueDate ? String(ms.dueDate) : "",
    tasks: Array.isArray(ms?.tasks) ? ms.tasks.map(normTask) : []
  };
}

function normHabit(h) {
  return {
    id: String(h?.id || dbUid()),
    title: String(h?.title || "Habit"),
    notes: String(h?.notes || ""),
    recurrenceRule: (h?.recurrenceRule && typeof h.recurrenceRule === "object")
      ? h.recurrenceRule
      : { kind: "weekdays" },
    checks: (h?.checks && typeof h.checks === "object") ? h.checks : {},
    createdAt: String(h?.createdAt || dbTodayISO())
  };
}

function normalizeYearModel(yearModel, yearNumFallback) {
  const y = Number(yearModel?.year ?? yearNumFallback);
  const out = (yearModel && typeof yearModel === "object") ? yearModel : defaultYearModel(y);
  out.year = y;

  // Categories
  if (!out.categories || typeof out.categories !== "object") out.categories = defaultCategoriesPerYear();
  out.categories.goals = Array.isArray(out.categories.goals) ? out.categories.goals.map(normCat) : [];
  out.categories.budgetIncome = Array.isArray(out.categories.budgetIncome) ? out.categories.budgetIncome.map(normCat) : [];
  out.categories.budgetExpense = Array.isArray(out.categories.budgetExpense) ? out.categories.budgetExpense.map(normCat) : [];

  // Ensure at least a default goal category if we have goals without category (migration)
  function ensureGeneralGoalCategory() {
    let g = out.categories.goals.find(c => (c?.name || "").toLowerCase() === "general");
    if (!g) {
      g = { id: dbUid(), name: "General", archived: false };
      out.categories.goals.unshift(g);
    }
    return g.id;
  }

  // Goals
  out.goals = Array.isArray(out.goals) ? out.goals : [];
  out.goals = out.goals.map(g => ({
    id: String(g?.id || dbUid()),
    title: String(g?.title || "Untitled goal"),
    categoryId: String(g?.categoryId || ""), // MUST exist (we'll fix below)
    startDate: g?.startDate ? String(g.startDate) : "",
    endDate: g?.endDate ? String(g.endDate) : "",
    targetValue: (g?.targetValue ?? ""),
    currentValue: (g?.currentValue ?? ""),
    unit: String(g?.unit || ""),
    notes: String(g?.notes || ""),

    milestones: Array.isArray(g?.milestones) ? g.milestones.map(normMilestone) : [],

    // NEW: habits inside goal (parallel to milestones)
    habits: Array.isArray(g?.habits) ? g.habits.map(normHabit) : []
  }));

  // Migration: if old structure had linkedHabitIds or year.habits, try to attach
  // (we won't keep global habits as feature, but we won't lose data)
  const legacyYearHabits = Array.isArray(out.habits) ? out.habits : []; // from old db.js
  if (legacyYearHabits.length) {
    // Build quick maps
    const byId = new Map(legacyYearHabits.map(h => [String(h?.id || ""), h]));
    // Attach by linkedGoalIds
    for (const lh of legacyYearHabits) {
      const linkedGoalIds = Array.isArray(lh?.linkedGoalIds) ? lh.linkedGoalIds.map(String) : [];
      if (!linkedGoalIds.length) continue;
      for (const gid of linkedGoalIds) {
        const goal = out.goals.find(g => g.id === gid);
        if (goal) goal.habits.push(normHabit(lh));
      }
    }

    // Attach by goals that had linkedHabitIds (old)
    for (const goalRaw of (Array.isArray(yearModel?.goals) ? yearModel.goals : [])) {
      const goal = out.goals.find(g => g.id === String(goalRaw?.id || ""));
      const linkedHabitIds = Array.isArray(goalRaw?.linkedHabitIds) ? goalRaw.linkedHabitIds.map(String) : [];
      if (!goal || !linkedHabitIds.length) continue;
      for (const hid of linkedHabitIds) {
        const lh = byId.get(hid);
        if (lh) goal.habits.push(normHabit(lh));
      }
    }

    // Any leftover habits that weren't attached → put into a special imported goal
    const attached = new Set();
    for (const g of out.goals) for (const h of g.habits) attached.add(h.id);

    const leftovers = legacyYearHabits
      .map(normHabit)
      .filter(h => !attached.has(h.id));

    if (leftovers.length) {
      const catId = ensureGeneralGoalCategory();
      out.goals.push({
        id: dbUid(),
        title: "Imported Habits",
        categoryId: catId,
        startDate: "",
        endDate: "",
        targetValue: "",
        currentValue: "",
        unit: "",
        notes: "Auto-created during migration.",
        milestones: [],
        habits: leftovers
      });
    }
  }

  // Enforce categoryId for every goal (required)
  const generalId = ensureGeneralGoalCategory();
  const validCatIds = new Set(out.categories.goals.map(c => c.id));
  for (const g of out.goals) {
    if (!g.categoryId || !validCatIds.has(g.categoryId)) g.categoryId = generalId;
  }

  // Notes
  out.notes = Array.isArray(out.notes) ? out.notes : [];
  out.notes = out.notes.map(n => ({
    id: String(n?.id || dbUid()),
    title: String(n?.title || "Note"),
    text: String(n?.text || ""),
    createdAt: String(n?.createdAt || dbTodayISO()),
    updatedAt: String(n?.updatedAt || n?.createdAt || dbTodayISO())
  }));

  // Calendar
  if (!out.calendar || typeof out.calendar !== "object") out.calendar = defaultYearModel(y).calendar;

  out.calendar.defaultView =
    ["day", "week", "month", "year"].includes(out.calendar.defaultView)
      ? out.calendar.defaultView
      : "week";

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

  const t = dbTodayISO();
  out.calendar.focusDate = out.calendar.focusDate ? String(out.calendar.focusDate) : t;
  out.calendar.selectedDate = out.calendar.selectedDate ? String(out.calendar.selectedDate) : t;
  out.calendar.panelsOpen = !!out.calendar.panelsOpen;

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

  // cleanup legacy field if present (not used anymore)
  out.habits = []; // no global habits
  return out;
}

function normalizeDb(db) {
  const out = (db && typeof db === "object") ? db : dbFresh();
  out.version = 2;

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

  for (const k of Object.keys(out.years)) {
    const n = Number(k);
    if (Number.isFinite(n) && !out.yearsOrder.includes(n)) out.yearsOrder.push(n);
  }
  out.yearsOrder.sort((a, b) => a - b);

  for (const y of out.yearsOrder) {
    out.years[String(y)] = normalizeYearModel(out.years[String(y)], y);
  }

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

function dbDeleteYear(db, yearNum) {
  const y = Number(yearNum);
  if (!Number.isFinite(y)) throw new Error("Invalid year");

  const key = String(y);
  if (!db.years || !db.years[key]) throw new Error("Year not found");

  delete db.years[key];

  db.yearsOrder = Array.isArray(db.yearsOrder) ? db.yearsOrder : [];
  db.yearsOrder = db.yearsOrder.filter(n => Number(n) !== y);

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
