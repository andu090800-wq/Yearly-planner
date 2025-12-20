window.Views = window.Views || {};

window.Views.notifications = ({ db, App, setPrimary }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);
  const today = dbTodayISO();

  App.setCrumb(`Notifications • ${year}`);
  setPrimary("+ Add", () => App.toast("Create from Goals/Habits/Budget"));

  function addDaysISO(iso, n){
    const d = new Date(iso);
    d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  }

  const goals = yr.goals || [];
  const habits = yr.habits || [];

  // Due/Overdue tasks
  const dueTodayTasks = [];
  const overdueTasks = [];
  const upcomingTasks = [];

  for (const g of goals) {
    for (const ms of (g.milestones||[])) {
      for (const t of (ms.tasks||[])) {
        if (!t.dueDate || t.done) continue;
        if (t.dueDate === today) dueTodayTasks.push({g,t});
        else if (t.dueDate < today) overdueTasks.push({g,t});
        else if (t.dueDate <= addDaysISO(today, 7)) upcomingTasks.push({g,t});
      }
    }
  }

  // Goal deadlines
  const overdueGoals = goals.filter(g => window.Goals?.goalOverdue?.(g));
  const dueTodayGoals = goals.filter(g => g.endDate && g.endDate === today);
  const upcomingGoals = goals.filter(g => g.endDate && g.endDate > today && g.endDate <= addDaysISO(today, 7));

  // Habits due today
  const dueTodayHabits = (window.Habits?.habitDueOn)
    ? habits.filter(h => window.Habits.habitDueOn(h, today))
    : [];

  const doneTodayHabits = dueTodayHabits.filter(h => !!h.checks?.[today]);

  function card(title, itemsHtml){
    return `
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">${App.esc(title)}</div>
        <div class="stack" style="gap:10px; margin-top:10px">
          ${itemsHtml || `<div class="muted">Nothing here.</div>`}
        </div>
      </div>
    `;
  }

  const dueTodayHtml = [
    ...dueTodayGoals.map(g=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">🎯 Goal due today</div>
        <div>${App.esc(g.title)}</div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(g.id)}'">Open</button>
      </div>
    `),
    ...dueTodayTasks.map(x=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">🧩 Task due today</div>
        <div>${App.esc(x.t.title)} <span class="muted">(${App.esc(x.g.title)})</span></div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(x.g.id)}'">Open</button>
      </div>
    `),
    ...dueTodayHabits.map(h=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">${h.checks?.[today] ? "✅" : "⬜️"} Habit due today</div>
        <div>${App.esc(h.title)}</div>
        <div class="row" style="margin-top:8px">
          <button class="btn small secondary" onclick="window.Habits?._toggle('${App.esc(h.id)}','${today}')">
            ${h.checks?.[today] ? "Undo" : "Done"}
          </button>
          <button class="btn small" onclick="location.hash='#/habits'">Open habits</button>
        </div>
      </div>
    `)
  ].join("");

  const overdueHtml = [
    ...overdueGoals.map(g=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">⚠️ Goal overdue</div>
        <div>${App.esc(g.title)}</div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(g.id)}'">Open</button>
      </div>
    `),
    ...overdueTasks.map(x=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">⚠️ Task overdue</div>
        <div>${App.esc(x.t.title)} <span class="muted">(due ${App.esc(x.t.dueDate)})</span></div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(x.g.id)}'">Open</button>
      </div>
    `)
  ].join("");

  const upcomingHtml = [
    ...upcomingGoals.map(g=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">⏳ Goal upcoming</div>
        <div>${App.esc(g.title)} <span class="muted">(due ${App.esc(g.endDate)})</span></div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(g.id)}'">Open</button>
      </div>
    `),
    ...upcomingTasks.map(x=>`
      <div class="card glass2 stack" style="padding:12px">
        <div style="font-weight:900">⏳ Task upcoming</div>
        <div>${App.esc(x.t.title)} <span class="muted">(due ${App.esc(x.t.dueDate)})</span></div>
        <button class="btn small" onclick="location.hash='#/goal/${App.esc(x.g.id)}'">Open</button>
      </div>
    `)
  ].join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">Notifications</div>
          <div class="muted">In-app only • Due today • Overdue • Upcoming 7 days</div>
          <div class="row" style="margin-top:10px">
            <span class="pill">Habits done today <b>${doneTodayHabits.length}/${dueTodayHabits.length}</b></span>
            <span class="pill">Overdue tasks <b>${overdueTasks.length}</b></span>
            <span class="pill">Overdue goals <b>${overdueGoals.length}</b></span>
          </div>
        </div>
        ${App.heroSVG()}
      </div>

      ${card("Due today", dueTodayHtml)}
      ${card("Overdue", overdueHtml)}
      ${card("Upcoming (7 days)", upcomingHtml)}
    </div>
  `;
};
