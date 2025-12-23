/* db.js (v2.3 - STRICT categories + Apple Notes DB model)
- Local-only storage (localStorage)
- Years are user-created
- Everything is per-year (currentYear)
- Goals MUST have a valid categoryId (NO defaults like "General")
- If a goal has missing/invalid categoryId during normalize => it is DELETED
- Habits are per-year global (yr.habits) linked to goals via linkedGoalIds
- Notes are Apple Notes-ish: folders -> files -> notes (per-year)
  - Migration from old yr.notes[] {id,title,text,createdAt,updatedAt} -> new model
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

function dbNowMs() { return Date.now(); }

function dbParseMs(x) {
  if (Number.isFinite(x)) return Number(x);
  if (!x) return NaN;
  const t = new Date(String(x)).getTime();
  return Number.isFinite(t) ? t : NaN;
}

// ---------- Defaults ----------
function defaultCategoriesPerYear() {
  return {
    goals: [],         // {id, name, archived}  (THE ONLY category source for goals + habits)
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

/**
 * Notes model (Apple Notes-ish)
 * folders: [{id,name,createdAt,updatedAt}]
 * files:   [{id,folderId,name,createdAt,updatedAt}]
 * notes:   [{id,fileId,title,body,pinned,archived,createdAt,updatedAt}]
 * ui:      {folderId,fileId,noteId,q}
 */
function defaultNotesModel() {
  const now = dbNowMs();
  const folderId = dbUid();
  const fileId = dbUid();
  return {
    folders: [{ id: folderId, name: "iCloud", createdAt: now, updatedAt: now }],
    files:   [{ id: fileId, folderId, name: "Notes", createdAt: now, updatedAt: now }],
    notes:   [],
    ui: { folderId, fileId, noteId: "", q: "" }
  };
}

function defaultYearModel(yearNum) {
  const t = dbTodayISO();
  return {
    year: Number(yearNum),

    categories: defaultCategoriesPerYear(),

    goals: [],   // per-year
    habits: [],  // per-year (global list)

    // ✅ per-year notes model
    notes: defaultNotesModel(),

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
    createdAt: String(h?.createdAt || dbTodayISO()),
    title: String(h?.title || "Habit"),
    notes: String(h?.notes || ""),
    recurrenceRule:
      (h?.recurrenceRule && typeof h.recurrenceRule === "object")
        ? h.recurrenceRule
        : { kind: "weekdays" },
    linkedGoalIds: Array.isArray(h?.linkedGoalIds) ? h.linkedGoalIds.map(String) : [],
    checks: (h?.checks && typeof h.checks === "object") ? h.checks : {}
  };
}

// Notes normalize
function normNotesFolder(f) {
  const c = dbParseMs(f?.createdAt);
  const u = dbParseMs(f?.updatedAt);
  const createdAt = Number.isFinite(c) ? c : dbNowMs();
  const updatedAt = Number.isFinite(u) ? u : createdAt;

  return {
    id: String(f?.id || dbUid()),
    name: String(f?.name || "Folder"),
    createdAt,
    updatedAt
  };
}

function normNotesFile(fl) {
  const c = dbParseMs(fl?.createdAt);
  const u = dbParseMs(fl?.updatedAt);
  const createdAt = Number.isFinite(c) ? c : dbNowMs();
  const updatedAt = Number.isFinite(u) ? u : createdAt;

  return {
    id: String(fl?.id || dbUid()),
    folderId: String(fl?.folderId || ""),
    name: String(fl?.name || "Notes"),
    createdAt,
    updatedAt
  };
}

function normNote(n) {
  const c = dbParseMs(n?.createdAt);
  const u = dbParseMs(n?.updatedAt);
  const createdAt = Number.isFinite(c) ? c : dbNowMs();
  const updatedAt = Number.isFinite(u) ? u : createdAt;

  return {
    id: String(n?.id || dbUid()),
    fileId: String(n?.fileId || ""),
    title: String(n?.title || "Note"),
    body: String(n?.body ?? n?.text ?? ""),
    pinned: !!n?.pinned,
    archived: !!n?.archived,
    createdAt,
    updatedAt
  };
}

