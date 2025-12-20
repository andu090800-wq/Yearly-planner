window.Views = window.Views || {};

window.Views.yearHome = ({ db, App, setPrimary, year }) => {
  const yr = dbEnsureYear(db, year);
  db.settings.currentYear = year;
  dbSave(db);

  App.setCrumb(`Year ${year}`);

  setPrimary("+ Add Goal", () => {
    if (window.Goals?.openGoalEditor) window.Goals.openGoalEditor(null);
    else App.toast("Goals module not loaded");
  });

  const goals = Array.isArray(yr.goals) ? yr.goals : [];
  const overdueGoals = goals.filter(g => window.Goals?.goalOverdue?.(g)).length;
  const overdueTasks = (window.Goals?.collectOverdueTasks?.(goals) || []).length;

  const hero = `
    <div class="card big hero">
      <div class="heroGlow"></div>
      <div>
        <div class="kpi">${App.esc(String(year))}</div>
        <div class="muted">Overview • Overdue • Active habits • Budget snapshots</div>
        <div class="row" style="margin-top:10px">
          <span class="pill">Goals <b>${goals.length}</b></span>
          <span class="pill">Overdue goals <b>${overdueGoals}</b></span>
          <span class="pill">Overdue tasks <b>${overdueTasks}</b></span>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" onclick="location.hash='#/goals'">Goals</button>
          <button class="btn secondary" onclick="location.hash='#/habits'">Habits</button>
          <button class="btn secondary" onclick="location.hash='#/calendar'">Calendar</button>
          <button class="btn secondary" onclick="location.hash='#/budget'">Budget</button>
        </div>
      </div>
      ${App.heroSVG()}
    </div>
  `;

  const quick = `
    <div class="grid">
      <div class="card big stack">
        <div class="kpi" style="font-size:18px">Overdue</div>
        <div class="muted">Across all goals/tasks</div>
        <div class="pill">Goals <b>${overdueGoals}</b></div>
        <div class="pill">Tasks <b>${overdueTasks}</b></div>
        <button class="btn secondary" onclick="location.hash='#/notifications'">Open inbox</button>
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:18px">Habits</div>
        <div class="muted">Binary • Recurrence • Streaks</div>
        <div class="pill"><b>${(yr.habits||[]).length}</b> habits</div>
        <button class="btn secondary" onclick="location.hash='#/habits'">Manage habits</button>
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:18px">Budget</div>
        <div class="muted">Accounts • Transactions • Recurring</div>
        <div class="pill"><b>${(yr.budget?.transactions||[]).length}</b> transactions</div>
        <button class="btn secondary" onclick="location.hash='#/budget'">Open budget</button>
      </div>
    </div>
  `;

  App.viewEl.innerHTML = `<div class="stack">${hero}${quick}</div>`;
};
