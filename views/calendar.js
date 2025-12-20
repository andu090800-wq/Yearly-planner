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

  // ---------- Date helpers (ISO yyyy-mm-dd) ----------
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
  const monthKey = (iso) => String(iso).slice(0, 7); // YYYY-MM
  const startOfMonth = (iso) => `${monthKey(iso)}-01`;
  const sameMonth = (a, b) => monthKey(a) === monthKey(b);
  const dayNum = (iso) => Number(String(iso).slice(8, 10));
  const dowShort = (iso) => {
    const d = fromISO(iso);
    return ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"][d.getDay()];
  };

  // Monday as first day of week
  const startOfWeekMon = (iso) => {
    const d = fromISO(iso);
    const day = d.getDay(); // 0 Sun..6 Sat
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return toISO(d);
  };

  // Localized month title: "decembrie 2026"
  function monthTitleRO(anchorISO) {
    const d = fromISO(startOfMonth(anchorISO));
    const m = d.toLocaleString("ro-RO", { month: "long" });
    return `${m} ${d.getFullYear()}`;
  }

  // Week title: "Săptămâna 2025-12-15 → 2025-12-21"
  function weekTitleRO(anchorISO) {
    const start = startOfWeekMon(anchorISO);
    const end = addDays(start, 6);
    return `Săptămâna ${start} → ${end}`;
  }

  // ---------- Calendar prefs ----------
  yr.calendar = yr.calendar || {
    defaultView: "month",
    filters: { tasks: true, habits: true, milestones: true, goals: true },
    focusDate: today,
    selectedDate: today
  };
  yr.calendar.filters = yr.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
  const view = yr.calendar.defaultView || "month";
  const focusDate = yr.calendar.focusDate || today;
  const selectedDate = yr.calendar.selectedDate || today;

  function savePrefs(patch) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    Object.assign(yr2.calendar, patch);
    dbSave(db2);
  }

  // ---------- Habit due logic (fallback) ----------
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

  // ---------- Collect items for a day (agenda + dots) ----------
  function itemsForDay(iso) {
    const filters = yr.calendar.filters;
    const items = [];

    // Goals deadlines
    if (filters.goals) {
      for (const g of (yr.goals || [])) {
        if ((g.endDate || "").trim() && g.endDate === iso) {
          items.push({ kind: "goal", title: `Deadline goal: ${g.title}`, overdue: false, nav: `#/goal/${g.id}` });
        }
        if ((g.endDate || "").trim() && g.endDate < today && iso === today) {
          items.push({ kind: "goal", title: `Goal întârziat: ${g.title}`, overdue: true, nav: `#/goal/${g.id}` });
        }
      }
    }

    // Milestones & tasks
    for (const g of (yr.goals || [])) {
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
                title: `${t.done ? "✅ " : ""}${t.title} (${g.title})`,
                overdue: (!t.done && t.dueDate < today),
                nav: `#/goal/${g.id}`
              });
            }
            if (iso === today && !t.done && (t.dueDate || "").trim() && t.dueDate < today) {
              items.push({ kind: "task", title: `Întârziat: ${t.title} (${g.title})`, overdue: true, nav: `#/goal/${g.id}` });
            }
          }
        }
      }
    }

    // Habits due
    if (filters.habits) {
      for (const h of (yr.habits || [])) {
        if (!habitDueOn(h, iso)) continue;
        const done = !!h.checks?.[iso];
        items.push({ kind: "habit", title: h.title, overdue: false, habitId: h.id, done });
      }
    }

    const order = { task: 1, milestone: 2, goal: 3, habit: 4 };
    items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (order[a.kind] || 99) - (order[b.kind] || 99);
    });

    return items;
  }

  function dayDotInfo(iso) {
    const its = itemsForDay(iso);
    const count = its.length;
    const overdue = its.some(x => x.overdue);
    const hasHabits = its.some(x => x.kind === "habit");
    const hasTasks = its.some(x => x.kind === "task" || x.kind === "milestone");
    const hasGoals = its.some(x => x.kind === "goal");
    return { count, overdue, hasHabits, hasTasks, hasGoals };
  }

  // ---------- Month view (grid) ----------
  function renderMonth(anchorISO, selectedISO) {
    const mStart = startOfMonth(anchorISO);
    const gridStart = startOfWeekMon(mStart);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const dowHead = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"]
      .map(d => `<div class="calDow2">${d}</div>`).join("");

    const cellHtml = cells.map(d => {
      const inMonth = sameMonth(d, anchorISO);
      const isToday = d === today;
      const isSel = d === selectedISO;
      const info = dayDotInfo(d);

      const dots = [
        info.hasTasks ? `<span class="calDot"></span>` : ``,
        info.hasHabits ? `<span class="calDot"></span>` : ``,
        info.hasGoals ? `<span class="calDot"></span>` : ``
      ].join("");

      return `
        <button class="calCell2 ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${info.overdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="calNum">${App.esc(String(dayNum(d)))}</div>
          <div class="calDots">${dots}</div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big calPhoneCard calSwipeArea" id="swipeArea">
        <div class="calPhoneHeader">
          <div class="calPhoneTitle">${App.esc(monthTitleRO(anchorISO))}</div>
        </div>

        <div class="calGrid2Head">${dowHead}</div>
        <div class="calGrid2">${cellHtml}</div>
      </div>
    `;
  }

  // ---------- Week view (strip) ----------
  function renderWeekStrip(anchorISO, selectedISO) {
    const start = startOfWeekMon(anchorISO);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    const chips = days.map(d => {
      const isToday = d === today;
      const isSel = d === selectedISO;
      const info = dayDotInfo(d);

      return `
        <button class="weekDay ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${info.overdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="weekDow">${App.esc(dowShort(d))}</div>
          <div class="weekNum">${App.esc(String(dayNum(d)))}</div>
          <div class="weekMiniDots">
            ${info.count ? `<span class="weekDot"></span>` : ``}
          </div>
        </button>
      `;
    }).join("");

    return `
      <div class="card big calPhoneCard calSwipeArea" id="swipeArea">
        <div class="calPhoneHeader">
          <div class="calPhoneTitle">${App.esc(weekTitleRO(anchorISO))}</div>
        </div>
        <div class="weekStrip">${chips}</div>
      </div>
    `;
  }

  // ---------- Year view ----------
  function renderYear(anchorISO) {
    const Y = Number(String(anchorISO).slice(0, 4));
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${pad2(i + 1)}-01`);

    const cards = months.map(m0 => `
      <button class="card miniMonth" data-month="${App.esc(m0)}">
        <div class="miniMonthTitle">${App.esc(monthTitleRO(m0))}</div>
        <div class="muted">Tap</div>
      </button>
    `).join("");

    return `
      <div class="card big calPhoneCard calSwipeArea" id="swipeArea">
        <div class="calPhoneHeader">
          <div class="calPhoneTitle">Anul ${App.esc(String(Y))}</div>
        </div>
        <div class="miniMonthsGrid">${cards}</div>
      </div>
    `;
  }

  // ---------- Agenda ----------
  function renderAgenda(iso) {
    const its = itemsForDay(iso);

    const list = its.length ? its.map(it => {
      if (it.kind === "habit") {
        return `
          <div class="agendaRow">
            <label class="agendaHabit">
              <input type="checkbox" ${it.done ? "checked" : ""} data-habit="${App.esc(it.habitId)}" data-date="${App.esc(iso)}" />
              <span class="agendaChip habit">${App.esc(it.title)}</span>
            </label>
          </div>
        `;
      }
      return `
        <button class="agendaRow agendaChip ${it.kind} ${it.overdue ? "overdue" : ""}" data-nav="${App.esc(it.nav)}">
          ${App.esc(it.title)}
        </button>
      `;
    }).join("") : `<div class="muted">No items.</div>`;

    return `
      <div class="card big calPhoneCard">
        <div class="calPhoneHeader">
          <div class="calPhoneTitle">Agenda • ${App.esc(iso)}${iso === today ? " (Azi)" : ""}</div>
        </div>
        <div class="agendaList">${list}</div>
      </div>
    `;
  }

  // ---------- Prev/Next logic ----------
  function prevAnchor(v, iso) {
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

  function nextAnchor(v, iso) {
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

  // ---------- Main UI ----------
  const filters = yr.calendar.filters;

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big">
        <div class="stack" style="gap:10px">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="title2">Calendar</div>
              <div class="muted">iPhone-like • Swipe left/right • Month / Week / Year</div>
            </div>
            <span class="pill">Selected <b id="selLbl">${App.esc(selectedDate)}</b></span>
          </div>

          <div class="row">
            <button class="btn secondary small" id="prevBtn">Prev</button>
            <button class="btn secondary small" id="todayBtn">Today</button>
            <button class="btn secondary small" id="nextBtn">Next</button>

            <span class="pill">View <b id="viewLbl">${App.esc(view)}</b></span>
          </div>

          <div class="row">
            <button class="btn secondary" id="weekBtn">Week</button>
            <button class="btn secondary" id="monthBtn">Month</button>
            <button class="btn secondary" id="yearBtn">Year</button>
          </div>
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

      <div id="calMain"></div>
      <div id="calAgenda"></div>
    </div>
  `;

  function rerender(next) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);

    const v = next?.view ?? (yrNow.calendar?.defaultView || "month");
    const anchor = next?.focusDate ?? (yrNow.calendar?.focusDate || today);
    const sel = next?.selectedDate ?? (yrNow.calendar?.selectedDate || today);

    savePrefs({ defaultView: v, focusDate: anchor, selectedDate: sel });

    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    const v2 = yr2.calendar?.defaultView || "month";
    const a2 = yr2.calendar?.focusDate || today;
    const s2 = yr2.calendar?.selectedDate || today;

    document.getElementById("viewLbl").textContent = v2;
    document.getElementById("selLbl").textContent = s2;

    const main = document.getElementById("calMain");
    const agenda = document.getElementById("calAgenda");

    if (v2 === "year") main.innerHTML = renderYear(a2);
    else if (v2 === "week") main.innerHTML = renderWeekStrip(a2, s2);
    else main.innerHTML = renderMonth(a2, s2);

    agenda.innerHTML = renderAgenda(s2);

    // Select day (month cells / week strip)
    main.querySelectorAll("[data-day]").forEach(btn => {
      btn.onclick = () => {
        const d = btn.getAttribute("data-day");
        rerender({ selectedDate: d, focusDate: (v2 === "week" ? d : a2), view: v2 });
      };
    });

    // Year -> month
    main.querySelectorAll("[data-month]").forEach(btn => {
      btn.onclick = () => {
        const m = btn.getAttribute("data-month");
        rerender({ view: "month", focusDate: m, selectedDate: m });
      };
    });

    // Agenda: habit toggle
    agenda.querySelectorAll("input[type='checkbox'][data-habit]").forEach(cb => {
      cb.onchange = () => toggleHabitCheck(cb.getAttribute("data-habit"), cb.getAttribute("data-date"));
    });

    // Agenda: nav
    agenda.querySelectorAll("[data-nav]").forEach(el => {
      el.onclick = () => { location.hash = el.getAttribute("data-nav"); };
    });

    // Swipe wiring (left/right)
    wireSwipe(v2, a2, s2);
  }

  function wireSwipe(v, anchor, sel) {
    const swipeArea = document.getElementById("swipeArea");
    if (!swipeArea) return;

    let sx = 0, sy = 0, active = false;
    const THRESH = 45; // px

    swipeArea.ontouchstart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      active = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };

    swipeArea.ontouchmove = (e) => {
      // keep default vertical scroll; we only decide on end
      if (!active) return;
    };

    swipeArea.ontouchend = (e) => {
      if (!active) return;
      active = false;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      // only horizontal swipe
      if (Math.abs(dx) < THRESH) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.8) return; // mostly vertical => ignore

      // swipe left => next, swipe right => prev
      if (dx < 0) {
        rerender({ focusDate: nextAnchor(v, anchor), view: v });
      } else {
        rerender({ focusDate: prevAnchor(v, anchor), view: v });
      }
    };
  }

  // Filters wiring
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
  document.getElementById("weekBtn").onclick = () => rerender({ view: "week", focusDate: yr.calendar.selectedDate || today });
  document.getElementById("monthBtn").onclick = () => rerender({ view: "month", focusDate: yr.calendar.focusDate || today });
  document.getElementById("yearBtn").onclick = () => rerender({ view: "year", focusDate: yr.calendar.focusDate || today });

  // Nav buttons
  document.getElementById("todayBtn").onclick = () => rerender({ focusDate: today, selectedDate: today, view: yr.calendar.defaultView || "month" });
  document.getElementById("prevBtn").onclick = () => rerender({ focusDate: prevAnchor(yr.calendar.defaultView || "month", yr.calendar.focusDate || today), view: yr.calendar.defaultView || "month" });
  document.getElementById("nextBtn").onclick = () => rerender({ focusDate: nextAnchor(yr.calendar.defaultView || "month", yr.calendar.focusDate || today), view: yr.calendar.defaultView || "month" });

  // First render
  rerender({ view, focusDate, selectedDate });
};
