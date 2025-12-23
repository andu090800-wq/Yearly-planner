// views/habits.js — VIEW ONLY (no create/edit). Habits are created from Goals only.
window.Views = window.Views || {};
window.Habits = window.Habits || {};

(() => {
  const H = window.Habits;

  const todayISO = () => dbTodayISO();

  const addDaysISO = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const dayOfWeek = (iso) => {
    // Monday=1 ... Sunday=7
    const d = new Date(iso + "T00:00:00");
    const js = d.getDay(); // 0..6 (Sun..Sat)
    return js === 0 ? 7 : js;
  };

  function weekStartISO(anyISO) {
    const d = new Date(anyISO + "T00:00:00");
    const js = d.getDay(); // Sun=0
    const offset = (js === 0 ? 6 : js - 1);
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  }

  // -------- Recurrence engine --------
  function habitDueOn(h, iso) {
    const r = h.recurrenceRule || { kind: "daily" };
    const dow = dayOfWeek(iso);

    if (r.kind === "daily") return true;
    if (r.kind === "weekdays") return dow >= 1 && dow <= 5;

    if (r.kind === "daysOfWeek") {
      const days = Array.isArray(r.days) ? r.days : [];
      return days.includes(dow);
    }

    if (r.kind === "monthly") {
      const day = Math.max(1, Math.min(31, Number(r.dayOfMonth || 1)));
      const dd = Number(iso.slice(8, 10));
      return dd === day;
    }

    if (r.kind === "everyNDays") {
      const interval = Math.max(1, Number(r.interval || 1));
      const start = r.startDate || h.createdAt || iso;
      const a = new Date(start + "T00:00:00");
      const b = new Date(iso + "T00:00:00");
      const diff = Math.floor((b - a) / 86400000);
      return diff >= 0 && diff % interval === 0;
    }

    if (r.kind === "timesPerWeek") {
      const n = Math.max(1, Math.min(7, Number(r.times || 2)));
      const allowed = Array.isArray(r.allowedDays) ? r.allowedDays : null;
      if (allowed && !allowed.includes(dow)) return false;

      const ws = weekStartISO(iso);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDaysISO(ws, i);
        if (h.checks?.[d]) count++;
      }
      return count < n;
    }

    return true;
  }

  // -------- Streaks / analytics --------
  function currentStreak(h, uptoISO = todayISO()) {
    let streak = 0;
    let cursor = uptoISO;
    for (let i = 0; i < 366; i++) {
      const due = habitDueOn(h, cursor);
      const done = !!h.checks?.[cursor];
      if (due && done) { streak++; cursor = addDaysISO(cursor, -1); continue; }
      if (due && !done) break;
      cursor = addDaysISO(cursor, -1);
    }
    return streak;
  }

  function consistency(h, days = 30) {
    const end = todayISO();
    let dueCount = 0, doneCount = 0;
    for (let i = 0; i < days; i++) {
      const d = addDaysISO(end, -i);
      const due = habitDueOn(h, d);
      if (!due) continue;
      dueCount++;
      if (h.checks?.[d]) doneCount++;
    }
    return dueCount ? (doneCount / dueCount) : 0;
  }

  function toggleHabitCheck(hId, iso) {
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    if (!yr) return;

    yr.habits = Array.isArray(yr.habits) ? yr.habits : [];
    const h = yr.habits.find((x) => x.id === hId);
    if (!h) return;

    h.checks = h.checks && typeof h.checks === "object" ? h.checks : {};
    if (h.checks[iso]) delete h.checks[iso];
    else h.checks[iso] = true;

    dbSave(db);
  }

  // exports used by other views (calendar etc.)
  H.habitDueOn = habitDueOn;
  H.currentStreak = currentStreak;
  H.consistency = consistency;
  H._toggle = (id, iso) => {
    toggleHabitCheck(id, iso);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // -------- view helpers: categories are taken from GOALS categories --------
  function catNameById(yr, catId) {
    const c = (yr.categories?.goals || []).find(x => x.id === catId);
    return c ? c.name : "—";
  }

  function habitCategoryIdsFromGoals(yr, habit) {
    const goals = Array.isArray(yr.goals) ? yr.goals : [];
    const ids = Array.isArray(habit.linkedGoalIds) ? habit.linkedGoalIds.map(String) : [];
    const catIds = new Set();
    for (const gid of ids) {
      const g = goals.find(x => String(x.id) === String(gid));
      if (g && g.categoryId) catIds.add(String(g.categoryId));
    }
    return Array.from(catIds);
  }

  function habitMatchesCategory(yr, habit, catId) {
    if (!catId) return true;
    return habitCategoryIdsFromGoals(yr, habit).includes(String(catId));
  }

  // -------- view --------
  window.Views.habits = ({ db, App, setPrimary }) => {
    const year = App.getCurrentYear(db);
    const yr = App.getYearModel(db);
    if (!yr) {
      App.toast("Add your first year in Dashboard");
      return App.navTo("#/dashboard");
    }

    yr.habits = Array.isArray(yr.habits) ? yr.habits : [];
    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    yr.categories = yr.categories || { goals: [], budgetIncome: [], budgetExpense: [] };

    App.setCrumb(`Habits • ${year}`);

    // ✅ no creation from Habits screen
    setPrimary("Habits", () => App.toast("Habits are created from Goals"));

    const iso = todayISO();
    const habits = yr.habits.slice();

    const dueToday = habits.filter((h) => habitDueOn(h, iso));
    const doneToday = dueToday.filter((h) => !!h.checks?.[iso]).length;

    const cats = (yr.categories.goals || []).filter(c => !c.archived);
    const catOptions = [
      `<option value="">All categories</option>`,
      ...cats.map(c => `<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`)
    ].join("");

    function habitCard(h) {
      const due = habitDueOn(h, iso);
      const done = !!h.checks?.[iso];
      const streak = currentStreak(h, iso);
      const cons = Math.round(consistency(h, 30) * 100);

      const catIds = habitCategoryIdsFromGoals(yr, h);
      const catBadges = catIds.length
        ? catIds.map(id => `<span class="pill">${App.esc(catNameById(yr, id))}</span>`).join(" ")
        : `<span class="pill">—</span>`;

      return `
        <div class="card glass2 stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900">${App.esc(h.title)}</div>
            <span class="pill ${due && !done ? "bad" : ""}">
              <b>${due ? (done ? "DONE" : "DUE") : "—"}</b>
            </span>
          </div>

          <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:6px">
            ${catBadges}
          </div>

          <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap">
            <span class="pill">Streak <b>${streak}</b></span>
            <span class="pill">30d <b>${cons}%</b></span>
            <span class="pill">Today <b>${App.esc(iso)}</b></span>
          </div>

          <div class="row" style="margin-top:10px">
            ${due ? `<button class="btn small" data-toggle="${App.esc(h.id)}">${done ? "Undo" : "Mark done"}</button>` : ``}
          </div>
        </div>
      `;
    }

    App.viewEl.innerHTML = `
      <div class="stack">
        <div class="card big hero">
          <div class="heroGlow"></div>
          <div>
            <div class="kpi">Habits</div>
            <div class="muted">View-only • Created from Goals • Check when due</div>
            <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap">
              <span class="pill">Due today <b>${dueToday.length}</b></span>
              <span class="pill">Done <b>${doneToday}</b></span>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="card big stack">
          <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap">
            <div>
              <div class="kpi" style="font-size:20px">List</div>
              <div class="muted">Filter by Goal categories</div>
            </div>
            <div class="row">
              <select id="habitCatFilter" class="input" style="width:260px">${catOptions}</select>
            </div>
          </div>

          <div id="habitsList" class="stack" style="margin-top:12px; gap:12px">
            ${habits.map(habitCard).join("") || `<div class="muted">No habits yet. Create habits from Goals.</div>`}
          </div>
        </div>
      </div>
    `;

    function wireList() {
      App.viewEl.querySelectorAll("[data-toggle]").forEach((b) => {
        b.onclick = () => {
          const id = b.getAttribute("data-toggle");
          H._toggle(id, iso);
        };
      });
    }
    wireList();

    document.getElementById("habitCatFilter").onchange = (e) => {
      const id = e.target.value;
      const filtered = habits.filter(h => habitMatchesCategory(yr, h, id));
      document.getElementById("habitsList").innerHTML =
        filtered.map(habitCard).join("") || `<div class="muted">No habits in this category.</div>`;
      wireList();
    };
  };
})();
