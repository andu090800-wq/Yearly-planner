window.Views = window.Views || {};

window.Views.calendar = ({ db, App, setPrimary }) => {
  const year = App.getCurrentYear(db);
  if (year == null) {
    App.toast("Add your first year in Dashboard");
    return App.navTo("#/dashboard");
  }

  const yr = App.getYearModel(db);
  const today = dbTodayISO();

  setPrimary("+ Add", () => {
    const choice = prompt("Add: goal / habit / budget ?", "goal");
    if (!choice) return;
    const c = choice.toLowerCase().trim();
    if (c.startsWith("g")) return App.navTo("#/goals");
    if (c.startsWith("h")) return App.navTo("#/habits");
    if (c.startsWith("b")) return App.navTo("#/budget");
    App.navTo("#/goals");
  });

  App.setCrumb(`Calendar • ${year}`);

  // ---- Date helpers ----
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (iso) => {
    const [Y, M, D] = String(iso).split("-").map(Number);
    return new Date(Y, (M || 1) - 1, D || 1);
  };
  const addDays = (iso, n) => {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const startOfWeekMonday = (iso) => {
    const d = fromISO(iso);
    const day = d.getDay(); // 0 Sun..6 Sat
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return toISO(d);
  };
  const monthKey = (iso) => String(iso).slice(0, 7);
  const startOfMonth = (iso) => `${monthKey(iso)}-01`;
  const daysInMonth = (iso) => {
    const d = fromISO(startOfMonth(iso));
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  };
  const dowLabel = (iso) => {
    const d = fromISO(iso);
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return names[d.getDay()];
  };

  // ---- Calendar prefs ----
  yr.calendar = yr.calendar || {
    defaultView: "month",
    filters: { tasks: true, habits: true, milestones: true, goals: true },
    focus: { type: "all", id: "" },
    focusDate: today,
    selectedDate: today
  };
  yr.calendar.filters = yr.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
  yr.calendar.focus = yr.calendar.focus || { type: "all", id: "" };
  yr.calendar.selectedDate = yr.calendar.selectedDate || today;

  // force month if old data had week
  if (yr.calendar.defaultView === "week") yr.calendar.defaultView = "month";

  const view = yr.calendar.defaultView || "month";
  const focusDate = yr.calendar.focusDate || today;

  function savePrefs(patch) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    Object.assign(yr2.calendar, patch);
    dbSave(db2);
  }

  // ---- Habits due ----
  function habitDueOn(h, iso) {
    try { if (window.Habits?.habitDueOn) return !!window.Habits.habitDueOn(h, iso); } catch {}
    const r = h.recurrenceRule || { kind: "weekdays" };
    const day = fromISO(iso).getDay();
    if (r.kind === "daily") return true;
    if (r.kind === "weekdays") return day >= 1 && day <= 5;
    if (r.kind === "weeklyOn") return (Array.isArray(r.days) ? r.days : []).includes(day);
    return day >= 1 && day <= 5;
  }

  function toggleHabitCheck(habitId, iso) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    const h = (yr2.habits || []).find(x => x.id === habitId);
    if (!h) return;
    h.checks = (h.checks && typeof h.checks === "object") ? h.checks : {};
    if (h.checks[iso]) delete h.checks[iso];
    else h.checks[iso] = true;
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  // ---- Focus ----
  function getFocus(dbNow) {
    const yrNow = App.getYearModel(dbNow);
    const f = yrNow.calendar?.focus || { type: "all", id: "" };
    const type = ["all", "goal", "habit"].includes(f.type) ? f.type : "all";
    const id = String(f.id || "");
    return { type, id };
  }

  function focusLabel(dbNow) {
    const f = getFocus(dbNow);
    const yrNow = App.getYearModel(dbNow);
    if (f.type === "all") return "All";
    if (f.type === "goal") {
      const g = (yrNow.goals || []).find(x => x.id === f.id);
      return g ? `Goal: ${g.title}` : "Goal";
    }
    if (f.type === "habit") {
      const h = (yrNow.habits || []).find(x => x.id === f.id);
      return h ? `Habit: ${h.title}` : "Habit";
    }
    return "All";
  }

  function passesFocusForGoal(goalId, dbNow) {
    const f = getFocus(dbNow);
    if (f.type === "all") return true;
    if (f.type === "goal") return f.id === goalId;
    return false;
  }

  function passesFocusForHabit(habit, dbNow) {
    const f = getFocus(dbNow);
    if (f.type === "all") return true;
    if (f.type === "habit") return f.id === habit.id;
    if (f.type === "goal") {
      const linked = Array.isArray(habit.linkedGoalIds) ? habit.linkedGoalIds : [];
      return linked.includes(f.id);
    }
    return true;
  }

  // ---- Items ----
  function itemsForDay(iso) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);
    const filters = yrNow.calendar?.filters || { tasks: true, habits: true, milestones: true, goals: true };
    const items = [];

    if (filters.goals) {
      for (const g of (yrNow.goals || [])) {
        if (!passesFocusForGoal(g.id, dbNow)) continue;

        if ((g.endDate || "").trim() && g.endDate === iso) {
          items.push({ kind: "goal", title: `Goal deadline: ${g.title}`, overdue: false, nav: `#/goal/${g.id}` });
        }
        if (iso === today && (g.endDate || "").trim() && g.endDate < today) {
          items.push({ kind: "goal", title: `Overdue goal: ${g.title}`, overdue: true, nav: `#/goal/${g.id}` });
        }
      }
    }

    for (const g of (yrNow.goals || [])) {
      if (!passesFocusForGoal(g.id, dbNow)) continue;
      const ms = Array.isArray(g.milestones) ? g.milestones : [];

      if (filters.milestones) {
        for (const m of ms) {
          if ((m.dueDate || "").trim() && m.dueDate === iso) {
            items.push({ kind: "milestone", title: `Milestone: ${m.title} (${g.title})`, overdue: false, nav: `#/goal/${g.id}` });
          }
        }
      }

      if (filters.tasks) {
        for (const m of ms) {
          const tasks = Array.isArray(m.tasks) ? m.tasks : [];
          for (const t of tasks) {
            if ((t.dueDate || "").trim() && t.dueDate === iso) {
              items.push({
                kind: "task",
                title: `${t.done ? "✅ " : ""}Task: ${t.title} (${g.title})`,
                overdue: (!t.done && t.dueDate < today),
                nav: `#/goal/${g.id}`
              });
            }
            if (iso === today && !t.done && (t.dueDate || "").trim() && t.dueDate < today) {
              items.push({ kind: "task", title: `Overdue: ${t.title} (${g.title})`, overdue: true, nav: `#/goal/${g.id}` });
            }
          }
        }
      }
    }

    if (filters.habits) {
      for (const h of (yrNow.habits || [])) {
        if (!passesFocusForHabit(h, dbNow)) continue;
        if (!habitDueOn(h, iso)) continue;
        items.push({ kind: "habit", title: h.title, overdue: false, habitId: h.id, done: !!h.checks?.[iso] });
      }
    }

    const order = { task: 1, milestone: 2, goal: 3, habit: 4 };
    items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (order[a.kind] || 99) - (order[b.kind] || 99);
    });

    return items;
  }

  // ---- WEEK: iPhone-like strip + agenda ----
  function renderWeek(anchorISO) {
    const start = startOfWeekMonday(anchorISO);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const sel = (yr.calendar.selectedDate || today);

    const strip = days.map(d => {
      const its = itemsForDay(d);
      const hasAny = its.length > 0;
      const isToday = d === today;
      const isSel = d === sel;
      const hasOverdue = its.some(x => x.overdue);

      const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      const idx = (fromISO(d).getDay() + 6) % 7;

      return `
        <button class="wkDay ${isSel ? "sel" : ""} ${isToday ? "today" : ""} ${hasOverdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="wkDow">${dow[idx]}</div>
          <div class="wkNum">${App.esc(String(Number(d.slice(8,10))))}</div>
          <div class="wkDot ${hasAny ? "" : "ghost"}"></div>
        </button>
      `;
    }).join("");

    const its = itemsForDay(sel);
    const list = its.length ? its.map(it => {
      if (it.kind === "habit") {
        return `
          <div class="agRow">
            <label class="agHabit">
              <input type="checkbox" ${it.done ? "checked" : ""} data-habit="${App.esc(it.habitId)}" data-date="${App.esc(sel)}" />
              <span class="agTitle">${App.esc(it.title)}</span>
            </label>
            <span class="agTag">habit</span>
          </div>
        `;
      }
      return `
        <button class="agRow agBtn ${it.overdue ? "bad" : ""}" data-nav="${App.esc(it.nav)}">
          <div class="agText">
            <div class="agTitle">${App.esc(it.title)}</div>
            <div class="agSub">${App.esc(it.kind)}</div>
          </div>
          <span class="agTag ${it.overdue ? "bad" : ""}">${App.esc(it.kind)}</span>
        </button>
      `;
    }).join("") : `<div class="muted">No items.</div>`;

    return `
      <div class="card big stack" style="gap:12px">
        <div class="wkHead">
          <div class="title2">Week (iPhone)</div>
          <span class="pill">${App.esc(start)} → ${App.esc(addDays(start,6))}</span>
        </div>

        <div class="wkStrip">${strip}</div>

        <div class="agWrap">
          <div class="agHead">
            <div class="title2">Agenda</div>
            <span class="pill">${App.esc(sel)}${sel === today ? " • Today" : ""}</span>
          </div>
          <div class="agList">${list}</div>
        </div>
      </div>
    `;
  }

  // ---- MONTH: already iPhone-like circles/dots ----
  function renderMonth(anchorISO) {
    const monthStart = startOfMonth(anchorISO);
    const gridStart = startOfWeekMonday(monthStart);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const header = `
      <div class="calMonthHead">
        <div class="calMonthTitle">${App.esc(fromISO(startOfMonth(anchorISO)).toLocaleString("ro-RO",{month:"long",year:"numeric"}))}</div>
        <div class="muted">Tap a day to open week</div>
      </div>
    `;

    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(x => `<div class="calDow">${x}</div>`).join("");

    const selected = (yr.calendar.selectedDate || today);

    const cellHtml = cells.map(d => {
      const inMonth = monthKey(d) === monthKey(anchorISO);
      const its = itemsForDay(d);

      const hasOverdue = its.some(x => x.overdue);
      const isToday = d === today;
      const isSel = d === selected;

      const hasTasks = its.some(x => x.kind === "task" || x.kind === "milestone");
      const hasHabits = its.some(x => x.kind === "habit");
      const hasGoals = its.some(x => x.kind === "goal");

      return `
        <button class="calCell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${hasOverdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="calCellTop">
            <span class="calCellNum">${App.esc(String(Number(d.slice(8, 10))))}</span>
          </div>
          <div class="calDots">
            ${hasTasks ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
            ${hasHabits ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
            ${hasGoals ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
          </div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big stack">
        ${header}
        <div class="calGrid calGridHead">${dow}</div>
        <div class="calGrid">${cellHtml}</div>
      </div>
    `;
  }

  // ---- YEAR ----
  function renderYear(anchorISO) {
    const Y = Number(String(anchorISO).slice(0, 4));
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${pad2(i + 1)}-01`);

    const monthCards = months.map(m0 => {
      const dim = daysInMonth(m0);
      let total = 0;
      for (let d = 1; d <= dim; d++) total += itemsForDay(`${monthKey(m0)}-${pad2(d)}`).length;

      return `
        <button class="card calMonthCard" data-month="${App.esc(m0)}">
          <div class="calMonthCardTitle">${App.esc(monthKey(m0))}</div>
          <div class="muted">${total} items</div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big stack">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="title2">Year ${App.esc(String(Y))}</div>
            <div class="muted">Tap a month to open month view</div>
          </div>
        </div>
        <div class="calMonthsGrid">
          ${monthCards}
        </div>
      </div>
    `;
  }

  // ---- Nav ----
  function navPrev(v, iso) {
    if (v === "week") return addDays(iso, -7);
    if (v === "month") {
      const d = fromISO(startOfMonth(iso));
      d.setMonth(d.getMonth() - 1);
      return toISO(d);
    }
    const d = fromISO(`${String(iso).slice(0, 4)}-01-01`);
    d.setFullYear(d.getFullYear() - 1);
    return toISO(d);
  }
  function navNext(v, iso) {
    if (v === "week") return addDays(iso, +7);
    if (v === "month") {
      const d = fromISO(startOfMonth(iso));
      d.setMonth(d.getMonth() + 1);
      return toISO(d);
    }
    const d = fromISO(`${String(iso).slice(0, 4)}-01-01`);
    d.setFullYear(d.getFullYear() + 1);
    return toISO(d);
  }

  // ---- UI ----
  const filters = yr.calendar.filters;

  const goalOptions = (yr.goals || []).map(g => `<option value="${App.esc(g.id)}">${App.esc(g.title)}</option>`).join("");
  const habitOptions = (yr.habits || []).map(h => `<option value="${App.esc(h.id)}">${App.esc(h.title)}</option>`).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big">
        <div class="stack" style="gap:10px">
          <div>
            <div class="title2">Calendar</div>
            <div class="muted">Default monthly • Switch weekly/monthly/yearly • Filters • Focus</div>
          </div>

          <div class="row">
            <button class="btn secondary small" id="prevBtn">Prev</button>
            <button class="btn secondary small" id="todayBtn">Today</button>
            <button class="btn secondary small" id="nextBtn">Next</button>

            <span class="pill">Focus date <b id="focusLbl">${App.esc(focusDate)}</b></span>
            <span class="pill">View <b id="viewLbl">${App.esc(view)}</b></span>
          </div>

          <div class="row">
            <button class="btn secondary" id="weeklyBtn">Weekly</button>
            <button class="btn secondary" id="monthlyBtn">Monthly</button>
            <button class="btn secondary" id="yearlyBtn">Yearly</button>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Focus filter</div>
        <div class="muted">Show everything, or focus on one goal / one habit.</div>

        <div class="row" style="align-items:flex-end">
          <div style="min-width:180px">
            <div class="muted">Mode</div>
            <select id="focusMode" class="input">
              <option value="all">All</option>
              <option value="goal">One goal</option>
              <option value="habit">One habit</option>
            </select>
          </div>

          <div id="focusGoalWrap" style="min-width:220px; display:none">
            <div class="muted">Goal</div>
            <select id="focusGoalId" class="input">
              ${goalOptions || `<option value="">(no goals)</option>`}
            </select>
          </div>

          <div id="focusHabitWrap" style="min-width:220px; display:none">
            <div class="muted">Habit</div>
            <select id="focusHabitId" class="input">
              ${habitOptions || `<option value="">(no habits)</option>`}
            </select>
          </div>

          <button class="btn secondary" id="clearFocusBtn">Clear</button>

          <span class="pill" id="focusNamePill">${App.esc(focusLabel(db))}</span>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Filters</div>
        <div class="row">
          <label class="pill"><input type="checkbox" id="fTasks" ${filters.tasks ? "checked" : ""}/> tasks</label>
          <label class="pill"><input type="checkbox" id="fHabits" ${filters.habits ? "checked" : ""}/> habits</label>
          <label class="pill"><input type="checkbox" id="fMilestones" ${filters.milestones ? "checked" : ""}/> milestones</label>
          <label class="pill"><input type="checkbox" id="fGoals" ${filters.goals ? "checked" : ""}/> goals</label>
        </div>
        <div class="muted">Tip: Habits “done” can be toggled from Calendar too.</div>
      </div>

      <div id="calBody"></div>
    </div>
  `;

  function rerender(bodyISO, nextView) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);

    const v = nextView || (yrNow.calendar?.defaultView || "month");
    const iso = bodyISO || (yrNow.calendar?.focusDate || today);
    const selected = yrNow.calendar?.selectedDate || today;

    savePrefs({
      defaultView: v,
      focusDate: iso,
      selectedDate: (nextView === "week" && bodyISO ? bodyISO : selected)
    });

    const dbNow2 = dbLoad();
    const yrNow2 = App.getYearModel(dbNow2);

    document.getElementById("viewLbl").textContent = (yrNow2.calendar?.defaultView || "month");
    document.getElementById("focusLbl").textContent = (yrNow2.calendar?.focusDate || today);
    document.getElementById("focusNamePill").textContent = focusLabel(dbNow2);

    const el = document.getElementById("calBody");
    const vNow = (yrNow2.calendar?.defaultView || "month");
    const isoNow = (yrNow2.calendar?.focusDate || today);

    if (vNow === "month") el.innerHTML = renderMonth(isoNow);
    else if (vNow === "year") el.innerHTML = renderYear(isoNow);
    else el.innerHTML = renderWeek(isoNow);

    // habit toggles
    el.querySelectorAll("input[type='checkbox'][data-habit]").forEach(cb => {
      cb.onchange = () => toggleHabitCheck(cb.getAttribute("data-habit"), cb.getAttribute("data-date"));
    });

    // agenda nav
    el.querySelectorAll("[data-nav]").forEach(btn => {
      btn.onclick = () => { location.hash = btn.getAttribute("data-nav"); };
    });

    // month/day click: select + open week
    el.querySelectorAll("[data-day]").forEach(btn => {
      btn.onclick = () => {
        const d = btn.getAttribute("data-day");
        savePrefs({ selectedDate: d, focusDate: d });
        rerender(d, "week");
      };
    });

    // week strip day select
    el.querySelectorAll(".wkDay[data-day]").forEach(btn => {
      btn.onclick = () => {
        const d = btn.getAttribute("data-day");
        savePrefs({ selectedDate: d, focusDate: d });
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    });

    // year/month click
    el.querySelectorAll("[data-month]").forEach(btn => {
      btn.onclick = () => rerender(btn.getAttribute("data-month"), "month");
    });
  }

  // Filters binding
  const bindFilter = (id, key) => {
    const el = document.getElementById(id);
    el.onchange = () => {
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.filters = yr2.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
      yr2.calendar.filters[key] = !!el.checked;
      dbSave(db2);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  };
  bindFilter("fTasks", "tasks");
  bindFilter("fHabits", "habits");
  bindFilter("fMilestones", "milestones");
  bindFilter("fGoals", "goals");

  // View buttons
  document.getElementById("weeklyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "week");
  document.getElementById("monthlyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "month");
  document.getElementById("yearlyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "year");

  // Nav buttons
  document.getElementById("todayBtn").onclick = () => rerender(today, (yr.calendar.defaultView || "month"));
  document.getElementById("prevBtn").onclick = () => rerender(navPrev(yr.calendar.defaultView || "month", yr.calendar.focusDate || today));
  document.getElementById("nextBtn").onclick = () => rerender(navNext(yr.calendar.defaultView || "month", yr.calendar.focusDate || today));

  // Focus UI wiring
  const modeEl = document.getElementById("focusMode");
  const goalWrap = document.getElementById("focusGoalWrap");
  const habitWrap = document.getElementById("focusHabitWrap");
  const goalEl = document.getElementById("focusGoalId");
  const habitEl = document.getElementById("focusHabitId");
  const clearBtn = document.getElementById("clearFocusBtn");

  function syncFocusUI() {
    const dbNow = dbLoad();
    const f = getFocus(dbNow);

    modeEl.value = f.type;
    goalWrap.style.display = (f.type === "goal") ? "block" : "none";
    habitWrap.style.display = (f.type === "habit") ? "block" : "none";

    if (f.type === "goal" && goalEl) goalEl.value = f.id || (goalEl.options[0]?.value || "");
    if (f.type === "habit" && habitEl) habitEl.value = f.id || (habitEl.options[0]?.value || "");

    document.getElementById("focusNamePill").textContent = focusLabel(dbNow);
  }

  modeEl.onchange = () => {
    const mode = modeEl.value;
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};

    if (mode === "goal") yr2.calendar.focus = { type: "goal", id: goalEl?.value || "" };
    else if (mode === "habit") yr2.calendar.focus = { type: "habit", id: habitEl?.value || "" };
    else yr2.calendar.focus = { type: "all", id: "" };

    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  if (goalEl) goalEl.onchange = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "goal", id: goalEl.value || "" };
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  if (habitEl) habitEl.onchange = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "habit", id: habitEl.value || "" };
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  clearBtn.onclick = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "all", id: "" };
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // First render
  syncFocusUI();
  rerender(focusDate, view);

  window.addEventListener("hashchange", () => {
    try { syncFocusUI(); } catch {}
  });
};window.Views = window.Views || {};

window.Views.calendar = ({ db, App, setPrimary }) => {
  const year = App.getCurrentYear(db);
  if (year == null) {
    App.toast("Add your first year in Dashboard");
    return App.navTo("#/dashboard");
  }

  const yr = App.getYearModel(db);
  const today = dbTodayISO();

  setPrimary("+ Add", () => {
    const choice = prompt("Add: goal / habit / budget ?", "goal");
    if (!choice) return;
    const c = choice.toLowerCase().trim();
    if (c.startsWith("g")) return App.navTo("#/goals");
    if (c.startsWith("h")) return App.navTo("#/habits");
    if (c.startsWith("b")) return App.navTo("#/budget");
    App.navTo("#/goals");
  });

  App.setCrumb(`Calendar • ${year}`);

  // ---- Date helpers (ISO yyyy-mm-dd) ----
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (iso) => {
    const [Y, M, D] = String(iso).split("-").map(Number);
    return new Date(Y, (M || 1) - 1, D || 1);
  };
  const addDays = (iso, n) => {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const startOfWeekMonday = (iso) => {
    const d = fromISO(iso);
    const day = d.getDay(); // 0 Sun..6 Sat
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return toISO(d);
  };
  const monthKey = (iso) => String(iso).slice(0, 7);
  const startOfMonth = (iso) => `${monthKey(iso)}-01`;
  const daysInMonth = (iso) => {
    const d = fromISO(startOfMonth(iso));
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  };
  const dowLabel = (iso) => {
    const d = fromISO(iso);
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return names[d.getDay()];
  };

  // ---- Calendar prefs (per year) ----
  yr.calendar = yr.calendar || {
    defaultView: "month", // ✅ Month default
    filters: { tasks: true, habits: true, milestones: true, goals: true },
    focus: { type: "all", id: "" },
    focusDate: today,
    selectedDate: today
  };
  yr.calendar.filters = yr.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
  yr.calendar.focus = yr.calendar.focus || { type: "all", id: "" };
  yr.calendar.selectedDate = yr.calendar.selectedDate || today;

  const view = yr.calendar.defaultView || "month";
  const focusDate = yr.calendar.focusDate || today;

  function savePrefs(patch) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    Object.assign(yr2.calendar, patch);
    dbSave(db2);
  }

  // ---- Habit due logic (fallback if Habits helper missing) ----
  function habitDueOn(h, iso) {
    try {
      if (window.Habits?.habitDueOn) return !!window.Habits.habitDueOn(h, iso);
    } catch {}
    const r = h.recurrenceRule || { kind: "weekdays" };
    const day = fromISO(iso).getDay(); // 0..6
    if (r.kind === "daily") return true;
    if (r.kind === "weekdays") return day >= 1 && day <= 5;
    if (r.kind === "weeklyOn") {
      const arr = Array.isArray(r.days) ? r.days : [];
      return arr.includes(day);
    }
    return day >= 1 && day <= 5;
  }

  function toggleHabitCheck(habitId, iso) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    const h = (yr2.habits || []).find(x => x.id === habitId);
    if (!h) return;
    h.checks = (h.checks && typeof h.checks === "object") ? h.checks : {};
    if (h.checks[iso]) delete h.checks[iso];
    else h.checks[iso] = true;
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  // ---- Focus logic ----
  function getFocus(dbNow) {
    const yrNow = App.getYearModel(dbNow);
    const f = yrNow.calendar?.focus || { type: "all", id: "" };
    const type = ["all", "goal", "habit"].includes(f.type) ? f.type : "all";
    const id = String(f.id || "");
    return { type, id };
  }

  function focusLabel(dbNow) {
    const f = getFocus(dbNow);
    const yrNow = App.getYearModel(dbNow);
    if (f.type === "all") return "All";
    if (f.type === "goal") {
      const g = (yrNow.goals || []).find(x => x.id === f.id);
      return g ? `Goal: ${g.title}` : "Goal";
    }
    if (f.type === "habit") {
      const h = (yrNow.habits || []).find(x => x.id === f.id);
      return h ? `Habit: ${h.title}` : "Habit";
    }
    return "All";
  }

  function passesFocusForGoal(goalId, dbNow) {
    const f = getFocus(dbNow);
    if (f.type === "all") return true;
    if (f.type === "goal") return f.id === goalId;
    return false;
  }

  function passesFocusForHabit(habit, dbNow) {
    const f = getFocus(dbNow);
    if (f.type === "all") return true;
    if (f.type === "habit") return f.id === habit.id;

    if (f.type === "goal") {
      const linked = Array.isArray(habit.linkedGoalIds) ? habit.linkedGoalIds : [];
      return linked.includes(f.id);
    }
    return true;
  }

  // ---- Collect items for a specific day ----
  function itemsForDay(iso) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);
    const filters = yrNow.calendar?.filters || { tasks: true, habits: true, milestones: true, goals: true };

    const items = [];

    // Goals deadlines
    if (filters.goals) {
      for (const g of (yrNow.goals || [])) {
        if (!passesFocusForGoal(g.id, dbNow)) continue;

        if ((g.endDate || "").trim() && g.endDate === iso) {
          items.push({
            kind: "goal",
            title: `Goal deadline: ${g.title}`,
            overdue: false,
            nav: `#/goal/${g.id}`
          });
        }
        if (iso === today && (g.endDate || "").trim() && g.endDate < today) {
          items.push({
            kind: "goal",
            title: `Overdue goal: ${g.title}`,
            overdue: true,
            nav: `#/goal/${g.id}`
          });
        }
      }
    }

    // Milestones & tasks (inside goals)
    for (const g of (yrNow.goals || [])) {
      if (!passesFocusForGoal(g.id, dbNow)) continue;

      const ms = Array.isArray(g.milestones) ? g.milestones : [];

      if (filters.milestones) {
        for (const m of ms) {
          if ((m.dueDate || "").trim() && m.dueDate === iso) {
            items.push({
              kind: "milestone",
              title: `Milestone: ${m.title} (${g.title})`,
              overdue: false,
              nav: `#/goal/${g.id}`
            });
          }
        }
      }

      if (filters.tasks) {
        for (const m of ms) {
          const tasks = Array.isArray(m.tasks) ? m.tasks : [];
          for (const t of tasks) {
            if ((t.dueDate || "").trim() && t.dueDate === iso) {
              items.push({
                kind: "task",
                title: `${t.done ? "✅ " : ""}Task: ${t.title} (${g.title})`,
                overdue: (!t.done && t.dueDate < today),
                nav: `#/goal/${g.id}`
              });
            }
            if (iso === today && !t.done && (t.dueDate || "").trim() && t.dueDate < today) {
              items.push({
                kind: "task",
                title: `Overdue: ${t.title} (${g.title})`,
                overdue: true,
                nav: `#/goal/${g.id}`
              });
            }
          }
        }
      }
    }

    // Habits due
    if (filters.habits) {
      for (const h of (yrNow.habits || [])) {
        if (!passesFocusForHabit(h, dbNow)) continue;
        if (!habitDueOn(h, iso)) continue;
        const done = !!h.checks?.[iso];
        items.push({
          kind: "habit",
          title: h.title,
          overdue: false,
          habitId: h.id,
          done
        });
      }
    }

    const order = { task: 1, milestone: 2, goal: 3, habit: 4 };
    items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (order[a.kind] || 99) - (order[b.kind] || 99);
    });

    return items;
  }

  // ---- Render: week ----
  function renderWeek(anchorISO) {
  const start = startOfWeekMonday(anchorISO);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const selected = (yr.calendar.selectedDate || today);
  const sel = selected;

  // Week strip (iPhone-like)
  const strip = days.map(d => {
    const its = itemsForDay(d);
    const hasAny = its.length > 0;
    const isToday = d === today;
    const isSel = d === sel;
    const hasOverdue = its.some(x => x.overdue);

    // short day labels Mon..Sun (start Monday)
    const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const idx = (fromISO(d).getDay() + 6) % 7; // Mon=0 .. Sun=6

    return `
      <button class="wkDay ${isSel ? "sel" : ""} ${isToday ? "today" : ""} ${hasOverdue ? "bad" : ""}"
              data-day="${App.esc(d)}">
        <div class="wkDow">${dow[idx]}</div>
        <div class="wkNum">${App.esc(String(Number(d.slice(8,10))))}</div>
        <div class="wkDot ${hasAny ? "" : "ghost"}"></div>
      </button>
    `;
  }).join("");

  // Agenda for selected day
  const its = itemsForDay(sel);
  const list = its.length ? its.map(it => {
    if (it.kind === "habit") {
      return `
        <div class="agRow">
          <label class="agHabit">
            <input type="checkbox" ${it.done ? "checked" : ""} data-habit="${App.esc(it.habitId)}" data-date="${App.esc(sel)}" />
            <span class="agTitle">${App.esc(it.title)}</span>
          </label>
          <span class="agTag">habit</span>
        </div>
      `;
    }
    return `
      <button class="agRow agBtn ${it.overdue ? "bad" : ""}" data-nav="${App.esc(it.nav)}">
        <div class="agText">
          <div class="agTitle">${App.esc(it.title)}</div>
          <div class="agSub">${App.esc(it.kind)}</div>
        </div>
        <span class="agTag ${it.overdue ? "bad" : ""}">${App.esc(it.kind)}</span>
      </button>
    `;
  }).join("") : `<div class="muted">No items.</div>`;

  return `
    <div class="card big stack" style="gap:12px">
      <div class="wkHead">
        <div class="title2">Week</div>
        <span class="pill">${App.esc(start)} → ${App.esc(addDays(start,6))}</span>
      </div>

      <div class="wkStrip">${strip}</div>

      <div class="agWrap">
        <div class="agHead">
          <div class="title2">Agenda</div>
          <span class="pill">${App.esc(sel)}${sel === today ? " • Today" : ""}</span>
        </div>
        <div class="agList">${list}</div>
      </div>
    </div>
  `;
}

  // ---- Render: month grid (iPhone-like: circle + dots) ----
  function renderMonth(anchorISO) {
    const monthStart = startOfMonth(anchorISO);
    const gridStart = startOfWeekMonday(monthStart);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const header = `
      <div class="calMonthHead">
        <div class="calMonthTitle">${App.esc(fromISO(startOfMonth(anchorISO)).toLocaleString("ro-RO",{month:"long",year:"numeric"}))}</div>
        <div class="muted">Tap a day to open week</div>
      </div>
    `;

    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(x => `<div class="calDow">${x}</div>`).join("");

    const selected = (yr.calendar.selectedDate || today);

    const cellHtml = cells.map(d => {
      const inMonth = monthKey(d) === monthKey(anchorISO);
      const its = itemsForDay(d);

      const hasOverdue = its.some(x => x.overdue);
      const isToday = d === today;
      const isSel = d === selected;

      const hasTasks = its.some(x => x.kind === "task" || x.kind === "milestone");
      const hasHabits = its.some(x => x.kind === "habit");
      const hasGoals = its.some(x => x.kind === "goal");

      return `
        <button class="calCell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${hasOverdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="calCellTop">
            <span class="calCellNum">${App.esc(String(Number(d.slice(8, 10))))}</span>
          </div>
          <div class="calDots">
            ${hasTasks ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
            ${hasHabits ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
            ${hasGoals ? `<span class="calDot"></span>` : `<span class="calDot ghost"></span>`}
          </div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big stack">
        ${header}
        <div class="calGrid calGridHead">${dow}</div>
        <div class="calGrid">${cellHtml}</div>
      </div>
    `;
  }

  // ---- Render: year overview ----
  function renderYear(anchorISO) {
    const Y = Number(String(anchorISO).slice(0, 4));
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${pad2(i + 1)}-01`);

    const monthCards = months.map(m0 => {
      const dim = daysInMonth(m0);
      let total = 0;
      for (let d = 1; d <= dim; d++) total += itemsForDay(`${monthKey(m0)}-${pad2(d)}`).length;

      return `
        <button class="card calMonthCard" data-month="${App.esc(m0)}">
          <div class="calMonthCardTitle">${App.esc(monthKey(m0))}</div>
          <div class="muted">${total} items</div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big stack">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="title2">Year ${App.esc(String(Y))}</div>
            <div class="muted">Tap a month to open month view</div>
          </div>
        </div>
        <div class="calMonthsGrid">
          ${monthCards}
        </div>
      </div>
    `;
  }

  // ---- Navigation ----
  function navPrev(v, iso) {
    if (v === "week") return addDays(iso, -7);
    if (v === "month") {
      const d = fromISO(startOfMonth(iso));
      d.setMonth(d.getMonth() - 1);
      return toISO(d);
    }
    const d = fromISO(`${String(iso).slice(0, 4)}-01-01`);
    d.setFullYear(d.getFullYear() - 1);
    return toISO(d);
  }

  function navNext(v, iso) {
    if (v === "week") return addDays(iso, +7);
    if (v === "month") {
      const d = fromISO(startOfMonth(iso));
      d.setMonth(d.getMonth() + 1);
      return toISO(d);
    }
    const d = fromISO(`${String(iso).slice(0, 4)}-01-01`);
    d.setFullYear(d.getFullYear() + 1);
    return toISO(d);
  }

  // ---- UI ----
  const filters = yr.calendar.filters;

  const goalOptions = (yr.goals || [])
    .map(g => `<option value="${App.esc(g.id)}">${App.esc(g.title)}</option>`)
    .join("");

  const habitOptions = (yr.habits || [])
    .map(h => `<option value="${App.esc(h.id)}">${App.esc(h.title)}</option>`)
    .join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big">
        <div class="stack" style="gap:10px">
          <div>
            <div class="title2">Calendar</div>
            <div class="muted">Default monthly • Switch weekly/monthly/yearly • Filters • Focus</div>
          </div>

          <div class="row">
            <button class="btn secondary small" id="prevBtn">Prev</button>
            <button class="btn secondary small" id="todayBtn">Today</button>
            <button class="btn secondary small" id="nextBtn">Next</button>

            <span class="pill">Focus date <b id="focusLbl">${App.esc(focusDate)}</b></span>
            <span class="pill">View <b id="viewLbl">${App.esc(view)}</b></span>
          </div>

          <div class="row">
            <button class="btn secondary" id="weeklyBtn">Weekly</button>
            <button class="btn secondary" id="monthlyBtn">Monthly</button>
            <button class="btn secondary" id="yearlyBtn">Yearly</button>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Focus filter</div>
        <div class="muted">Show everything, or focus on one goal / one habit.</div>

        <div class="row" style="align-items:flex-end">
          <div style="min-width:180px">
            <div class="muted">Mode</div>
            <select id="focusMode" class="input">
              <option value="all">All</option>
              <option value="goal">One goal</option>
              <option value="habit">One habit</option>
            </select>
          </div>

          <div id="focusGoalWrap" style="min-width:220px; display:none">
            <div class="muted">Goal</div>
            <select id="focusGoalId" class="input">
              ${goalOptions || `<option value="">(no goals)</option>`}
            </select>
          </div>

          <div id="focusHabitWrap" style="min-width:220px; display:none">
            <div class="muted">Habit</div>
            <select id="focusHabitId" class="input">
              ${habitOptions || `<option value="">(no habits)</option>`}
            </select>
          </div>

          <button class="btn secondary" id="clearFocusBtn">Clear</button>

          <span class="pill" id="focusNamePill">${App.esc(focusLabel(db))}</span>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Filters</div>
        <div class="row">
          <label class="pill"><input type="checkbox" id="fTasks" ${filters.tasks ? "checked" : ""}/> tasks</label>
          <label class="pill"><input type="checkbox" id="fHabits" ${filters.habits ? "checked" : ""}/> habits</label>
          <label class="pill"><input type="checkbox" id="fMilestones" ${filters.milestones ? "checked" : ""}/> milestones</label>
          <label class="pill"><input type="checkbox" id="fGoals" ${filters.goals ? "checked" : ""}/> goals</label>
        </div>
        <div class="muted">Tip: Habits “done” can be toggled from Calendar too.</div>
      </div>

      <div id="calBody"></div>
    </div>
  `;

  function rerender(bodyISO, nextView) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);

    const v = nextView || (yrNow.calendar?.defaultView || "month");
    const iso = bodyISO || (yrNow.calendar?.focusDate || today);
    const selected = yrNow.calendar?.selectedDate || today;

    savePrefs({
      defaultView: v,
      focusDate: iso,
      selectedDate: (nextView === "week" && bodyISO ? bodyISO : selected)
    });

    const dbNow2 = dbLoad();
    const yrNow2 = App.getYearModel(dbNow2);

    document.getElementById("viewLbl").textContent = (yrNow2.calendar?.defaultView || "month");
    document.getElementById("focusLbl").textContent = (yrNow2.calendar?.focusDate || today);
    document.getElementById("focusNamePill").textContent = focusLabel(dbNow2);

    const el = document.getElementById("calBody");
    const vNow = (yrNow2.calendar?.defaultView || "month");
    const isoNow = (yrNow2.calendar?.focusDate || today);

    if (vNow === "month") el.innerHTML = renderMonth(isoNow);
    else if (vNow === "year") el.innerHTML = renderYear(isoNow);
    else el.innerHTML = renderWeek(isoNow);

    // habit toggles
    el.querySelectorAll("input[type='checkbox'][data-habit]").forEach(cb => {
      cb.onchange = () => toggleHabitCheck(cb.getAttribute("data-habit"), cb.getAttribute("data-date"));
    });

    // chips navigation
    el.querySelectorAll("button.calChip[data-nav]").forEach(btn => {
      btn.onclick = () => { location.hash = btn.getAttribute("data-nav"); };
    });

    // month/day click: select + open week
    el.querySelectorAll("[data-day]").forEach(btn => {
      btn.onclick = () => {
        const d = btn.getAttribute("data-day");
        savePrefs({ selectedDate: d });
        rerender(d, "week");
      };
    });

    // week strip day select
el.querySelectorAll(".wkDay[data-day]").forEach(btn => {
  btn.onclick = () => {
    const d = btn.getAttribute("data-day");
    savePrefs({ selectedDate: d, focusDate: d });
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
});

    // year/month click
    el.querySelectorAll("[data-month]").forEach(btn => {
      btn.onclick = () => rerender(btn.getAttribute("data-month"), "month");
    });
  }

  // Filters
  const bindFilter = (id, key) => {
    const el = document.getElementById(id);
    el.onchange = () => {
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.filters = yr2.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
      yr2.calendar.filters[key] = !!el.checked;
      dbSave(db2);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  };
  bindFilter("fTasks", "tasks");
  bindFilter("fHabits", "habits");
  bindFilter("fMilestones", "milestones");
  bindFilter("fGoals", "goals");

  // View buttons
  document.getElementById("weeklyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "week");
  document.getElementById("monthlyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "month");
  document.getElementById("yearlyBtn").onclick = () => rerender(yr.calendar.focusDate || today, "year");

  // Nav buttons
  document.getElementById("todayBtn").onclick = () => rerender(today, (yr.calendar.defaultView || "month"));
  document.getElementById("prevBtn").onclick = () => rerender(navPrev(yr.calendar.defaultView || "month", yr.calendar.focusDate || today));
  document.getElementById("nextBtn").onclick = () => rerender(navNext(yr.calendar.defaultView || "month", yr.calendar.focusDate || today));

  // Focus UI wiring
  const modeEl = document.getElementById("focusMode");
  const goalWrap = document.getElementById("focusGoalWrap");
  const habitWrap = document.getElementById("focusHabitWrap");
  const goalEl = document.getElementById("focusGoalId");
  const habitEl = document.getElementById("focusHabitId");
  const clearBtn = document.getElementById("clearFocusBtn");

  function syncFocusUI() {
    const dbNow = dbLoad();
    const f = getFocus(dbNow);

    modeEl.value = f.type;
    goalWrap.style.display = (f.type === "goal") ? "block" : "none";
    habitWrap.style.display = (f.type === "habit") ? "block" : "none";

    if (f.type === "goal" && goalEl) goalEl.value = f.id || (goalEl.options[0]?.value || "");
    if (f.type === "habit" && habitEl) habitEl.value = f.id || (habitEl.options[0]?.value || "");

    document.getElementById("focusNamePill").textContent = focusLabel(dbNow);
  }

  modeEl.onchange = () => {
    const mode = modeEl.value;
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = yr2.calendar.focus || { type: "all", id: "" };

    if (mode === "goal") {
      const id = goalEl?.value || "";
      yr2.calendar.focus = { type: "goal", id };
    } else if (mode === "habit") {
      const id = habitEl?.value || "";
      yr2.calendar.focus = { type: "habit", id };
    } else {
      yr2.calendar.focus = { type: "all", id: "" };
    }

    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  if (goalEl) {
    goalEl.onchange = () => {
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.focus = { type: "goal", id: goalEl.value || "" };
      dbSave(db2);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  }

  if (habitEl) {
    habitEl.onchange = () => {
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.focus = { type: "habit", id: habitEl.value || "" };
      dbSave(db2);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  }

  clearBtn.onclick = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "all", id: "" };
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // First render
  syncFocusUI();
  rerender(focusDate, view);

  window.addEventListener("hashchange", () => {
    try { syncFocusUI(); } catch {}
  });
};
