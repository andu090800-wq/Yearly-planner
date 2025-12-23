// views/goals.js
window.Views = window.Views || {};
window.Goals = window.Goals || {};

(() => {
  const G = window.Goals;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const todayISO = () => dbTodayISO();
  const fmtPct = (x) => `${Math.round(x * 100)}%`;

  function ensureYearOrRedirect(App) {
    const yr = App.getYearModel(dbLoad());
    if (!yr) {
      App.toast("Add your first year in Dashboard");
      App.navTo("#/dashboard");
      return null;
    }
    return yr;
  }

  function ensureGoalCategories(yr) {
    yr.categories = yr.categories || { goals: [], habits: [], budgetIncome: [], budgetExpense: [] };
    yr.categories.goals = Array.isArray(yr.categories.goals) ? yr.categories.goals : [];
  }

  function catLabel(yr, catId) {
    const c = (yr.categories.goals || []).find((x) => x.id === catId);
    return c ? c.name : "Uncategorized";
  }

  function collectAllTasks(goal) {
    const out = [];
    for (const ms of (goal.milestones || [])) {
      for (const t of (ms.tasks || [])) out.push(t);
    }
    return out;
  }

  function calcGoalProgress(goal) {
    // 1) numeric if possible
    const target = safeNum(goal.targetValue);
    const cur = safeNum(goal.currentValue);
    if (target != null && target > 0 && cur != null) {
      const ratio = clamp01(cur / target);
      return { mode: "numeric", ratio, label: fmtPct(ratio) };
    }

    // 2) tasks done ratio
    const tasks = collectAllTasks(goal);
    const total = tasks.length;
    const done = tasks.filter((t) => !!t.done).length;
    if (total > 0) {
      const ratio = clamp01(done / total);
      return { mode: "tasks", ratio, label: `${done}/${total}` };
    }

    return { mode: "none", ratio: 0, label: "0%" };
  }

  function taskOverdue(t, today) {
    const dd = (t.dueDate || "").trim();
    return !!dd && dd < today && !t.done;
  }

  function countOverdueTasks(goal, today) {
    let n = 0;
    for (const t of collectAllTasks(goal)) if (taskOverdue(t, today)) n++;
    return n;
  }

  function isGoalDone(goal) {
    // numeric done
    const target = safeNum(goal.targetValue);
    const cur = safeNum(goal.currentValue);
    if (target != null && target > 0 && cur != null) return cur >= target;

    // tasks done
    const tasks = collectAllTasks(goal);
    return tasks.length > 0 && tasks.every((t) => !!t.done);
  }

  function goalStatus(goal) {
    const today = todayISO();
    if (isGoalDone(goal)) return { key: "done", label: "Done" };

    const end = (goal.endDate || "").trim();
    if (end && end < today) return { key: "overdue", label: "Overdue" };

    // at risk: has overdue tasks OR deadline within 7d and low progress
    if (countOverdueTasks(goal, today) > 0) return { key: "risk", label: "At risk" };

    if (end) {
      const dEnd = new Date(end + "T00:00:00");
      const dNow = new Date(today + "T00:00:00");
      const diffDays = Math.floor((dEnd - dNow) / 86400000);
      const prog = calcGoalProgress(goal).ratio;
      if (diffDays >= 0 && diffDays <= 7 && prog < 0.5) return { key: "risk", label: "At risk" };
    }

    return { key: "track", label: "On track" };
  }

  // ---------- shared modal (single impl) ----------
  function openModal(App, title, bodyHTML, actionsHTML) {
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
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    modal.querySelector("#modalCloseBtn").onclick = close;

    return { modal, close };
  }

  // ---------- editor ----------
  function openGoalEditor(goalId = null) {
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    if (!yr) return;
    ensureGoalCategories(yr);

    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    const editing = goalId ? yr.goals.find((g) => g.id === goalId) : null;

    const cats = yr.categories.goals || [];
    const catOptions = [
      `<option value="">Uncategorized</option>`,
      ...cats.filter((c) => !c.archived).map(
        (c) => `<option value="${window.App.esc(c.id)}">${window.App.esc(c.name)}</option>`
      )
    ].join("");

    const body = `
      <div class="grid">
        <div>
          <div class="muted">Title</div>
          <input id="gTitle" class="input" value="${window.App.esc(editing?.title || "")}" />
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
          <input id="gStart" type="date" class="input" value="${window.App.esc(editing?.startDate || "")}" />
        </div>
        <div>
          <div class="muted">End date / deadline (optional)</div>
          <input id="gEnd" type="date" class="input" value="${window.App.esc(editing?.endDate || "")}" />
        </div>

        <div>
          <div class="muted">Target (optional)</div>
          <input id="gTarget" type="number" class="input" value="${
            editing?.targetValue == null || editing?.targetValue === "" ? "" : window.App.esc(editing.targetValue)
          }" />
        </div>
        <div>
          <div class="muted">Current (optional)</div>
          <input id="gCurrent" type="number" class="input" value="${
            editing?.currentValue == null || editing?.currentValue === "" ? "" : window.App.esc(editing.currentValue)
          }" />
        </div>

        <div>
          <div class="muted">Unit (optional)</div>
          <input id="gUnit" class="input" value="${window.App.esc(editing?.unit || "")}" />
        </div>

        <div style="grid-column:1/-1">
          <div class="muted">Notes</div>
          <textarea id="gNotes" class="input">${window.App.esc(editing?.notes || "")}</textarea>
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
      yr.categories.goals.push({ id: dbUid(), name: name.trim(), archived: false });
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

      if (editing) {
        editing.milestones = Array.isArray(editing.milestones) ? editing.milestones : [];
        editing.linkedHabitIds = Array.isArray(editing.linkedHabitIds) ? editing.linkedHabitIds : [];
        Object.assign(editing, payload);
      } else {
        yr.goals.push({
          id: dbUid(),
          ...payload,
          milestones: [],
          linkedHabitIds: []
        });
      }

      dbSave(db);
      close();
      window.App.toast(editing ? "Saved" : "Created");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    if (editing) {
      modal.querySelector("#deleteGoalBtn").onclick = () => {
        if (!confirm("Delete this goal and all its milestones/tasks?")) return;
        yr.goals = (yr.goals || []).filter((g) => g.id !== editing.id);

        // cleanup reverse links in habits
        yr.habits = Array.isArray(yr.habits) ? yr.habits : [];
        for (const h of yr.habits) {
          h.linkedGoalIds = Array.isArray(h.linkedGoalIds) ? h.linkedGoalIds : [];
          h.linkedGoalIds = h.linkedGoalIds.filter((id) => id !== editing.id);
        }

        dbSave(db);
        close();
        window.App.toast("Deleted");
        if (window.App.parseHash()[0] === "goal") window.App.navTo("#/goals");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    }
  }

  // export helpers
  G.openGoalEditor = openGoalEditor;
  G.calcGoalProgress = calcGoalProgress;
  G.goalStatus = goalStatus;

  // ---------- view ----------
  window.Views.goals = ({ db, App, setPrimary }) => {
    const yr = ensureYearOrRedirect(App);
    if (!yr) return;

    const year = App.getCurrentYear(dbLoad());
    ensureGoalCategories(yr);

    App.setCrumb(`Goals • ${year}`);
    setPrimary("+ Add Goal", () => openGoalEditor(null));

    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    const goals = yr.goals.slice();

    // normalize
    for (const g of goals) {
      g.milestones = Array.isArray(g.milestones) ? g.milestones : [];
      g.linkedHabitIds = Array.isArray(g.linkedHabitIds) ? g.linkedHabitIds : [];
    }

    const activeCats = (yr.categories.goals || []).filter((c) => !c.archived);
    const catOptions = [`<option value="">All categories</option>`]
      .concat(activeCats.map((c) => `<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
      .join("");

    const today = todayISO();
    const totalOverdue = goals.filter((g) => goalStatus(g).key === "overdue").length;

    function goalCard(g) {
      const prog = calcGoalProgress(g);
      const st = goalStatus(g);
      const overdueTasks = countOverdueTasks(g, today);
      const risk = st.key === "overdue" || st.key === "risk";

      return `
        <div class="card glass2 stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900; font-size:16px">${App.esc(g.title)}</div>
            <span class="pill ${risk ? "bad" : ""}"><b>${App.esc(st.label)}</b></span>
          </div>

          <div class="muted">
            ${App.esc(catLabel(yr, g.categoryId))} • ${App.esc(g.startDate || "—")} → ${App.esc(g.endDate || "—")}
          </div>

          <div class="row" style="margin-top:8px">
            <span class="pill">Progress <b>${App.esc(prog.label)}</b></span>
            ${overdueTasks ? `<span class="pill bad">Overdue tasks <b>${overdueTasks}</b></span>` : ``}
            ${g.linkedHabitIds.length ? `<span class="pill">Habits <b>${App.esc(String(g.linkedHabitIds.length))}</b></span>` : ``}
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btn small" data-open="${App.esc(g.id)}">Open</button>
            <button class="btn small secondary" data-edit="${App.esc(g.id)}">Edit</button>
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
              <button class="btn" id="newGoalBtn">+ New goal</button>
            </div>
            <div class="row" style="margin-top:10px">
              <span class="pill">Total <b>${goals.length}</b></span>
              <span class="pill">Overdue <b>${totalOverdue}</b></span>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="card big stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="kpi" style="font-size:20px">List</div>
              <div class="muted">Goal → Milestones → Tasks → Calendar</div>
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

    document.getElementById("newGoalBtn").onclick = () => openGoalEditor(null);

    document.getElementById("goalCatFilter").onchange = (e) => {
      const id = e.target.value;
      const filtered = id ? goals.filter((g) => g.categoryId === id) : goals;
      document.getElementById("goalsList").innerHTML =
        filtered.map(goalCard).join("") || `<div class="muted">No goals in this category.</div>`;

      wireCards();
    };

    document.getElementById("addCatBtn").onclick = () => {
      const name = prompt("New goal category name:");
      if (!name) return;
      const db2 = dbLoad();
      const yr2 = App.getYearModel(db2);
      ensureGoalCategories(yr2);
      yr2.categories.goals.push({ id: dbUid(), name: name.trim(), archived: false });
      dbSave(db2);
      App.toast("Category added");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    function wireCards() {
      App.viewEl.querySelectorAll("[data-open]").forEach((btn) => {
        btn.onclick = () => App.navTo(`#/goal/${btn.getAttribute("data-open")}`);
      });
      App.viewEl.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => openGoalEditor(btn.getAttribute("data-edit"));
      });
    }
    wireCards();
  };
})();