function normalizeNotesModel(notesAny) {
  // Old shape: yr.notes = [{id,title,text,createdAt,updatedAt}]
  if (Array.isArray(notesAny)) {
    const fresh = defaultNotesModel();
    const fileId = fresh.ui.fileId;

    fresh.notes = notesAny.map(n => {
      const createdAt = dbParseMs(n?.createdAt);
      const updatedAt = dbParseMs(n?.updatedAt) || createdAt;
      return {
        id: String(n?.id || dbUid()),
        fileId,
        title: String(n?.title || "Note"),
        body: String(n?.text || ""),
        pinned: false,
        archived: false,
        createdAt: Number.isFinite(createdAt) ? createdAt : dbNowMs(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : (Number.isFinite(createdAt) ? createdAt : dbNowMs())
      };
    });

    // select best note
    fresh.notes.sort((a,b) => (b.pinned|0)-(a.pinned|0) || (b.updatedAt||0)-(a.updatedAt||0));
    fresh.ui.noteId = fresh.notes[0]?.id || "";
    return fresh;
  }

  // Missing or invalid => default
  if (!notesAny || typeof notesAny !== "object") return defaultNotesModel();

  const out = notesAny;

  out.folders = Array.isArray(out.folders) ? out.folders.map(normNotesFolder) : [];
  out.files   = Array.isArray(out.files)   ? out.files.map(normNotesFile) : [];
  out.notes   = Array.isArray(out.notes)   ? out.notes.map(normNote) : [];
  out.ui      = (out.ui && typeof out.ui === "object") ? out.ui : { folderId:"", fileId:"", noteId:"", q:"" };

  // Ensure minimum structure exists
  if (!out.folders.length || !out.files.length) {
    const fresh = defaultNotesModel();
    const fileId = fresh.ui.fileId;
    fresh.notes = out.notes.map(n => ({ ...n, fileId }));
    fresh.notes.sort((a,b) => (b.pinned|0)-(a.pinned|0) || (b.updatedAt||0)-(a.updatedAt||0));
    fresh.ui.noteId = fresh.notes[0]?.id || "";
    return fresh;
  }

  // Fix file.folderId
  const folderIds = new Set(out.folders.map(f => f.id));
  out.files = out.files.map(f => ({
    ...f,
    folderId: folderIds.has(f.folderId) ? f.folderId : out.folders[0].id
  }));

  // Fix note.fileId
  const fileIds = new Set(out.files.map(f => f.id));
  const fallbackFileId = out.files[0].id;
  out.notes = out.notes.map(n => ({
    ...n,
    fileId: fileIds.has(n.fileId) ? n.fileId : fallbackFileId
  }));

  // UI validity
  out.ui.folderId = String(out.ui.folderId || "");
  out.ui.fileId = String(out.ui.fileId || "");
  out.ui.noteId = String(out.ui.noteId || "");
  out.ui.q = String(out.ui.q || "");

  if (!folderIds.has(out.ui.folderId)) out.ui.folderId = out.folders[0].id;

  const filesInFolder = out.files.filter(f => f.folderId === out.ui.folderId);
  const firstFileInFolder = filesInFolder[0] || out.files[0];

  if (!fileIds.has(out.ui.fileId)) out.ui.fileId = firstFileInFolder.id;
  if (!out.files.find(f => f.id === out.ui.fileId && f.folderId === out.ui.folderId)) {
    out.ui.fileId = firstFileInFolder.id;
  }

  const notesInFile = out.notes.filter(n => n.fileId === out.ui.fileId);
  const noteIdsInFile = new Set(notesInFile.map(n => n.id));
  if (!noteIdsInFile.has(out.ui.noteId)) {
    notesInFile.sort((a,b) => (b.pinned|0)-(a.pinned|0) || (b.updatedAt||0)-(a.updatedAt||0));
    out.ui.noteId = notesInFile[0]?.id || "";
  }

  return out;
}

function normalizeYearModel(yearModel, yearNumFallback) {
  const y = Number(yearModel?.year ?? yearNumFallback);
  const base = (yearModel && typeof yearModel === "object") ? yearModel : defaultYearModel(y);

  const out = base;
  out.year = y;

  // Categories
  if (!out.categories || typeof out.categories !== "object") out.categories = defaultCategoriesPerYear();
  out.categories.goals = Array.isArray(out.categories.goals) ? out.categories.goals.map(normCat) : [];
  out.categories.budgetIncome = Array.isArray(out.categories.budgetIncome) ? out.categories.budgetIncome.map(normCat) : [];
  out.categories.budgetExpense = Array.isArray(out.categories.budgetExpense) ? out.categories.budgetExpense.map(normCat) : [];

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
    milestones: Array.isArray(g?.milestones) ? g.milestones.map(normMilestone) : [],
    linkedHabitIds: Array.isArray(g?.linkedHabitIds) ? g.linkedHabitIds.map(String) : []
  }));

  // Habits
  out.habits = Array.isArray(out.habits) ? out.habits : [];
  out.habits = out.habits.map(normHabit);

  // Migration: goal.habits -> yr.habits
  const seenHabitIds = new Set(out.habits.map(h => h.id));
  for (const gRaw of (Array.isArray(base?.goals) ? base.goals : [])) {
    const gId = String(gRaw?.id || "");
    const goal = out.goals.find(x => x.id === gId);
    const innerHabits = Array.isArray(gRaw?.habits) ? gRaw.habits : [];
    if (!innerHabits.length) continue;

    for (const h0 of innerHabits) {
      const h = normHabit(h0);

      if (!seenHabitIds.has(h.id)) {
        out.habits.push(h);
        seenHabitIds.add(h.id);
      }

      const hRef = out.habits.find(x => x.id === h.id);
      if (hRef && goal) {
        hRef.linkedGoalIds = Array.isArray(hRef.linkedGoalIds) ? hRef.linkedGoalIds : [];
        if (!hRef.linkedGoalIds.includes(goal.id)) hRef.linkedGoalIds.push(goal.id);
      }

      if (goal) {
        goal.linkedHabitIds = Array.isArray(goal.linkedHabitIds) ? goal.linkedHabitIds.map(String) : [];
        if (!goal.linkedHabitIds.includes(h.id)) goal.linkedHabitIds.push(h.id);
      }
    }
  }

  // STRICT categories: delete invalid goals
  const validCatIds = new Set((out.categories.goals || []).map(c => String(c.id)));
  const deletedGoalIds = new Set();

  out.goals = (out.goals || []).filter(g => {
    const ok = !!g.categoryId && validCatIds.has(String(g.categoryId));
    if (!ok) deletedGoalIds.add(String(g.id));
    return ok;
  });

  if (deletedGoalIds.size) {
    out.habits = (out.habits || []).map(h => {
      h.linkedGoalIds = Array.isArray(h.linkedGoalIds) ? h.linkedGoalIds.map(String) : [];
      h.linkedGoalIds = h.linkedGoalIds.filter(id => !deletedGoalIds.has(String(id)));
      return h;
    });

    const habitIds = new Set((out.habits || []).map(h => h.id));
    out.goals = (out.goals || []).map(g => {
      g.linkedHabitIds = Array.isArray(g.linkedHabitIds) ? g.linkedHabitIds.map(String) : [];
      g.linkedHabitIds = g.linkedHabitIds.filter(id => habitIds.has(String(id)));
      return g;
    });
  }

  // ✅ Notes (new model + migration)
  out.notes = normalizeNotesModel(out.notes);

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
