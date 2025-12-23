// views/habits.js — Read-only Habits (only view + check)
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

  function ensureYearOrRedirect(App, db) {
    const yr = App.getYearModel(db);
    if (!yr) {
      App.toast("Add your first year in Dashboard");
      App.navTo("#/dashboard");
      return null;
    }
    return yr;
  }

  // ✅ Habits use GOALS categories
  function goalCategoryLabel(yr, catId) {
    const cats = Array.isArray(yr?.categories?.goals) ? yr.categories.goals : [];
    const c = cats.find((x) => x.id === catId);
    return c ? c.name : "Uncategorized";
  }

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

  // exports
  H.habitDueOn = habitDueOn;
  H._toggle = (id, iso) => {
    toggleHabitCheck(id, iso);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // -------- view --------
  window.Views.habits = ({ db, App, setPrimary }) => {
    const yr = ensureYearOrRedirect(App, db);
    if (!yr) return;

    const year = App.getCurrentYear(db);
    yr.habits = Array.isArray(yr.habits) ? yr.habits : [];

    App.setCrumb(`Habits • ${year}`);
    // ✅ no creation from Habits screen
    setPrimary("Habits", () => App.toast("Read-only"));

    const iso = todayISO();
    const habits = yr.habits.slice();

    const dueToday = habits.filter((h) => habitDueOn(h, iso));
    const doneToday = dueToday.filter((h) => !!h.checks?.[iso]).length;

    // category filter options based on GOALS categories
    const goalCats = (yr.categories?.goals || []).filter((c) => !c.archived);
    const catOptions = [`<option value="">All categories</option>`]
      .concat(goalCats.map((c) => `<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
      .concat(`<option value="__uncat__">Uncategorized</option>`)
      .join("");

    function habitCard(h) {
      const due = habitDueOn(h, iso);
      const done = !!h.checks?.[iso];

      return `
        <div class="card glass2 stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900">${App.esc(h.title)}</div>
            <span class="pill"><b>${due ? (done ? "DONE" : "DUE") : "—"}</b></span>
          </div>
          <div class="muted">${App.esc(goalCategoryLabel(yr, h.categoryId || ""))}</div>

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
            <div class="muted">Read-only • Check habits when due</div>
            <div class="row" style="margin-top:10px">
              <span class="pill">Due today <b>${dueToday.length}</b></span>
              <span class="pill">Done <b>${doneToday}</b></span>
              <span class="pill">Today <b>${App.esc(iso)}</b></span>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="card big stack">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div>
              <div class="kpi" style="font-size:20px">List</div>
              <div class="muted">Only habits due today can be checked</div>
            </div>
            <div class="row">
              <select id="habitCatFilter" class="input" style="width:240px">
                ${catOptions}
              </select>
            </div>
          </div>

          <div id="habitsList" class="stack" style="margin-top:12px; gap:12px">
            ${habits.map(habitCard).join("") || `<div class="muted">No habits yet.</div>`}
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

      const filtered =
        id === ""
          ? habits
          : id === "__uncat__"
            ? habits.filter((h) => !h.categoryId)
            : habits.filter((h) => h.categoryId === id);

      document.getElementById("habitsList").innerHTML =
        filtered.map(habitCard).join("") || `<div class="muted">No habits in this category.</div>`;

      wireList();
    };
  };
})();
