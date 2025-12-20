window.Views = window.Views || {};
window.Goals = window.Goals || {};

(() => {
  const G = window.Goals;

  const today = () => dbTodayISO();
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const fmtPct = (x) => `${Math.round(x*100)}%`;

  function ensureGoalCategories(yr){
    yr.categories = yr.categories || { goals:[], habits:[], budgetIncome:[], budgetExpense:[] };
    yr.categories.goals = Array.isArray(yr.categories.goals) ? yr.categories.goals : [];
  }

  function catLabel(yr, catId){
    const c = (yr.categories.goals || []).find(x => x.id === catId);
    return c ? c.name : "Uncategorized";
  }

  function calcGoalProgress(goal){
    const tasks = [];
    for (const ms of (goal.milestones || [])) for (const t of (ms.tasks || [])) tasks.push(t);

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.done).length;
    const tasksProgress = totalTasks ? (doneTasks/totalTasks) : null;

    const hasManual = goal.targetValue !== "" && goal.targetValue != null && Number(goal.targetValue) > 0
      && goal.currentValue !== "" && goal.currentValue != null;
    const manualProgress = hasManual ? clamp01(Number(goal.currentValue)/Number(goal.targetValue)) : null;

    let final;
    if (tasksProgress != null && manualProgress != null) final = 0.7*tasksProgress + 0.3*manualProgress;
    else if (tasksProgress != null) final = tasksProgress;
    else if (manualProgress != null) final = manualProgress;
    else final = 0;

    return { final: clamp01(final), totalTasks, doneTasks, hasManual };
  }

  function calcTimeStatus(goal){
    if (!goal.startDate || !goal.endDate) return "—";
    const s = new Date(goal.startDate);
    const e = new Date(goal.endDate);
    if (!(s instanceof Date) || !(e instanceof Date) || e <= s) return "—";
    const t = new Date(today());
    const timeProgress = clamp01((t - s) / (e - s));
    const prog = calcGoalProgress(goal).final;
    if (prog + 0.10 < timeProgress) return "Behind";
    if (prog > timeProgress + 0.10) return "Ahead";
    return "On track";
  }

  function goalOverdue(goal){
    if (!goal.endDate) return false;
    const p = calcGoalProgress(goal).final;
    return goal.endDate < today() && p < 0.999;
  }

  function taskOverdue(task){
    return !!task.dueDate && task.dueDate < today() && !task.done;
  }

  function collectOverdueTasks(goals){
    const out = [];
    for (const g of goals) {
      for (const ms of (g.milestones||[])) {
        for (const t of (ms.tasks||[])) {
          if (taskOverdue(t)) out.push({ goalId:g.id, goalTitle:g.title, milestoneTitle:ms.title, task:t });
        }
      }
    }
    return out;
  }

  G.calcGoalProgress = calcGoalProgress;
  G.goalOverdue = goalOverdue;
  G.collectOverdueTasks = collectOverdueTasks;

  function openModal(App, title, bodyHTML, actionsHTML){
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.25)";
    overlay.style.zIndex = "2000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";

    const modal = document.createElement("div");
    modal.className = "card big stack";
    modal.style.maxWidth = "760px";
    modal.style.width = "100%";
    modal.style.maxHeight = "88vh";
    modal.style.overflow = "auto";

    modal.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><div class="kpi" style="font-size:20px">${App.esc(title)}</div></div>
        <button class="btn secondary small" id="modalCloseBtn">Close</button>
      </div>
      <div>${bodyHTML}</div>
      <div class="row" style="justify-content:flex-end; margin-top:6px">${actionsHTML || ""}</div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e)=>{ if (e.target === overlay) close(); });
    modal.querySelector("#modalCloseBtn").onclick = close;

    return { modal, close };
  }

  function openGoalEditor(goalId=null){
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    ensureGoalCategories(yr);

    const editing = goalId ? (yr.goals||[]).find(g => g.id === goalId) : null;

    const cats = yr.categories.goals || [];
    const catOptions = [
      `<option value="">Uncategorized</option>`,
      ...cats.filter(c=>!c.archived).map(c => `<option value="${window.App.esc(c.id)}">${window.App.esc(c.name)}</option>`)
    ].join("");

    const body = `
      <div class="grid">
        <div>
          <div class="muted">Title</div>
          <input id="gTitle" class="input" value="${window.App.esc(editing?.title||"")}" />
        </div>
        <div>
          <div class="muted">Category</div>
          <div class="row">
            <select id="gCat" class="input">${catOptions}</select>
            <button id="addCatBtn" class="btn secondary small">+ Category</button>
          </div>
        </div>

        <div>
          <div class="muted">Start date (optional)</div>
          <input id="gStart" type="date" class="input" value="${window.App.esc(editing?.startDate||"")}" />
        </div>
        <div>
          <div class="muted">End date (optional)</div>
          <input id="gEnd" type="date" class="input" value="${window.App.esc(editing?.endDate||"")}" />
        </div>

        <div>
          <div class="muted">Target (optional)</div>
          <input id="gTarget" type="number" class="input" value="${editing?.targetValue==null||editing?.targetValue==="" ? "" : window.App.esc(editing.targetValue)}" />
        </div>
        <div>
          <div class="muted">Current (optional)</div>
          <input id="gCurrent" type="number" class="input" value="${editing?.currentValue==null||editing?.currentValue==="" ? "" : window.App.esc(editing.currentValue)}" />
        </div>

        <div>
          <div class="muted">Unit (optional)</div>
          <input id="gUnit" class="input" value="${window.App.esc(editing?.unit||"")}" />
        </div>

        <div style="grid-column:1/-1">
          <div class="muted">Notes</div>
          <textarea id="gNotes" class="input">${window.App.esc(editing?.notes||"")}</textarea>
        </div>
      </div>
    `;

    const actions = `
      ${editing ? `<button id="deleteGoalBtn" class="btn danger">Delete</button>` : ``}
      <button id="saveGoalBtn" class="btn">${editing ? "Save" : "Create"}</button>
    `;

    const { modal, close } = openModal(window.App, editing ? "Edit Goal" : "Create Goal", body, actions);

    const gCat = modal.querySelector("#gCat");
    gCat.value = editing?.categoryId || "";

    modal.querySelector("#addCatBtn").onclick = () => {
      const name = prompt("New goal category name:");
      if (!name) return;
      yr.categories.goals.push({ id: dbUid(), name: name.trim(), archived:false });
      dbSave(db);
      window.App.toast("Category added");
      close();
      openGoalEditor(goalId);
    };

    modal.querySelector("#saveGoalBtn").onclick = () => {
      const title = modal.querySelector("#gTitle").value.trim();
      if (!title) return alert("Title required.");

      const startDate = modal.querySelector("#gStart").value || "";
      const endDate = modal.querySelector("#gEnd").value || "";

      const targetRaw = modal.querySelector("#gTarget").value;
      const currentRaw = modal.querySelector("#gCurrent").value;
      const targetValue = targetRaw === "" ? "" : Number(targetRaw);
      const currentValue = currentRaw === "" ? "" : Number(currentRaw);

      if (targetRaw !== "" && (!Number.isFinite(targetValue) || targetValue <= 0)) return alert("Target must be > 0 or empty.");
      if (currentRaw !== "" && (!Number.isFinite(currentValue) || currentValue < 0)) return alert("Current must be >= 0 or empty.");

      const payload = {
        title,
        categoryId: gCat.value || "",
        startDate,
        endDate,
        targetValue,
        currentValue,
        unit: modal.querySelector("#gUnit").value.trim(),
        notes: modal.querySelector("#gNotes").value.trim()
      };

      yr.goals = Array.isArray(yr.goals) ? yr.goals : [];

      if (editing) Object.assign(editing, payload);
      else yr.goals.push({ id: dbUid(), ...payload, milestones: [], linkedHabitIds: [] });

      dbSave(db);
      close();
      window.App.toast(editing ? "Saved" : "Created");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    if (editing){
      modal.querySelector("#deleteGoalBtn").onclick = () => {
        if (!confirm("Delete this goal and all its milestones/tasks?")) return;
        yr.goals = (yr.goals || []).filter(g => g.id !== editing.id);
        dbSave(db);
        close();
        window.App.toast("Deleted");
        if (window.App.parseHash()[0] === "goal") window.App.navTo("#/goals");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    }
  }

  G.openGoalEditor = openGoalEditor;

  window.Views.goals = ({ db, App, setPrimary }) => {
    const year = App.getCurrentYear(db);
    const yr = App.getYearModel(db);
    ensureGoalCategories(yr);

    App.setCrumb(`Goals • ${year}`);
    setPrimary("+ Add Goal", () => openGoalEditor(null));

    const goals = Array.isArray(yr.goals) ? yr.goals : [];
    const activeCats = (yr.categories.goals||[]).filter(c=>!c.archived);

    const catOptions = [`<option value="">All categories</option>`]
      .concat(activeCats.map(c => `<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
      .join("");

    function goalCard(g){
      const pr = calcGoalProgress(g);
      const ts = calcTimeStatus(g);
      const overdue = goalOverdue(g);
      const badge = overdue
        ? `<span class="pill"><b>OVERDUE</b></span>`
        : (ts !== "—" ? `<span class="pill"><b>${App.esc(ts)}</b></span>` : ``);

      return `
        <div class="card glass2 stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900; font-size:16px">${App.esc(g.title)}</div>
            ${badge}
          </div>
          <div class="muted">${App.esc(catLabel(yr, g.categoryId))} • ${App.esc(g.startDate||"—")} → ${App.esc(g.endDate||"—")}</div>
          <div class="muted">Progress: <b>${fmtPct(pr.final)}</b> • Tasks: <b>${pr.doneTasks}/${pr.totalTasks}</b>${pr.hasManual ? ` • Manual enabled` : ``}</div>
          <div class="row" style="margin-top:10px">
            <button class="btn small" onclick="location.hash='#/goal/${App.esc(g.id)}'">Open</button>
            <button class="btn small secondary" onclick="window.Goals.openGoalEditor('${App.esc(g.id)}')">Edit</button>
          </div>
        </div>
      `;
    }

    App.viewEl.innerHTML = `
      <div class="stack">
        <div class="card big hero">
          <div class="heroGlow"></div>
          <div>
            <div class="kpi">Goals</div>
            <div class="muted">Current year: <b>${App.esc(String(year))}</b></div>
            <div class="row" style="margin-top:10px">
              <button class="btn" onclick="window.Goals.openGoalEditor()">+ New goal</button>
            </div>
            <div class="row" style="margin-top:10px">
              <span class="pill">Total <b>${goals.length}</b></span>
              <span class="pill">Overdue <b>${goals.filter(goalOverdue).length}</b></span>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="card big stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="kpi" style="font-size:20px">List</div>
              <div class="muted">Goal → Milestones → Tasks</div>
            </div>
            <div class="row">
              <select id="goalCatFilter" class="input" style="width:240px">${catOptions}</select>
              <button class="btn secondary" id="addCatBtn">+ Category</button>
            </div>
          </div>

          <div id="goalsList" class="stack" style="margin-top:12px; gap:12px">
            ${goals.map(goalCard).join("") || `<div class="muted">No goals yet.</div>`}
          </div>
        </div>
      </div>
    `;

    document.getElementById("goalCatFilter").onchange = (e) => {
      const id = e.target.value;
      const filtered = id ? goals.filter(g=>g.categoryId===id) : goals;
      document.getElementById("goalsList").innerHTML =
        filtered.map(goalCard).join("") || `<div class="muted">No goals in this category.</div>`;
    };

    document.getElementById("addCatBtn").onclick = () => {
      const name = prompt("New goal category name:");
      if (!name) return;
      yr.categories.goals.push({ id: dbUid(), name: name.trim(), archived:false });
      dbSave(db);
      App.toast("Category added");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  };
})();
