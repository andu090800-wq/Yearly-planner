// views/goals.js — Categories-first Goals (FINAL)
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
    const db = dbLoad();
    const yr = App.getYearModel(db);
    if (!yr) {
      App.toast("Add your first year in Dashboard");
      App.navTo("#/dashboard");
      return null;
    }
    return { db, yr, year: App.getCurrentYear(db) };
  }

  function ensureGoalCategories(yr) {
    yr.categories = yr.categories || { goals: [], habits: [], budgetIncome: [], budgetExpense: [] };
    yr.categories.goals = Array.isArray(yr.categories.goals) ? yr.categories.goals : [];
  }

  function catById(yr, catId) {
    return (yr.categories.goals || []).find((c) => c.id === catId) || null;
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

  function countOverdueTasks(goal, today) {
    let n = 0;
    for (const t of collectAllTasks(goal)) {
      const dd = (t.dueDate || "").trim();
      if (dd && dd < today && !t.done) n++;
    }
    return n;
  }

  function isGoalDone(goal) {
    const target = safeNum(goal.targetValue);
    const cur = safeNum(goal.currentValue);
    if (target != null && target > 0 && cur != null) return cur >= target;

    const tasks = collectAllTasks(goal);
    return tasks.length > 0 && tasks.every((t) => !!t.done);
  }

  function goalStatus(goal) {
    const today = todayISO();
    if (isGoalDone(goal)) return { key: "done", label: "Done" };

    const end = (goal.endDate || "").trim();
    if (end && end < today) return { key: "overdue", label: "Overdue" };

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

  // ---------- shared modal ----------
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

  // ---------- Category editor ----------
  function openCategoryEditor(existingId = null) {
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    if (!yr) return;

    ensureGoalCategories(yr);
    const editing = existingId ? (yr.categories.goals || []).find((c) => c.id === existingId) : null;

    const body = `
      <div class="grid">
        <div style="grid-column:1/-1">
          <div class="muted">Category name</div>
          <input id="catName" class="input" value="${window.App.esc(editing?.name || "")}" placeholder="e.g. Health, Career..." />
        </div>
      </div>
    `;

    const actions = `
      ${editing ? `<button id="delCatBtn" class="btn danger">Delete</button>` : ``}
      <button id="saveCatBtn" class="btn">${editing ? "Save" : "Create"}</button>
    `;

    const { modal, close } = openModal(window.App, editing ? "Edit Category" : "Create Category", body, actions);

    modal.querySelector("#saveCatBtn").onclick = () => {
      const name = modal.querySelector("#catName").value.trim();
      if (!name) return alert("Category name required.");

      if (editing) editing.name = name;
      else yr.categories.goals.push({ id: dbUid(), name, archived: false });

      dbSave(db);
      close();
      window.App.toast(editing ? "Saved" : "Created");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    if (editing) {
      modal.querySelector("#delCatBtn").onclick = () => {
        const hasGoals = (yr.goals || []).some((g) => g.categoryId === editing.id);
        if (hasGoals) return alert("This category has goals. Move/delete those goals first.");
        if (!confirm("Delete this category?")) return;

        yr.categories.goals = (yr.categories.goals || []).filter((c) => c.id !== editing.id);
        dbSave(db);
        close();
        window.App.toast("Deleted");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    }
  }

  // ---------- Goal editor (category REQUIRED) ----------
  function openGoalEditor(goalId = null, forcedCategoryId = "") {
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    if (!yr) return;

    ensureGoalCategories(yr);

    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    const editing = goalId ? yr.goals.find((g) => g.id === goalId) : null;

    const cats = (yr.categories.goals || []).filter((c) => !c.archived);
    if (!cats.length) {
      window.App.toast("Create a category first");
      return openCategoryEditor(null);
    }

    const catOptions = [
      `<option value="">Select category…</option>`,
      ...cats.map((c) => `<option value="${window.App.esc(c.id)}">${window.App.esc(c.name)}</option>`)
    ].join("");

    const body = `
      <div class="grid">
        <div style="grid-column:1/-1">
          <div class="muted">Title</div>
          <input id="gTitle" class="input" value="${window.App.esc(editing?.title || "")}" placeholder="e.g. Run 10K" />
        </div>

        <div style="grid-column:1/-1">
          <div class="muted">Category (required)</div>
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
          <input id="gTarget" type="number" class="input" value="${editing?.targetValue === "" || editing?.targetValue == null ? "" : window.App.esc(editing.targetValue)}" />
        </div>
        <div>
          <div class="muted">Current (optional)</div>
          <input id="gCurrent" type="number" class="input" value="${editing?.currentValue === "" || editing?.currentValue == null ? "" : window.App.esc(editing.currentValue)}" />
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
    gCat.value = (forcedCategoryId || editing?.categoryId || "");

    modal.querySelector("#addCatBtn").onclick = () => {
      const name = prompt("New goal category name:");
      if (!name) return;
      yr.categories.goals.push({ id: dbUid(), name: name.trim(), archived: false });
      dbSave(db);
      window.App.toast("Category added");
      close();
      openGoalEditor(goalId, forcedCategoryId);
    };

    modal.querySelector("#saveGoalBtn").onclick = () => {
      const title = modal.querySelector("#gTitle").value.trim();
      if (!title) return alert("Title required.");

      const categoryId = (gCat.value || "").trim();
      if (!categoryId) return alert("Category is required.");

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
        categoryId,
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
        yr.goals.push({ id: dbUid(), ...payload, milestones: [], linkedHabitIds: [] });
      }

      dbSave(db);
      close();
      window.App.toast(editing ? "Saved" : "Created");

      window.App.navTo(`#/goals/${categoryId}`);
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
        window.App.navTo(editing.categoryId ? `#/goals/${editing.categoryId}` : "#/goals");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    }
  }

  // exports
  G.openGoalEditor = openGoalEditor;
  G.calcGoalProgress = calcGoalProgress;
  G.goalStatus = goalStatus;

  // ---------- View ----------
  window.Views.goals = ({ db, App, setPrimary }) => {
    const pack = ensureYearOrRedirect(App);
    if (!pack) return;

    const { yr, year } = pack;
    ensureGoalCategories(yr);

    yr.goals = Array.isArray(yr.goals) ? yr.goals : [];
    yr.habits = Array.isArray(yr.habits) ? yr.habits : [];

    const parts = App.parseHash(); // ["goals", "<catId?>"]
    const catId = parts[1] ? String(parts[1]) : "";

    const cats = (yr.categories.goals || []).filter((c) => !c.archived);

    // MODE 1: categories tiles
    if (!catId) {
      App.setCrumb(`Goals • ${year}`);
      setPrimary("+ Category", () => openCategoryEditor(null));

      function tile(c) {
        const goalsIn = (yr.goals || []).filter((g) => g.categoryId === c.id);

        const hidSet = new Set();
        for (const g of goalsIn) {
          const ids = Array.isArray(g.linkedHabitIds) ? g.linkedHabitIds : [];
          ids.forEach((id) => hidSet.add(String(id)));
        }

        const overdue = goalsIn.filter((g) => goalStatus(g).key === "overdue").length;
        const risk = goalsIn.filter((g) => goalStatus(g).key === "risk").length;

        return `
          <div class="card cardTap stack" style="padding:14px; cursor:pointer" data-open-cat="${App.esc(c.id)}">
            <div style="font-weight:900; font-size:18px">${App.esc(c.name)}</div>
            <div class="muted" style="margin-top:4px">Goals: <b>${goalsIn.length}</b> • Habits: <b>${hidSet.size}</b></div>
            <div class="row" style="margin-top:10px">
              <span class="pill">Overdue <b>${overdue}</b></span>
              <span class="pill">At risk <b>${risk}</b></span>
            </div>
            <div class="row" style="margin-top:10px; justify-content:space-between">
              <button class="btn small" data-enter-cat="${App.esc(c.id)}">Open</button>
              <button class="btn small secondary" data-edit-cat="${App.esc(c.id)}">Edit</button>
            </div>
          </div>
        `;
      }

      App.viewEl.innerHTML = `
        <div class="stack">
          <div class="card big hero">
            <div class="heroGlow"></div>
            <div>
              <div class="kpi">Goal categories</div>
              <div class="muted">Year: <b>${App.esc(String(year))}</b></div>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="addCatTopBtn">+ New category</button>
              </div>
              <div class="row" style="margin-top:10px">
                <span class="pill">Categories <b>${cats.length}</b></span>
                <span class="pill">Goals <b>${(yr.goals || []).length}</b></span>
              </div>
            </div>
            ${App.heroSVG()}
          </div>

          <div class="gridYears">
            ${
              cats.length
                ? cats.map(tile).join("")
                : `
                  <div class="card big stack" style="grid-column:1/-1">
                    <div class="kpi" style="font-size:20px">No categories yet</div>
                    <div class="muted">Create a category to start adding goals.</div>
                    <div class="row" style="margin-top:10px">
                      <button class="btn" id="emptyAddCatBtn">+ Add category</button>
                    </div>
                  </div>
                `
            }
          </div>
        </div>
      `;

      const addCat = () => openCategoryEditor(null);
      document.getElementById("addCatTopBtn")?.addEventListener("click", addCat);
      document.getElementById("emptyAddCatBtn")?.addEventListener("click", addCat);

      App.viewEl.querySelectorAll("[data-open-cat],[data-enter-cat]").forEach((el) => {
        el.onclick = () => App.navTo(`#/goals/${el.getAttribute("data-open-cat") || el.getAttribute("data-enter-cat")}`);
      });
      App.viewEl.querySelectorAll("[data-edit-cat]").forEach((el) => {
        el.onclick = () => openCategoryEditor(el.getAttribute("data-edit-cat"));
      });
      return;
    }

    // MODE 2: goals list inside category
    const cat = catById(yr, catId);
    if (!cat) {
      App.toast("Category not found");
      App.navTo("#/goals");
      return;
    }

    App.setCrumb(`${cat.name} • ${year}`);
    setPrimary("+ Goal", () => openGoalEditor(null, catId));

    const goalsInCat = (yr.goals || []).filter((g) => g.categoryId === catId);
    const today = todayISO();

    function goalCard(g) {
      g.milestones = Array.isArray(g.milestones) ? g.milestones : [];
      g.linkedHabitIds = Array.isArray(g.linkedHabitIds) ? g.linkedHabitIds : [];

      const prog = calcGoalProgress(g);
      const st = goalStatus(g);
      const overdueTasks = countOverdueTasks(g, today);
      const risky = st.key === "overdue" || st.key === "risk";

      return `
        <div class="card cardTap stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900; font-size:16px">${App.esc(g.title)}</div>
            <span class="pill ${risky ? "bad" : ""}"><b>${App.esc(st.label)}</b></span>
          </div>
          <div class="muted">${App.esc(g.startDate || "—")} → ${App.esc(g.endDate || "—")}</div>

          <div class="row" style="margin-top:10px">
            <span class="pill">Progress <b>${App.esc(prog.label)}</b></span>
            ${overdueTasks ? `<span class="pill bad">Overdue tasks <b>${overdueTasks}</b></span>` : ``}
            ${g.linkedHabitIds.length ? `<span class="pill">Habits <b>${App.esc(String(g.linkedHabitIds.length))}</b></span>` : ``}
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btn small" data-open-goal="${App.esc(g.id)}">Open</button>
            <button class="btn small secondary" data-edit-goal="${App.esc(g.id)}">Edit</button>
          </div>
        </div>
      `;
    }

    App.viewEl.innerHTML = `
      <div class="stack">
        <div class="card big hero">
          <div class="heroGlow"></div>
          <div>
            <div class="kpi">${App.esc(cat.name)}</div>
            <div class="muted">Goals in this category • Year: <b>${App.esc(String(year))}</b></div>
            <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap">
              <button class="btn secondary" id="backCatsBtn">← Categories</button>
              <button class="btn" id="newGoalBtn">+ New goal</button>
            </div>
            <div class="row" style="margin-top:10px">
              <span class="pill">Goals <b>${goalsInCat.length}</b></span>
            </div>
          </div>
          ${App.heroSVG()}
        </div>

        <div class="gridYears">
          ${
            goalsInCat.length
              ? goalsInCat.map(goalCard).join("")
              : `
                <div class="card big stack" style="grid-column:1/-1">
                  <div class="kpi" style="font-size:20px">No goals yet</div>
                  <div class="muted">Create your first goal in <b>${App.esc(cat.name)}</b>.</div>
                  <div class="row" style="margin-top:10px">
                    <button class="btn" id="emptyNewGoalBtn">+ Add goal</button>
                  </div>
                </div>
              `
          }
        </div>
      </div>
    `;

    document.getElementById("backCatsBtn").onclick = () => App.navTo("#/goals");
    document.getElementById("newGoalBtn").onclick = () => openGoalEditor(null, catId);
    document.getElementById("emptyNewGoalBtn")?.addEventListener("click", () => openGoalEditor(null, catId));

    App.viewEl.querySelectorAll("[data-open-goal]").forEach((btn) => {
      btn.onclick = () => App.navTo(`#/goal/${btn.getAttribute("data-open-goal")}`);
    });
    App.viewEl.querySelectorAll("[data-edit-goal]").forEach((btn) => {
      btn.onclick = () => openGoalEditor(btn.getAttribute("data-edit-goal"), catId);
    });
  };
})();
