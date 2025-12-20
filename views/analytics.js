window.Views = window.Views || {};

window.Views.analytics = ({ db, App, setPrimary }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);
  const CUR = db.settings.currency || "RON";

  App.setCrumb(`Analytics • ${year}`);
  setPrimary("+ Add", () => App.toast("Charts update automatically"));

  const goals = yr.goals || [];
  const habits = yr.habits || [];
  const tx = yr.budget?.transactions || [];

  const today = dbTodayISO();
  const curMonth = today.slice(0, 7);
  const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const goalProgresses = goals.map(g =>
    window.Goals?.calcGoalProgress ? window.Goals.calcGoalProgress(g).final : 0
  );
  const avgGoal = goalProgresses.length ? (goalProgresses.reduce((a, b) => a + b, 0) / goalProgresses.length) : 0;

  const habit30 = habits.map(h => window.Habits?.consistency ? window.Habits.consistency(h, 30) : 0);
  const avgHabit30 = habit30.length ? (habit30.reduce((a, b) => a + b, 0) / habit30.length) : 0;

  const monthTx = tx.filter(t => (t.date || "").slice(0, 7) === curMonth);
  let inc = 0, exp = 0;
  for (const t of monthTx) {
    if (t.type === "income") inc += Number(t.amount || 0);
    else if (t.type === "expense") exp += Number(t.amount || 0);
  }
  const net = inc - exp;

  function bar(label, value01) {
    const w = Math.round(Math.max(0, Math.min(1, value01)) * 100);
    return `
      <div class="card glass2 stack" style="padding:14px">
        <div style="font-weight:900">${App.esc(label)}</div>
        <div class="muted">${w}%</div>
        <div style="height:10px; border:1px solid var(--border); border-radius:999px; overflow:hidden; background:rgba(255,255,255,.55)">
          <div style="height:100%; width:${w}%; background:rgba(0,0,0,.85)"></div>
        </div>
      </div>
    `;
  }

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">Analytics</div>
          <div class="muted">Goals • Habits • Budget • Currency: <b>${App.esc(CUR)}</b></div>
          <div class="row" style="margin-top:10px">
            <span class="pill">Goals <b>${goals.length}</b></span>
            <span class="pill">Habits <b>${habits.length}</b></span>
            <span class="pill">Tx (month) <b>${monthTx.length}</b></span>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Goals</div>
        <div class="muted">Average hybrid progress</div>
        <div class="grid">
          ${bar("Avg goal progress", avgGoal)}
          ${bar("Goals complete (share)", goals.length
            ? (goals.filter(g => (window.Goals?.calcGoalProgress?.(g)?.final || 0) >= 0.999).length / goals.length)
            : 0)}
          ${bar("Overdue goals (share)", goals.length
            ? (goals.filter(g => window.Goals?.goalOverdue?.(g)).length / goals.length)
            : 0)}
        </div>
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Habits</div>
        <div class="muted">Consistency</div>
        <div class="grid">
          ${bar("Avg 30d consistency", avgHabit30)}
          ${bar("Habits due today done", (function(){
            if (!window.Habits?.habitDueOn) return 0;
            const due = habits.filter(h => window.Habits.habitDueOn(h, today));
            const done = due.filter(h => !!h.checks?.[today]);
            return due.length ? done.length / due.length : 0;
          })())}
          ${bar("Best streak (normalized)", (function(){
            if (!window.Habits?.bestStreak) return 0;
            const best = habits.length ? Math.max(...habits.map(h => window.Habits.bestStreak(h))) : 0;
            return Math.min(1, best / 60);
          })())}
        </div>
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Budget</div>
        <div class="muted">${App.esc(curMonth)} snapshot</div>
        <div class="grid">
          <div class="card glass2 stack">
            <div style="font-weight:900">Income</div>
            <div class="kpi" style="font-size:22px">${App.esc(fmt.format(inc))} ${App.esc(CUR)}</div>
          </div>
          <div class="card glass2 stack">
            <div style="font-weight:900">Expense</div>
            <div class="kpi" style="font-size:22px">${App.esc(fmt.format(exp))} ${App.esc(CUR)}</div>
          </div>
          <div class="card glass2 stack">
            <div style="font-weight:900">Net</div>
            <div class="kpi" style="font-size:22px">${App.esc(fmt.format(net))} ${App.esc(CUR)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
};
