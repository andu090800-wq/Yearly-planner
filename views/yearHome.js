window.Views = window.Views || {};

window.Views.yearHome = ({ db, App, setPrimary, year: yearFromRoute }) => {
  const year = Number(yearFromRoute ?? App.getCurrentYear(db));

  if (!Number.isFinite(year)) {
    App.toast("Add your first year in Dashboard");
    return App.navTo("#/dashboard");
  }

  // Ensure year exists
  const yr = dbEnsureYear(db, year);

  App.setCrumb(`Year • ${year}`);

  // Primary action: add goal (you can change this to Add Task etc.)
  setPrimary("+ Add Goal", () => {
    // Keep it simple: go to goals screen, user taps Add Goal there
    App.navTo("#/goals");
    App.toast("Add a goal");
  });

  const CUR = db.settings.currency || "RON";
  const today = dbTodayISO();
  const curMonth = today.slice(0, 7);
  const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const goals = Array.isArray(yr.goals) ? yr.goals : [];
  const habits = Array.isArray(yr.habits) ? yr.habits : [];
  const tx = (yr.budget && Array.isArray(yr.budget.transactions)) ? yr.budget.transactions : [];

  // ---- KPIs (safe fallbacks) ----
  function safeGoalProgress01(g) {
    try {
      if (window.Goals?.calcGoalProgress) {
        const p = window.Goals.calcGoalProgress(g);
        return Math.max(0, Math.min(1, Number(p?.final ?? 0)));
      }
    } catch {}
    // fallback: tasks completed / total across milestones
    const ms = Array.isArray(g.milestones) ? g.milestones : [];
    let done = 0, total = 0;
    for (const m of ms) {
      const tasks = Array.isArray(m.tasks) ? m.tasks : [];
      for (const t of tasks) {
        total += 1;
        if (t.done) done += 1;
      }
    }
    return total ? done / total : 0;
  }

  function safeGoalOverdue(g) {
    try {
      if (window.Goals?.goalOverdue) return !!window.Goals.goalOverdue(g);
    } catch {}
    // fallback: endDate < today and not complete
    const end = (g.endDate || "").trim();
    if (!end) return false;
    const p = safeGoalProgress01(g);
    return end < today && p < 0.999;
  }

  function safeHabitDueToday(h) {
    try {
      if (window.Habits?.habitDueOn) return !!window.Habits.habitDueOn(h, today);
    } catch {}
    // fallback: if recurrence missing, assume weekdays
    const r = h.recurrenceRule || { kind: "weekdays" };
    const day = new Date(today + "T00:00:00").getDay(); // 0 Sun .. 6 Sat
    if (r.kind === "daily") return true;
    if (r.kind === "weekdays") return day >= 1 && day <= 5;
    if (r.kind === "weeklyOn") {
      const arr = Array.isArray(r.days) ? r.days : [];
      return arr.includes(day);
    }
    return false;
  }

  // Goals KPIs
  const avgGoalProgress =
    goals.length ? (goals.map(safeGoalProgress01).reduce((a, b) => a + b, 0) / goals.length) : 0;

  let overdueTasks = 0;
  for (const g of goals) {
    const ms = Array.isArray(g.milestones) ? g.milestones : [];
    for (const m of ms) {
      const tasks = Array.isArray(m.tasks) ? m.tasks : [];
      for (const t of tasks) {
        if (!t.done && (t.dueDate || "").trim() && t.dueDate < today) overdueTasks += 1;
      }
    }
  }
  const overdueGoals = goals.filter(safeGoalOverdue).length;

  // Habits KPIs
  const dueToday = habits.filter(safeHabitDueToday);
  const doneToday = dueToday.filter(h => !!h.checks?.[today]);
  const habitsDoneRatio = dueToday.length ? (doneToday.length / dueToday.length) : 0;

  // Budget KPIs (current month)
  const monthTx = tx.filter(t => (t.date || "").slice(0, 7) === curMonth);
  let inc = 0, exp = 0;
  for (const t of monthTx) {
    if (t.type === "income") inc += Number(t.amount || 0);
    else if (t.type === "expense") exp += Number(t.amount || 0);
  }
  const net = inc - exp;

  function pct(n01) { return `${Math.round(Math.max(0, Math.min(1, n01)) * 100)}%`; }

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div class="stack" style="gap:8px">
            <div class="title">${App.esc(String(year))}</div>
            <div class="muted">Today <b>${App.esc(today)}</b> • Currency <b>${App.esc(CUR)}</b></div>

            <div class="row" style="margin-top:10px">
              <button class="btn" onclick="location.hash='#/goals'">Goals</button>
              <button class="btn secondary" onclick="location.hash='#/habits'">Habits</button>
              <button class="btn secondary" onclick="location.hash='#/calendar'">Calendar</button>
              <button class="btn secondary" onclick="location.hash='#/budget'">Budget</button>
              <button class="btn secondary" onclick="location.hash='#/analytics'">Analytics</button>
            </div>
          </div>

          <div class="stack" style="align-items:flex-end; gap:8px">
            <button class="btn danger" id="deleteYearBtn">Delete year</button>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Overview</div>
        <div class="muted">Quick status for goals, tasks, habits and budget.</div>

        <div class="grid" style="margin-top:10px">
          <div class="card stack" style="padding:14px">
            <div class="muted">Goals avg progress</div>
            <div class="title2">${App.esc(pct(avgGoalProgress))}</div>
            <div class="muted">Goals: <b>${goals.length}</b> • Overdue goals: <b>${overdueGoals}</b></div>
          </div>

          <div class="card stack" style="padding:14px">
            <div class="muted">Overdue tasks</div>
            <div class="title2">${App.esc(String(overdueTasks))}</div>
            <div class="muted">Across all goals & milestones</div>
          </div>

          <div class="card stack" style="padding:14px">
            <div class="muted">Habits today</div>
            <div class="title2">${App.esc(`${doneToday.length}/${dueToday.length}`)}</div>
            <div class="muted">Completion: <b>${App.esc(pct(habitsDoneRatio))}</b></div>
          </div>

          <div class="card stack" style="padding:14px">
            <div class="muted">Budget (${App.esc(curMonth)})</div>
            <div class="title2">${App.esc(fmt.format(net))} ${App.esc(CUR)}</div>
            <div class="muted">Income ${App.esc(fmt.format(inc))} • Expense ${App.esc(fmt.format(exp))}</div>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Next steps</div>
        <div class="muted">Jump back in quickly.</div>

        <div class="row" style="margin-top:8px">
          <button class="btn" onclick="location.hash='#/goals'">Open goals</button>
          <button class="btn secondary" onclick="location.hash='#/calendar'">Open calendar</button>
          <button class="btn secondary" onclick="location.hash='#/budget'">Open budget</button>
        </div>
      </div>
    </div>
  `;

  // Delete year (double verification)
  const delBtn = document.getElementById("deleteYearBtn");
  if (delBtn) {
    delBtn.onclick = () => {
      if (!confirm(`Delete year ${year} and ALL its data?`)) return;

      const typed = prompt(`Type the year (${year}) to confirm deletion:`);
      if (String(typed).trim() !== String(year)) {
        alert("Cancelled. Year not deleted.");
        return;
      }

      const db2 = dbLoad();
      try {
        dbDeleteYear(db2, year);
        alert(`Year ${year} deleted.`);
        App.navTo("#/dashboard");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } catch (e) {
        alert(e.message);
      }
    };
  }
};
