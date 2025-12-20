window.Views = window.Views || {};

window.Views.goalDetail = ({ db, App, setPrimary, goalId }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);
  const g = (yr.goals||[]).find(x => x.id === goalId);

  if (!g) {
    App.setCrumb(`Goal • ${year}`);
    setPrimary("+ Add", () => App.toast("Coming soon"));
    App.viewEl.innerHTML = `
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Goal not found</div>
        <button class="btn secondary" onclick="location.hash='#/goals'">Back</button>
      </div>
    `;
    return;
  }

  g.milestones = Array.isArray(g.milestones) ? g.milestones : [];

  App.setCrumb(`Goal • ${year}`);
  setPrimary("+ Milestone", () => {
    const title = prompt("Milestone title:");
    if (!title) return;
    g.milestones.push({ id: dbUid(), title: title.trim(), dueDate:"", tasks:[] });
    dbSave(db);
    App.toast("Milestone added");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  const today = dbTodayISO();

  const pr = window.Goals?.calcGoalProgress ? window.Goals.calcGoalProgress(g) : {final:0,doneTasks:0,totalTasks:0};
  const overdueGoal = (g.endDate && g.endDate < today && pr.final < 0.999);

  const header = `
    <div class="card big hero">
      <div class="heroGlow"></div>
      <div>
        <div class="kpi">${App.esc(g.title)}</div>
        <div class="muted">${App.esc(g.startDate||"—")} → ${App.esc(g.endDate||"—")}</div>
        <div class="row" style="margin-top:10px">
          <span class="pill">Progress <b>${Math.round(pr.final*100)}%</b></span>
          <span class="pill">Tasks <b>${pr.doneTasks}/${pr.totalTasks}</b></span>
          <span class="pill">Status <b>${overdueGoal ? "OVERDUE" : "—"}</b></span>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn secondary" onclick="location.hash='#/goals'">← Back</button>
          <button class="btn" onclick="window.Goals.openGoalEditor('${App.esc(g.id)}')">Edit goal</button>
        </div>
      </div>
      ${App.heroSVG()}
    </div>
  `;

  const msForm = `
    <div class="card big stack">
      <div class="kpi" style="font-size:20px">Add milestone</div>
      <div class="grid">
        <div>
          <div class="muted">Title</div>
          <input id="msTitle" class="input" placeholder="e.g. Lessons 1–3" />
        </div>
        <div>
          <div class="muted">Due date (optional)</div>
          <input id="msDue" type="date" class="input" />
        </div>
        <div>
          <div class="muted">&nbsp;</div>
          <button id="addMsBtn" class="btn">Add</button>
        </div>
      </div>
    </div>
  `;

  function taskOverdue(t){ return !!t.dueDate && t.dueDate < today && !t.done; }

  const msList = g.milestones.length
    ? g.milestones.map(ms => {
        ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        const done = ms.tasks.filter(t=>t.done).length;
        const total = ms.tasks.length;

        const tasksHtml = ms.tasks.length
          ? ms.tasks.map(t => {
              const overdueT = taskOverdue(t);
              return `
                <div class="card glass2 stack" style="padding:12px">
                  <div class="row" style="justify-content:space-between">
                    <div style="font-weight:900">${t.done ? "✅" : "⬜️"} ${App.esc(t.title)}</div>
                    ${overdueT ? `<span class="pill"><b>OVERDUE</b></span>` : ``}
                  </div>
                  <div class="muted">Due: ${App.esc(t.dueDate || "—")}</div>
                  <div class="row" style="margin-top:8px">
                    <button class="btn small secondary" onclick="(function(){
                      const db=dbLoad(); const yr=App.getYearModel(db);
                      const g=(yr.goals||[]).find(x=>x.id==='${App.esc(g.id)}');
                      const ms=(g.milestones||[]).find(x=>x.id==='${App.esc(ms.id)}');
                      const t=(ms.tasks||[]).find(x=>x.id==='${App.esc(t.id)}');
                      t.done = !t.done; dbSave(db);
                      window.dispatchEvent(new HashChangeEvent('hashchange'));
                    })()">${t.done ? "Undo" : "Done"}</button>

                    <button class="btn small danger" onclick="(function(){
                      if(!confirm('Delete task?')) return;
                      const db=dbLoad(); const yr=App.getYearModel(db);
                      const g=(yr.goals||[]).find(x=>x.id==='${App.esc(g.id)}');
                      const ms=(g.milestones||[]).find(x=>x.id==='${App.esc(ms.id)}');
                      ms.tasks = (ms.tasks||[]).filter(x=>x.id!=='${App.esc(t.id)}');
                      dbSave(db);
                      window.dispatchEvent(new HashChangeEvent('hashchange'));
                    })()">Delete</button>
                  </div>
                </div>
              `;
            }).join("")
          : `<div class="muted">No tasks yet.</div>`;

        return `
          <div class="card big stack">
            <div class="row" style="justify-content:space-between">
              <div>
                <div style="font-weight:900; font-size:16px">${App.esc(ms.title)}</div>
                <div class="muted">Due: ${App.esc(ms.dueDate||"—")} • Tasks: <b>${done}/${total}</b></div>
              </div>
              <button class="btn danger small" onclick="(function(){
                if(!confirm('Delete milestone and tasks?')) return;
                const db=dbLoad(); const yr=App.getYearModel(db);
                const g=(yr.goals||[]).find(x=>x.id==='${App.esc(g.id)}');
                g.milestones = (g.milestones||[]).filter(x=>x.id!=='${App.esc(ms.id)}');
                dbSave(db);
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              })()">Delete</button>
            </div>

            <div class="grid">
              <div style="grid-column:1/-1"><div class="muted">Add task</div></div>
              <div><input id="taskTitle_${App.esc(ms.id)}" class="input" placeholder="Task title" /></div>
              <div><input id="taskDue_${App.esc(ms.id)}" type="date" class="input" /></div>
              <div>
                <button class="btn" onclick="(function(){
                  const title = document.getElementById('taskTitle_${App.esc(ms.id)}').value.trim();
                  const due = document.getElementById('taskDue_${App.esc(ms.id)}').value;
                  if(!title){ alert('Task title required'); return; }
                  const db=dbLoad(); const yr=App.getYearModel(db);
                  const g=(yr.goals||[]).find(x=>x.id==='${App.esc(g.id)}');
                  const ms=(g.milestones||[]).find(x=>x.id==='${App.esc(ms.id)}');
                  ms.tasks = Array.isArray(ms.tasks)?ms.tasks:[];
                  ms.tasks.push({ id: dbUid(), title, dueDate: due||'', done:false });
                  dbSave(db);
                  App.toast('Task added');
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                })()">Add</button>
              </div>
            </div>

            <div class="stack" style="gap:10px; margin-top:10px">
              ${tasksHtml}
            </div>
          </div>
        `;
      }).join("")
    : `<div class="card big stack"><div class="muted">No milestones yet. Add one above.</div></div>`;

  App.viewEl.innerHTML = `<div class="stack">${header}${msForm}${msList}</div>`;

  document.getElementById("addMsBtn").onclick = () => {
    const title = document.getElementById("msTitle").value.trim();
    const due = document.getElementById("msDue").value || "";
    if (!title) return alert("Milestone title required.");
    g.milestones.push({ id: dbUid(), title, dueDate: due, tasks: [] });
    dbSave(db);
    App.toast("Milestone added");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
};
