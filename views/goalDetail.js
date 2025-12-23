// views/goalDetail.js
window.Views = window.Views || {};

window.Views.goalDetail = ({ db, App, setPrimary, goalId }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);

  if (!yr) {
    App.toast("Add your first year in Dashboard");
    return App.navTo("#/dashboard");
  }

  yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
  yr.habits = Array.isArray(yr.habits) ? yr.habits : [];

  const g = yr.goals.find((x) => x.id === goalId);

  if (!g) {
    App.setCrumb(`Goal • ${year}`);
    setPrimary("+ Add", () => App.toast("Coming soon"));
    App.viewEl.innerHTML = `
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Goal not found</div>
        <button class="btn secondary" id="backBtn">Back</button>
      </div>
    `;
    document.getElementById("backBtn").onclick = () => App.navTo("#/goals");
    return;
  }

  // normalize
  g.milestones = Array.isArray(g.milestones) ? g.milestones : [];
  g.linkedHabitIds = Array.isArray(g.linkedHabitIds) ? g.linkedHabitIds : [];

  const today = dbTodayISO();

  function save(mutator) {
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    if (!yr2) return;
    yr2.goals = Array.isArray(yr2.goals) ? yr2.goals : [];
    yr2.habits = Array.isArray(yr2.habits) ? yr2.habits : [];

    const g2 = yr2.goals.find((x) => x.id === goalId);
    if (!g2) return;

    mutator({ db2, yr2, g2 });
    dbSave(db2);
  }

  function taskOverdue(t) {
    const dd = (t.dueDate || "").trim();
    return !!dd && dd < today && !t.done;
  }

  function calcProgress(goal) {
    // try global helper
    if (window.Goals?.calcGoalProgress) return window.Goals.calcGoalProgress(goal);

    // fallback tasks ratio
    let total = 0, done = 0;
    for (const ms of (goal.milestones || [])) {
      for (const t of (ms.tasks || [])) {
        total++;
        if (t.done) done++;
      }
    }
    const ratio = total ? done / total : 0;
    return { mode: "tasks", ratio, label: `${done}/${total}` };
  }

  function openInCalendar(iso) {
    // set calendar to day view + focusDate
    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    if (yr2) {
      yr2.calendar = yr2.calendar || {};
      yr2.calendar.defaultView = "day";
      yr2.calendar.focusDate = iso;
      yr2.calendar.selectedDate = iso;
      dbSave(db2);
    }
    App.navTo("#/calendar");
  }

  function render() {
    const dbNow = dbLoad();
    const yrNow = App.getYearModel(dbNow);
    const gNow = (yrNow?.goals || []).find((x) => x.id === goalId);
    if (!gNow) return App.navTo("#/goals");

    gNow.milestones = Array.isArray(gNow.milestones) ? gNow.milestones : [];
    gNow.linkedHabitIds = Array.isArray(gNow.linkedHabitIds) ? gNow.linkedHabitIds : [];

    App.setCrumb(`Goal • ${year}`);
    setPrimary("+ Milestone", () => {
      const title = prompt("Milestone title:");
      if (!title) return;
      const due = prompt("Milestone due date (YYYY-MM-DD) optional:", "") || "";
      save(({ g2 }) => {
        g2.milestones = Array.isArray(g2.milestones) ? g2.milestones : [];
        g2.milestones.push({ id: dbUid(), title: title.trim(), dueDate: due.trim(), tasks: [] });
      });
      App.toast("Milestone added");
      render();
    });

    const pr = calcProgress(gNow);
    const overdueGoal = (gNow.endDate || "").trim() && gNow.endDate < today && pr.ratio < 0.999;

    const linkedHabits = (yrNow?.habits || []).filter((h) => (gNow.linkedHabitIds || []).includes(h.id));

    App.viewEl.innerHTML = `
      <div class="stack">
        <div class="card big hero">
          <div class="heroGlow"></div>
          <div>
            <div class="kpi">${App.esc(gNow.title)}</div>
            <div class="muted">${App.esc(gNow.startDate || "—")} → ${App.esc(gNow.endDate || "—")}</div>

            <div class="row" style="margin-top:10px">
              <span class="pill">Progress <b>${App.esc(pr.label || (Math.round(pr.ratio * 100) + "%"))}</b></span>
              <span class="pill">Status <b>${overdueGoal ? "OVERDUE" : "—"}</b></span>
              ${(gNow.endDate || "").trim()
                ? `<button class="btn small secondary" id="openDeadlineCal">Open deadline in Calendar</button>`
                : ``}
            </div>

            <div class="row" style="margin-top:10px">
              <button class="btn secondary" id="backBtn">← Back</button>
              <button class="btn" id="editGoalBtn">Edit goal</button>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="card big stack">
          <div class="row" style="justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap">
            <div>
              <div class="kpi" style="font-size:20px">Linked habits</div>
              <div class="muted">These habits also show up in Calendar.</div>
            </div>
            <div class="row">
              <button class="btn secondary" id="linkHabitBtn">+ Link habit</button>
            </div>
          </div>

          <div class="stack" id="linkedHabitsList" style="gap:10px">
            ${linkedHabits.length ? linkedHabits.map(h => `
              <div class="card glass2 row" style="justify-content:space-between; padding:12px">
                <div>
                  <div style="font-weight:900">${App.esc(h.title)}</div>
                  <div class="muted">Habit</div>
                </div>
                <div class="row">
                  <button class="btn small secondary" data-open-habit="${App.esc(h.id)}">Open</button>
                  <button class="btn small danger" data-unlink-habit="${App.esc(h.id)}">Unlink</button>
                </div>
              </div>
            `).join("") : `<div class="muted">No linked habits yet.</div>`}
          </div>
        </div>

        <div class="card big stack">
          <div class="kpi" style="font-size:20px">Milestones</div>
          <div class="muted">Each milestone can contain tasks (with due dates).</div>
        </div>

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

        <div id="msList" class="stack" style="gap:12px"></div>
      </div>
    `;

    // header actions
    document.getElementById("backBtn").onclick = () => App.navTo("#/goals");
    document.getElementById("editGoalBtn").onclick = () => window.Goals?.openGoalEditor?.(gNow.id);
    if ((gNow.endDate || "").trim()) {
      document.getElementById("openDeadlineCal").onclick = () => openInCalendar(gNow.endDate);
    }

    // linked habits actions
    document.getElementById("linkHabitBtn").onclick = () => {
      const all = (yrNow.habits || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
      if (!all.length) return App.toast("No habits yet. Create one first.");

      const list = all.map((h, i) => `${i + 1}. ${h.title}`).join("\n");
      const pick = prompt(`Pick habit number to link:\n${list}`, "1");
      if (!pick) return;
      const idx = Number(pick) - 1;
      const h = all[idx];
      if (!h) return;

      save(({ yr2, g2 }) => {
        g2.linkedHabitIds = Array.isArray(g2.linkedHabitIds) ? g2.linkedHabitIds : [];
        if (!g2.linkedHabitIds.includes(h.id)) g2.linkedHabitIds.push(h.id);

        // reverse link
        const h2 = (yr2.habits || []).find((x) => x.id === h.id);
        if (h2) {
          h2.linkedGoalIds = Array.isArray(h2.linkedGoalIds) ? h2.linkedGoalIds : [];
          if (!h2.linkedGoalIds.includes(g2.id)) h2.linkedGoalIds.push(g2.id);
        }
      });

      App.toast("Habit linked");
      render();
    };

    App.viewEl.querySelectorAll("[data-open-habit]").forEach((b) => {
      b.onclick = () => App.navTo("#/habits");
    });

    App.viewEl.querySelectorAll("[data-unlink-habit]").forEach((b) => {
      b.onclick = () => {
        const hid = b.getAttribute("data-unlink-habit");
        save(({ yr2, g2 }) => {
          g2.linkedHabitIds = (g2.linkedHabitIds || []).filter((id) => id !== hid);

          const h2 = (yr2.habits || []).find((x) => x.id === hid);
          if (h2) {
            h2.linkedGoalIds = Array.isArray(h2.linkedGoalIds) ? h2.linkedGoalIds : [];
            h2.linkedGoalIds = h2.linkedGoalIds.filter((id) => id !== g2.id);
          }
        });
        App.toast("Unlinked");
        render();
      };
    });

    // add milestone
    document.getElementById("addMsBtn").onclick = () => {
      const title = document.getElementById("msTitle").value.trim();
      const due = document.getElementById("msDue").value || "";
      if (!title) return alert("Milestone title required.");
      save(({ g2 }) => {
        g2.milestones = Array.isArray(g2.milestones) ? g2.milestones : [];
        g2.milestones.push({ id: dbUid(), title, dueDate: due, tasks: [] });
      });
      App.toast("Milestone added");
      render();
    };

    // milestones list
    const msListEl = document.getElementById("msList");
    if (!gNow.milestones.length) {
      msListEl.innerHTML = `<div class="card big"><div class="muted">No milestones yet. Add one above.</div></div>`;
      return;
    }

    msListEl.innerHTML = gNow.milestones.map((ms) => {
      ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
      const done = ms.tasks.filter((t) => !!t.done).length;
      const total = ms.tasks.length;

      return `
        <div class="card big stack" data-ms="${App.esc(ms.id)}">
          <div class="row" style="justify-content:space-between">
            <div>
              <div style="font-weight:900; font-size:16px">${App.esc(ms.title)}</div>
              <div class="muted">
                Due: <b>${App.esc(ms.dueDate || "—")}</b>
                • Tasks: <b>${done}/${total}</b>
                ${ms.dueDate ? `• <button class="btn small secondary" data-open-cal="${App.esc(ms.dueDate)}">Open day</button>` : ``}
              </div>
            </div>
            <button class="btn danger small" data-del-ms="${App.esc(ms.id)}">Delete</button>
          </div>

          <div class="grid">
            <div style="grid-column:1/-1"><div class="muted">Add task</div></div>
            <div><input class="input" data-task-title="${App.esc(ms.id)}" placeholder="Task title" /></div>
            <div><input class="input" type="date" data-task-due="${App.esc(ms.id)}" /></div>
            <div><button class="btn" data-add-task="${App.esc(ms.id)}">Add</button></div>
          </div>

          <div class="stack" style="gap:10px; margin-top:10px">
            ${
              ms.tasks.length
                ? ms.tasks.map((t) => `
                    <div class="card glass2 stack" style="padding:12px" data-task="${App.esc(t.id)}">
                      <div class="row" style="justify-content:space-between">
                        <div style="font-weight:900">${t.done ? "✅" : "⬜️"} ${App.esc(t.title)}</div>
                        ${taskOverdue(t) ? `<span class="pill"><b>OVERDUE</b></span>` : ``}
                      </div>
                      <div class="muted">Due: ${App.esc(t.dueDate || "—")}</div>
                      <div class="row" style="margin-top:8px">
                        <button class="btn small secondary" data-toggle-task="${App.esc(ms.id)}::${App.esc(t.id)}">${t.done ? "Undo" : "Done"}</button>
                        <button class="btn small danger" data-del-task="${App.esc(ms.id)}::${App.esc(t.id)}">Delete</button>
                        ${t.dueDate ? `<button class="btn small" data-open-cal="${App.esc(t.dueDate)}">Calendar</button>` : ``}
                      </div>
                    </div>
                  `).join("")
                : `<div class="muted">No tasks yet.</div>`
            }
          </div>
        </div>
      `;
    }).join("");

    // wire milestone actions
    msListEl.querySelectorAll("[data-open-cal]").forEach((b) => {
      b.onclick = () => openInCalendar(b.getAttribute("data-open-cal"));
    });

    msListEl.querySelectorAll("[data-del-ms]").forEach((b) => {
      b.onclick = () => {
        const msId = b.getAttribute("data-del-ms");
        if (!confirm("Delete milestone and tasks?")) return;
        save(({ g2 }) => {
          g2.milestones = (g2.milestones || []).filter((x) => x.id !== msId);
        });
        App.toast("Deleted");
        render();
      };
    });

    msListEl.querySelectorAll("[data-add-task]").forEach((b) => {
      b.onclick = () => {
        const msId = b.getAttribute("data-add-task");
        const titleEl = msListEl.querySelector(`[data-task-title="${CSS.escape(msId)}"]`);
        const dueEl = msListEl.querySelector(`[data-task-due="${CSS.escape(msId)}"]`);
        const title = (titleEl?.value || "").trim();
        const due = dueEl?.value || "";
        if (!title) return alert("Task title required.");

        save(({ g2 }) => {
          const ms2 = (g2.milestones || []).find((x) => x.id === msId);
          if (!ms2) return;
          ms2.tasks = Array.isArray(ms2.tasks) ? ms2.tasks : [];
          ms2.tasks.push({ id: dbUid(), title, dueDate: due, done: false });
        });

        App.toast("Task added");
        render();
      };
    });

    msListEl.querySelectorAll("[data-toggle-task]").forEach((b) => {
      b.onclick = () => {
        const [msId, tId] = (b.getAttribute("data-toggle-task") || "").split("::");
        save(({ g2 }) => {
          const ms2 = (g2.milestones || []).find((x) => x.id === msId);
          const t2 = (ms2?.tasks || []).find((x) => x.id === tId);
          if (t2) t2.done = !t2.done;
        });
        render();
      };
    });

    msListEl.querySelectorAll("[data-del-task]").forEach((b) => {
      b.onclick = () => {
        const [msId, tId] = (b.getAttribute("data-del-task") || "").split("::");
        if (!confirm("Delete task?")) return;
        save(({ g2 }) => {
          const ms2 = (g2.milestones || []).find((x) => x.id === msId);
          if (!ms2) return;
          ms2.tasks = (ms2.tasks || []).filter((x) => x.id !== tId);
        });
        App.toast("Deleted");
        render();
      };
    });
  }

  render();
};
