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
  const monthKey = (iso) => String(iso).slice(0, 7);
  const startOfMonth = (iso) => `${monthKey(iso)}-01`;
  const sameMonth = (a, b) => monthKey(a) === monthKey(b);
  const dayNum = (iso) => Number(String(iso).slice(8, 10));

  // Monday start
  const startOfWeekMon = (iso) => {
    const d = fromISO(iso);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return toISO(d);
  };

  const dowRO = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
  const dowShortRO = (iso) => {
    const d = fromISO(iso).getDay();
    const idx = (d === 0 ? 6 : d - 1);
    return dowRO[idx];
  };

  function monthTitleRO(anchorISO) {
    const d = fromISO(startOfMonth(anchorISO));
    const m = d.toLocaleString("ro-RO", { month: "long" });
    return `${m} ${d.getFullYear()}`;
  }

  function weekTitleRO(anchorISO) {
    const start = startOfWeekMon(anchorISO);
    const end = addDays(start, 6);
    return `Săptămâna ${start} → ${end}`;
  }

  // ---- State (Month default) ----
  yr.calendar = yr.calendar || {};
  yr.calendar.defaultView = ["month", "week", "year"].includes(yr.calendar.defaultView) ? yr.calendar.defaultView : "month";
  yr.calendar.focusDate = yr.calendar.focusDate || today;
  yr.calendar.selectedDate = yr.calendar.selectedDate || today;
  yr.calendar.filters = yr.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };

  function savePrefs(patch) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.calendar = yr2.calendar || {};
    Object.assign(yr2.calendar, patch);
    dbSave(db2);
  }

  // ---- Habits ----
  function habitDueOn(h, iso) {
    try {
      if (window.Habits?.habitDueOn) return !!window.Habits.habitDueOn(h, iso);
    } catch {}
    const r = h.recurrenceRule || { kind: "weekdays" };
    const day = fromISO(iso).getDay();
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

  // ---- Items ----
  function itemsForDay(iso) {
    const filters = yr.calendar.filters;
    const items = [];

    if (filters.goals) {
      for (const g of (yr.goals || [])) {
        if ((g.endDate || "").trim() && g.endDate === iso) {
          items.push({ kind: "goal", title: g.title, label: "Deadline goal", nav: `#/goal/${g.id}`, overdue: false });
        }
        if (iso === today && (g.endDate || "").trim() && g.endDate < today) {
          items.push({ kind: "goal", title: g.title, label: "Goal întârziat", nav: `#/goal/${g.id}`, overdue: true });
        }
      }
    }

    for (const g of (yr.goals || [])) {
      const ms = Array.isArray(g.milestones) ? g.milestones : [];

      if (filters.milestones) {
        for (const m of ms) {
          if ((m.dueDate || "").trim() && m.dueDate === iso) {
            items.push({ kind: "milestone", title: m.title, label: g.title, nav: `#/goal/${g.id}`, overdue: false });
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
                title: t.title,
                label: g.title,
                nav: `#/goal/${g.id}`,
                overdue: (!t.done && t.dueDate < today),
                done: !!t.done
              });
            }
            if (iso === today && !t.done && (t.dueDate || "").trim() && t.dueDate < today) {
              items.push({ kind: "task", title: t.title, label: `Întârziat • ${g.title}`, nav: `#/goal/${g.id}`, overdue: true });
            }
          }
        }
      }
    }

    if (filters.habits) {
      for (const h of (yr.habits || [])) {
        if (!habitDueOn(h, iso)) continue;
        const done = !!h.checks?.[iso];
        items.push({ kind: "habit", title: h.title, label: "Habit", habitId: h.id, done, overdue: false });
      }
    }

    const order = { task: 1, milestone: 2, goal: 3, habit: 4 };
    items.sort((a, b) => {
      if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
      return (order[a.kind] || 99) - (order[b.kind] || 99);
    });

    return items;
  }

  function dotInfo(iso) {
    const its = itemsForDay(iso);
    return {
      overdue: its.some(x => x.overdue),
      hasTasks: its.some(x => x.kind === "task" || x.kind === "milestone"),
      hasHabits: its.some(x => x.kind === "habit"),
      hasGoals: its.some(x => x.kind === "goal"),
      any: its.length > 0
    };
  }

  // ---- Views ----
  function renderMonth(anchorISO, selectedISO) {
    const mStart = startOfMonth(anchorISO);
    const gridStart = startOfWeekMon(mStart);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

    const head = dowRO.map(d => `<div class="iosDow">${d}</div>`).join("");

    const cellHtml = cells.map(d => {
      const inMonth = sameMonth(d, anchorISO);
      const isToday = d === today;
      const isSel = d === selectedISO;
      const info = dotInfo(d);

      const dots = `
        ${info.hasTasks ? `<span class="iosDot"></span>` : `<span class="iosDot ghost"></span>`}
        ${info.hasHabits ? `<span class="iosDot"></span>` : `<span class="iosDot ghost"></span>`}
        ${info.hasGoals ? `<span class="iosDot"></span>` : `<span class="iosDot ghost"></span>`}
      `;

      return `
        <button class="iosDay ${inMonth ? "" : "dim"} ${isToday ? "today" : ""} ${isSel ? "sel" : ""} ${info.overdue ? "bad" : ""}"
                data-day="${App.esc(d)}">
          <div class="iosNum">${App.esc(String(dayNum(d)))}</div>
          <div class="iosDots">${dots}</div>
        </button>
      `;
    }).join("");

    return `
      <div class="iosCalBody calSwipeArea" id="swipeArea">
        <div class="iosTitleRow">
          <div class="iosTitle">${App.esc(monthTitleRO(anchorISO))}</div>
          <button class="iosIconBtn" id="filtersBtn">Filters</button>
        </div>
        <div class="iosGridHead">${head}</div>
        <div class="iosGrid">${cellHtml}</div>
      </div>
    `;
  }

  function renderWeek(anchorISO, selectedISO) {
    const start = startOfWeekMon(anchorISO);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    const cols = days.map(d => {
      const isToday = d === today;
      const isSel = d === selectedISO;
      const info = dotInfo(d);

      return `
        <button class="iosWeekDay ${isToday ? "today":""} ${isSel ? "sel":""} ${info.overdue ? "bad":""}"
                data-day="${App.esc(d)}">
          <div class="iosWeekDow">${App.esc(dowShortRO(d))}</div>
          <div class="iosWeekNum">${App.esc(String(dayNum(d)))}</div>
          ${info.any ? `<div class="iosWeekDot"></div>` : `<div class="iosWeekDot ghost"></div>`}
        </button>
      `;
    }).join("");

    return `
      <div class="iosCalBody calSwipeArea" id="swipeArea">
        <div class="iosTitleRow">
          <div class="iosTitle">${App.esc(weekTitleRO(anchorISO))}</div>
          <button class="iosIconBtn" id="filtersBtn">Filters</button>
        </div>
        <div class="iosWeekStrip">${cols}</div>
      </div>
    `;
  }

  function renderYear(anchorISO) {
    const Y = Number(String(anchorISO).slice(0, 4));
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${pad2(i + 1)}-01`);

    const cards = months.map(m0 => `
      <button class="iosMiniMonth" data-month="${App.esc(m0)}">
        <div class="iosMiniTitle">${App.esc(monthTitleRO(m0))}</div>
      </button>
    `).join("");

    return `
      <div class="iosCalBody calSwipeArea" id="swipeArea">
        <div class="iosTitleRow">
          <div class="iosTitle">Anul ${App.esc(String(Y))}</div>
          <button class="iosIconBtn" id="filtersBtn">Filters</button>
        </div>
        <div class="iosYearGrid">${cards}</div>
      </div>
    `;
  }

  function renderAgenda(selectedISO) {
    const its = itemsForDay(selectedISO);

    const list = its.length ? its.map(it => {
      if (it.kind === "habit") {
        return `
          <div class="iosAgendaRow">
            <label class="iosAgendaHabit">
              <input type="checkbox" ${it.done ? "checked" : ""} data-habit="${App.esc(it.habitId)}" data-date="${App.esc(selectedISO)}" />
              <div class="iosAgendaText">
                <div class="iosAgendaMain">${App.esc(it.title)}</div>
                <div class="iosAgendaSub">Habit</div>
              </div>
            </label>
          </div>
        `;
      }
      return `
        <button class="iosAgendaRow iosAgendaBtn ${it.overdue ? "bad":""}" data-nav="${App.esc(it.nav)}">
          <div class="iosAgendaText">
            <div class="iosAgendaMain">${it.kind === "task" && it.done ? "✅ " : ""}${App.esc(it.title)}</div>
            <div class="iosAgendaSub">${App.esc(it.label || it.kind)}</div>
          </div>
          <span class="iosTag ${it.overdue ? "bad":""}">${App.esc(it.kind)}</span>
        </button>
      `;
    }).join("") : `<div class="muted">No items.</div>`;

    return `
      <div class="iosAgenda">
        <div class="iosAgendaHead">
          <div class="iosAgendaTitle">Agenda</div>
          <div class="iosAgendaDate">${App.esc(selectedISO)}${selectedISO === today ? " • Azi" : ""}</div>
        </div>
        <div class="iosAgendaList">${list}</div>
      </div>
    `;
  }

  // ---- Filters sheet ----
  function renderFiltersSheet(filters) {
    return `
      <div class="iosSheetBackdrop" id="sheetBackdrop"></div>
      <div class="iosSheet" id="sheet">
        <div class="iosSheetGrab"></div>
        <div class="iosSheetTitle">Filters</div>

        <label class="iosCheckRow"><input type="checkbox" id="fTasks" ${filters.tasks ? "checked" : ""}/> tasks</label>
        <label class="iosCheckRow"><input type="checkbox" id="fHabits" ${filters.habits ? "checked" : ""}/> habits</label>
        <label class="iosCheckRow"><input type="checkbox" id="fMilestones" ${filters.milestones ? "checked" : ""}/> milestones</label>
        <label class="iosCheckRow"><input type="checkbox" id="fGoals" ${filters.goals ? "checked" : ""}/> goals</label>

        <div class="row" style="justify-content:flex-end; margin-top:12px">
          <button class="btn secondary small" id="closeSheetBtn">Done</button>
        </div>
      </div>
    `;
  }

  function openFiltersSheet() {
    const root = document.getElementById("calRoot");
    if (!root) return;

    root.insertAdjacentHTML("beforeend", renderFiltersSheet(yr.calendar.filters));

    const close = () => {
      document.getElementById("sheetBackdrop")?.remove();
      document.getElementById("sheet")?.remove();
    };

    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = () => {
        const db2 = dbLoad();
        const yr2 = App.getYearModel(db2);
        yr2.calendar = yr2.calendar || {};
        yr2.calendar.filters = yr2.calendar.filters || { tasks: true, habits: true, milestones: true, goals: true };
        yr2.calendar.filters[key] = !!el.checked;
        dbSave(db2);
      };
    };

    bind("fTasks", "tasks");
    bind("fHabits", "habits");
    bind("fMilestones", "milestones");
    bind("fGoals", "goals");

    document.getElementById("sheetBackdrop").onclick = () => {
      close();
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    document.getElementById("closeSheetBtn").onclick = () => {
      close();
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  }

  // ---- Swipe ----
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

  function wireSwipe(v, anchorISO) {
    const area = document.getElementById("swipeArea");
    if (!area) return;

    let sx = 0, sy = 0, active = false;
    const THRESH = 45;

    area.ontouchstart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      active = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };

    area.ontouchend = (e) => {
      if (!active) return;
      active = false;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      if (Math.abs(dx) < THRESH) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.8) return;

      if (dx < 0) rerender({ focusDate: nextAnchor(v, anchorISO) });
      else rerender({ focusDate: prevAnchor(v, anchorISO) });
    };
  }

  // ---- Main render ----
  function rerender(patch = {}) {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);

    const view = patch.view ?? (yrNow.calendar?.defaultView || "month");
    const focusDate = patch.focusDate ?? (yrNow.calendar?.focusDate || today);
    const selectedDate = patch.selectedDate ?? (yrNow.calendar?.selectedDate || today);

    savePrefs({ defaultView: view, focusDate, selectedDate });

    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    const v2 = yr2.calendar?.defaultView || "month";
    const a2 = yr2.calendar?.focusDate || today;
    const s2 = yr2.calendar?.selectedDate || today;

    App.viewEl.innerHTML = `
      <div class="iosWrap" id="calRoot">
        <div class="iosCard">
          <div class="iosTop">
            <div class="iosAppTitle">Calendar</div>

            <div class="iosSeg">
              <button class="iosSegBtn ${v2 === "month" ? "active" : ""}" id="segMonth">Month</button>
              <button class="iosSegBtn ${v2 === "week" ? "active" : ""}" id="segWeek">Week</button>
              <button class="iosSegBtn ${v2 === "year" ? "active" : ""}" id="segYear">Year</button>
            </div>

            <div class="iosNav">
              <button class="iosNavBtn" id="prevBtn">‹</button>
              <button class="iosNavBtn" id="todayBtn">Today</button>
              <button class="iosNavBtn" id="nextBtn">›</button>
              <div class="iosSelectedPill">Selected <b>${App.esc(s2)}</b></div>
            </div>
          </div>

          <div id="iosCalMount"></div>
        </div>

        <div class="iosCard iosCardAgenda">
          ${renderAgenda(s2)}
        </div>
      </div>
    `;

    const mount = document.getElementById("iosCalMount");
    if (v2 === "year") mount.innerHTML = renderYear(a2);
    else if (v2 === "week") mount.innerHTML = renderWeek(a2, s2);
    else mount.innerHTML = renderMonth(a2, s2);

    // segmented
    document.getElementById("segMonth").onclick = () => rerender({ view: "month" });
    document.getElementById("segWeek").onclick = () => rerender({ view: "week", focusDate: s2 });
    document.getElementById("segYear").onclick = () => rerender({ view: "year", focusDate: `${a2.slice(0, 4)}-01-01` });

    // nav
    document.getElementById("todayBtn").onclick = () => rerender({ focusDate: today, selectedDate: today });
    document.getElementById("prevBtn").onclick = () => rerender({ focusDate: prevAnchor(v2, a2) });
    document.getElementById("nextBtn").onclick = () => rerender({ focusDate: nextAnchor(v2, a2) });

    // select day
    mount.querySelectorAll("[data-day]").forEach(btn => {
      btn.onclick = () => {
        const d = btn.getAttribute("data-day");
        rerender({ selectedDate: d, focusDate: (v2 === "week" ? d : a2) });
      };
    });

    // year -> month
    mount.querySelectorAll("[data-month]").forEach(btn => {
      btn.onclick = () => {
        const m = btn.getAttribute("data-month");
        rerender({ view: "month", focusDate: m, selectedDate: m });
      };
    });

    // filters
    mount.querySelectorAll("#filtersBtn").forEach(b => {
      b.onclick = () => openFiltersSheet();
    });

    // agenda nav
    document.querySelectorAll("[data-nav]").forEach(el => {
      el.onclick = () => { location.hash = el.getAttribute("data-nav"); };
    });

    // habit toggles in agenda
    document.querySelectorAll("input[type='checkbox'][data-habit]").forEach(cb => {
      cb.onchange = () => toggleHabitCheck(cb.getAttribute("data-habit"), cb.getAttribute("data-date"));
    });

    wireSwipe(v2, a2);
  }

  rerender();
};
