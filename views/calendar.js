// views/calendar.js
window.Views = window.Views || {};

window.Views.calendar = ({ db, App, setPrimary }) => {
  const year = App.getCurrentYear(db);
  if (year == null) {
    App.toast("Add your first year in Dashboard");
    return App.navTo("#/dashboard");
  }

  const yr = App.getYearModel(db);
  const today = dbTodayISO();

  // ---------- Hide global top bar on Calendar (optional, păstrez ce aveai) ----------
  function setTopBarHidden(hidden) {
    const top = document.querySelector(".top");
    if (top) top.style.display = hidden ? "none" : "";
  }
  setTopBarHidden(true);

  const restoreOnLeave = () => {
    const h = String(location.hash || "");
    if (!h.startsWith("#/calendar")) {
      setTopBarHidden(false);
      window.removeEventListener("hashchange", restoreOnLeave);
    }
  };
  window.addEventListener("hashchange", restoreOnLeave);

  // remove primary button on calendar
  try { setPrimary("", () => {}); } catch {}

  // ---------- Date helpers ----------
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
  const monthKey = (iso) => String(iso).slice(0, 7);
  const startOfMonth = (iso) => `${monthKey(iso)}-01`;
  const daysInMonth = (iso) => {
    const d = fromISO(startOfMonth(iso));
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  };
  const startOfWeekMonday = (iso) => {
    const d = fromISO(iso);
    const day = d.getDay(); // 0 Sun..6 Sat
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return toISO(d);
  };

  const fmtMonthRO = (iso) =>
    fromISO(startOfMonth(iso)).toLocaleString("ro-RO", { month: "long", year: "numeric" });

  const fmtPrettyRO = (iso) =>
    fromISO(iso).toLocaleDateString("ro-RO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

  // ---------- Calendar prefs ----------
  yr.calendar = yr.calendar || {
    defaultView: "month",
    filters: { tasks: true, habits: true, milestones: true, goals: true },
    focus: { type: "all", id: "" },
    focusDate: today,
    selectedDate: today,
    panelsOpen: false
  };
  yr.calendar.filters = yr.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
  yr.calendar.focus = yr.calendar.focus || { type: "all", id: "" };
  yr.calendar.focusDate = yr.calendar.focusDate || today;
  yr.calendar.selectedDate = yr.calendar.selectedDate || today;
  yr.calendar.panelsOpen = !!yr.calendar.panelsOpen;

  if (!["day", "week", "month", "year"].includes(yr.calendar.defaultView)) {
    yr.calendar.defaultView = "month";
  }

  const view = yr.calendar.defaultView;
  const focusDate = yr.calendar.focusDate;

  function savePrefs(patch) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    Object.assign(yr2.calendar, patch);
    dbSave(db2);
  }

  // ---------- Habit due + toggle ----------
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
    const h = (yr2.habits || []).find((x) => x.id === habitId);
    if (!h) return;
    h.checks = (h.checks && typeof h.checks === "object") ? h.checks : {};
    if (h.checks[iso]) delete h.checks[iso];
    else h.checks[iso] = true;
    dbSave(db2);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  // ---------- Focus ----------
  function getFocus(dbNow) {
    const yrNow = App.getYearModel(dbNow);
    const f = yrNow.calendar?.focus || { type: "all", id: "" };
    const type = ["all", "goal", "habit"].includes(f.type) ? f.type : "all";
    return { type, id: String(f.id || "") };
  }

  function focusLabel(dbNow) {
    const f = getFocus(dbNow);
    const yrNow = App.getYearModel(dbNow);
    if (f.type === "all") return "All";
    if (f.type === "goal") {
      const g = (yrNow.goals || []).find((x) => x.id === f.id);
      return g ? `Goal: ${g.title}` : "Goal";
    }
    if (f.type === "habit") {
      const h = (yrNow.habits || []).find((x) => x.id === f.id);
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

  // ---------- Items ----------
  function itemsForDay(iso) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);
    const filters = yrNow.calendar?.filters || { tasks: true, habits: true, milestones: true, goals: true };

    const items = [];

    // goals deadlines
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

    // milestones & tasks
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

    // habits due
    if (filters.habits) {
      for (const h of (yrNow.habits || [])) {
        if (!passesFocusForHabit(h, dbNow)) continue;
        if (!habitDueOn(h, iso)) continue;
        items.push({ kind: "habit", title: h.title, overdue: false, habitId: h.id, done: !!h.checks?.[iso] });
      }
    }

    const order = { task: 1, milestone: 2, goal: 3, habit: 4 };
    items.sort((a, b) => {
      if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
      return (order[a.kind] || 99) - (order[b.kind] || 99);
    });

    return items;
  }

  // ---------- Swipe ----------
  function attachSwipe(el, getView, getISO, onMove) {
    if (!el) return;
    let sx = 0, sy = 0, tracking = false;

    el.addEventListener("touchstart", (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      sx = t.clientX; sy = t.clientY;
      tracking = true;
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dy) > Math.abs(dx)) return;
      e.preventDefault();
    }, { passive: false });

    el.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;

      const t = e.changedTouches?.[0];
      if (!t) return;

      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > 70) return;

      const dir = dx < 0 ? "next" : "prev";
      onMove(dir, getView(), getISO());
    }, { passive: true });
  }

  // ---------- Nav ----------
  function navPrev(v, iso) {
    if (v === "day") return addDays(iso, -1);
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
    if (v === "day") return addDays(iso, +1);
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

  // ---------- Render: DAY ----------
  function renderDay(iso) {
    const its = itemsForDay(iso);

    const list = its.length ? its.map((it) => {
      if (it.kind === "habit") {
        return `
          <div class="agRow">
            <label class="agHabit">
              <input type="checkbox" ${it.done ? "checked" : ""} data-habit="${App.esc(it.habitId)}" data-date="${App.esc(iso)}" />
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
      <div class="calCard stack" style="gap:12px">
        <div class="agWrap">
          <div class="agHead">
            <div class="title2">Daily</div>
            <span class="pill">${App.esc(fmtPrettyRO(iso))}${iso === today ? " • Today" : ""}</span>
          </div>
          <div class="agList">${list}</div>
        </div>
      </div>
    `;
  }

  // ---------- Render: WEEK ----------
  function renderWeek(anchorISO) {
    const start = startOfWeekMonday(anchorISO);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const sel = (yr.calendar.selectedDate || today);
    const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

    const strip = days.map(d => {
      const its = itemsForDay(d);
      const hasAny = its.length > 0;
      const isToday = d === today;
      const isSel = d === sel;
      const hasOverdue = its.some(x => x.overdue);
      const idx = (fromISO(d).getDay() + 6) % 7;

      return `
        <button class="wkDay ${isSel ? "sel" : ""} ${isToday ? "today" : ""} ${hasOverdue ? "bad" : ""}" data-wday="${App.esc(d)}">
          <div class="wkDow">${dow[idx]}</div>
          <div class="wkNum">${App.esc(String(Number(d.slice(8,10))))}</div>
          <div class="wkDot ${hasAny ? "" : "ghost"}"></div>
        </button>
      `;
    }).join("");

    return `
      <div class="calCard stack" style="gap:12px">
        <div class="wkStrip">${strip}</div>
        <div class="muted">Tap any day → Daily</div>
      </div>
    `;
  }

  // ---------- Render: MONTH ----------
  function renderMonth(anchorISO) {
    const monthStart = startOfMonth(anchorISO);
    const gridStart = startOfWeekMonday(monthStart);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const header = `
      <div class="calMonthHead">
        <div class="calMonthTitle">${App.esc(fmtMonthRO(anchorISO))}</div>
        <div class="muted">Swipe left/right • Tap a day → Daily</div>
      </div>
    `;

    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      .map((x) => `<div class="calDow">${x}</div>`)
      .join("");

    const selected = (yr.calendar.selectedDate || today);

    const cellHtml = cells.map((d) => {
      const inMonth = monthKey(d) === monthKey(anchorISO);
      const its = itemsForDay(d);

      const hasOverdue = its.some((x) => x.overdue);
      const isToday = d === today;
      const isSel = d === selected;

      const hasTasks = its.some((x) => x.kind === "task" || x.kind === "milestone");
      const hasHabits = its.some((x) => x.kind === "habit");
      const hasGoals = its.some((x) => x.kind === "goal");

      return `
        <button class="calCell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${hasOverdue ? "bad" : ""}" data-mday="${App.esc(d)}">
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
      <div class="calCard stack">
        ${header}
        <div class="calGrid calGridHead">${dow}</div>
        <div class="calGrid">${cellHtml}</div>
      </div>
    `;
  }

  // ---------- Render: YEAR ----------
  function renderYear(anchorISO) {
    const Y = Number(String(anchorISO).slice(0, 4));
    const selected = (yr.calendar.selectedDate || today);
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${pad2(i + 1)}-01`);

    const monthCards = months.map((m0) => {
      const monthStart = startOfMonth(m0);
      const gridStart = startOfWeekMonday(monthStart);
      const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

      const monthName = fromISO(monthStart).toLocaleString("ro-RO", { month: "long" });
      const monthLabel = `${monthName} ${Y}`;

      const miniCells = cells.map((d) => {
        const inMonth = monthKey(d) === monthKey(m0);
        const its = itemsForDay(d);
        const hasAny = its.length > 0;
        const hasOverdue = its.some((x) => x.overdue);
        const isToday = d === today;
        const isSel = d === selected;

        return `
          <button class="yMiniCell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${hasOverdue ? "bad" : ""}"
                  data-yday="${App.esc(d)}" data-month="${App.esc(m0)}">
            <span class="yMiniNum">${App.esc(String(Number(d.slice(8, 10))))}</span>
            ${hasAny ? `<span class="yMiniDot"></span>` : ``}
          </button>
        `;
      }).join("");

      return `
        <div class="yMiniCard">
          <button class="yMiniTitle" data-monthtitle="${App.esc(m0)}">${App.esc(monthLabel)}</button>
          <div class="yMiniDow">
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
          <div class="yMiniGrid">
            ${miniCells}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="calCard stack" style="gap:12px">
        <div class="muted">Swipe left/right • Tap month title → Month • Tap day → Daily</div>
        <div class="yMiniWrap">
          ${monthCards}
        </div>
      </div>
    `;
  }

  // ---------- UI ----------
  const filters = yr.calendar.filters;

  const goalOptions = (yr.goals || []).map((g) => `<option value="${App.esc(g.id)}">${App.esc(g.title)}</option>`).join("");
  const habitOptions = (yr.habits || []).map((h) => `<option value="${App.esc(h.id)}">${App.esc(h.title)}</option>`).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="calPageHead">
        <div>
          <div class="calPageTitle">Calendar</div>
          <div class="calPageSub">${App.esc(String(year))}</div>
        </div>
        <button class="btn small" id="calAddBtn">+ Add</button>
      </div>

      <details class="calDetails" id="calDetails">
        <summary class="calSummary">
          <span>Focus & Filters</span>
          <span class="calSummaryHint">tap to expand</span>
        </summary>

        <div class="card big stack" style="margin-top:10px">
          <div class="title2">Focus</div>
          <div class="muted">Show everything, or focus on one goal / one habit.</div>

          <div class="row" style="align-items:flex-end">
            <div style="min-width:160px">
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
        </div>
      </details>

      <div class="calToolbar">
        <div class="calSeg" id="calSeg">
          <button class="calSegBtn" data-view="day">Day</button>
          <button class="calSegBtn" data-view="week">Week</button>
          <button class="calSegBtn" data-view="month">Month</button>
          <button class="calSegBtn" data-view="year">Year</button>
        </div>

        <div class="calNav">
          <button class="btn secondary small" id="prevBtn">Prev</button>
          <button class="btn secondary small" id="todayBtn">Today</button>
          <button class="btn secondary small" id="nextBtn">Next</button>
        </div>
      </div>

      <div class="calMeta">
        <span class="pill">Focus date <b id="focusLbl">${App.esc(focusDate)}</b></span>
        <span class="pill">View <b id="viewLbl">${App.esc(view)}</b></span>
      </div>

      <div id="calBody"></div>
    </div>
  `;

  // details open/close persistence
  const det = document.getElementById("calDetails");
  det.open = !!yr.calendar.panelsOpen;
  det.addEventListener("toggle", () => savePrefs({ panelsOpen: !!det.open }));

  // Add button
  document.getElementById("calAddBtn").onclick = () => {
    const choice = prompt("Add: goal / habit / budget ?", "goal");
    if (!choice) return;
    const c = choice.toLowerCase().trim();
    if (c.startsWith("g")) return App.navTo("#/goals");
    if (c.startsWith("h")) return App.navTo("#/habits");
    if (c.startsWith("b")) return App.navTo("#/budget");
    App.navTo("#/goals");
  };

  function setSegActive(v) {
    document.querySelectorAll(".calSegBtn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-view") === v);
    });
  }

  function openDaily(iso) {
    const d = iso || today;
    // IMPORTANT: nu mai folosim hashchange aici — randăm imediat.
    savePrefs({ defaultView: "day", focusDate: d, selectedDate: d });
    rerender(d, "day");
  }

  function rerender(bodyISO, nextView) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);

    const v = nextView || (yrNow.calendar?.defaultView || "month");
    const iso = bodyISO || (yrNow.calendar?.focusDate || today);
    const selected = yrNow.calendar?.selectedDate || today;

    savePrefs({
      defaultView: v,
      focusDate: iso,
      selectedDate: (v === "day" ? iso : selected)
    });

    const dbNow2 = dbLoad();
    const yrNow2 = App.getYearModel(dbNow2);

    const vNow = (yrNow2.calendar?.defaultView || "month");
    const isoNow = (yrNow2.calendar?.focusDate || today);

    document.getElementById("viewLbl").textContent = vNow;
    document.getElementById("focusLbl").textContent = isoNow;
    document.getElementById("focusNamePill").textContent = focusLabel(dbNow2);

    setSegActive(vNow);

    const el = document.getElementById("calBody");
    if (vNow === "year") el.innerHTML = renderYear(isoNow);
    else if (vNow === "month") el.innerHTML = renderMonth(isoNow);
    else if (vNow === "week") el.innerHTML = renderWeek(isoNow);
    else el.innerHTML = renderDay(isoNow);

    // Swipe
    attachSwipe(
      el,
      () => (App.getYearModel(dbLoad()).calendar?.defaultView || "month"),
      () => (App.getYearModel(dbLoad()).calendar?.focusDate || today),
      (dir, vX, isoX) => {
        const newISO = dir === "next" ? navNext(vX, isoX) : navPrev(vX, isoX);

        const dbX = dbLoad();
        const yrX = App.getYearModel(dbX);
        const sel = yrX.calendar?.selectedDate || today;

        let newSel = sel;

        if (vX === "day") newSel = newISO;
        else if (vX === "week") newSel = dir === "next" ? addDays(sel, +7) : addDays(sel, -7);
        else if (vX === "month") {
          const dayNum = Number(sel.slice(8, 10)) || 1;
          const dim = daysInMonth(newISO);
          const d = Math.min(dayNum, dim);
          newSel = `${monthKey(newISO)}-${pad2(d)}`;
        } else {
          const y = String(newISO).slice(0, 4);
          newSel = `${y}-01-01`;
        }

        savePrefs({ focusDate: newISO, selectedDate: newSel });
        // re-render imediat, nu prin hashchange
        rerender(newISO, vX);
      }
    );

    // Agenda nav
    el.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.onclick = () => { location.hash = btn.getAttribute("data-nav"); };
    });

    // Habit toggles
    el.querySelectorAll("input[type='checkbox'][data-habit]").forEach((cb) => {
      cb.onchange = () => toggleHabitCheck(cb.getAttribute("data-habit"), cb.getAttribute("data-date"));
    });

    // WEEK tap day => DAILY
    el.querySelectorAll("[data-wday]").forEach((btn) => {
      btn.onclick = () => openDaily(btn.getAttribute("data-wday"));
    });

    // MONTH tap day => DAILY
    el.querySelectorAll("[data-mday]").forEach((btn) => {
      btn.onclick = () => openDaily(btn.getAttribute("data-mday"));
    });

    // YEAR month title => MONTH
    el.querySelectorAll("[data-monthtitle]").forEach((btn) => {
      btn.onclick = () => {
        const m = btn.getAttribute("data-monthtitle");
        savePrefs({ focusDate: m });
        rerender(m, "month");
      };
    });

    // YEAR day => DAILY
    el.querySelectorAll("[data-yday]").forEach((btn) => {
      btn.onclick = () => openDaily(btn.getAttribute("data-yday"));
    });
  }

  // ---------- Filters binding ----------
  const bindFilter = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = () => {
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.filters = yr2.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
      yr2.calendar.filters[key] = !!el.checked;
      dbSave(db2);
      rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today);
    };
  };
  bindFilter("fTasks", "tasks");
  bindFilter("fHabits", "habits");
  bindFilter("fMilestones", "milestones");
  bindFilter("fGoals", "goals");

  // ---------- Focus UI wiring ----------
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
    rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today);
  };

  if (goalEl) goalEl.onchange = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "goal", id: goalEl.value || "" };
    dbSave(db2);
    rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today);
  };

  if (habitEl) habitEl.onchange = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "habit", id: habitEl.value || "" };
    dbSave(db2);
    rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today);
  };

  clearBtn.onclick = () => {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    yr2.calendar.focus = { type: "all", id: "" };
    dbSave(db2);
    rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today);
  };

  // Segmented control
  document.querySelectorAll(".calSegBtn").forEach((btn) => {
    btn.onclick = () => rerender(App.getYearModel(dbLoad()).calendar?.focusDate || today, btn.getAttribute("data-view"));
  });

  // Nav buttons
  document.getElementById("todayBtn").onclick = () => rerender(today, (App.getYearModel(dbLoad()).calendar?.defaultView || "month"));
  document.getElementById("prevBtn").onclick = () => {
    const yNow = App.getYearModel(dbLoad());
    rerender(navPrev(yNow.calendar?.defaultView || "month", yNow.calendar?.focusDate || today), yNow.calendar?.defaultView || "month");
  };
  document.getElementById("nextBtn").onclick = () => {
    const yNow = App.getYearModel(dbLoad());
    rerender(navNext(yNow.calendar?.defaultView || "month", yNow.calendar?.focusDate || today), yNow.calendar?.defaultView || "month");
  };

  // First render
  syncFocusUI();
  rerender(focusDate, view);

  window.addEventListener("hashchange", () => {
    try { syncFocusUI(); } catch {}
  });
};
