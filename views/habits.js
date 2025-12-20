window.Views = window.Views || {};
window.Habits = window.Habits || {};

(() => {
  const H = window.Habits;

  const todayISO = () => dbTodayISO();
  const addDaysISO = (iso, n) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0,10);
  };
  const dayOfWeek = (iso) => {
    // Monday=1 ... Sunday=7
    const d = new Date(iso);
    const js = d.getDay(); // 0..6 (Sun..Sat)
    return js === 0 ? 7 : js;
  };

  function ensureHabitCategories(yr){
    yr.categories = yr.categories || { goals:[], habits:[], budgetIncome:[], budgetExpense:[] };
    yr.categories.habits = Array.isArray(yr.categories.habits) ? yr.categories.habits : [];
  }
  function habitCatLabel(yr, catId){
    const c = (yr.categories.habits || []).find(x => x.id === catId);
    return c ? c.name : "Uncategorized";
  }

  // -------- Recurrence engine (binary habits) --------
  // Supported kinds:
  // - daily
  // - weekdays (Mon..Fri)
  // - daysOfWeek: days [1..7] Monday..Sunday
  // - everyNDays: interval N, startDate
  // - monthly: dayOfMonth 1..31
  // - timesPerWeek: n, allowedDays? (if missing => any day)
  function habitDueOn(h, iso){
    const r = h.recurrenceRule || {kind:"daily"};
    const dow = dayOfWeek(iso);

    if (r.kind === "daily") return true;
    if (r.kind === "weekdays") return dow >= 1 && dow <= 5;
    if (r.kind === "daysOfWeek") {
      const days = Array.isArray(r.days) ? r.days : [];
      return days.includes(dow);
    }
    if (r.kind === "monthly") {
      const day = Number(r.dayOfMonth || 1);
      const dd = Number(iso.slice(8,10));
      return dd === day;
    }
    if (r.kind === "everyNDays") {
      const interval = Math.max(1, Number(r.interval || 1));
      const start = r.startDate || h.createdAt || iso; // fallback
      const a = new Date(start);
      const b = new Date(iso);
      const diff = Math.floor((b - a) / (24*3600*1000));
      return diff >= 0 && (diff % interval === 0);
    }
    if (r.kind === "timesPerWeek") {
      // due if not yet met weekly quota; we treat "due today" as: any day is eligible.
      // if allowedDays exists, only those days are eligible.
      const n = Math.max(1, Number(r.times || 2));
      const allowed = Array.isArray(r.allowedDays) ? r.allowedDays : null;
      if (allowed && !allowed.includes(dow)) return false;

      const weekStart = weekStartISO(iso);
      let count = 0;
      for (let i=0;i<7;i++){
        const d = addDaysISO(weekStart, i);
        if (h.checks?.[d]) count++;
      }
      return count < n;
    }
    return true;
  }

  function weekStartISO(anyISO){
    // Monday week start
    const d = new Date(anyISO);
    const js = d.getDay(); // Sun=0
    const offset = (js === 0 ? 6 : js - 1);
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0,10);
  }

  // -------- Streaks / analytics --------
  function currentStreak(h, uptoISO=todayISO()){
    // streak of consecutive due-days checked up to today
    let streak = 0;
    let cursor = uptoISO;
    for (let i=0;i<366;i++){
      const due = habitDueOn(h, cursor);
      const done = !!h.checks?.[cursor];
      if (due && done) { streak++; cursor = addDaysISO(cursor, -1); continue; }
      if (due && !done) break;
      // if not due, skip backward without breaking
      cursor = addDaysISO(cursor, -1);
    }
    return streak;
  }

  function bestStreak(h, daysBack=365){
    let best=0, cur=0;
    const end = todayISO();
    for (let i=daysBack;i>=0;i--){
      const d = addDaysISO(end, -i);
      const due = habitDueOn(h, d);
      const done = !!h.checks?.[d];
      if (due && done) { cur++; best = Math.max(best, cur); }
      else if (due && !done) { cur = 0; }
      // if not due, ignore
    }
    return best;
  }

  function consistency(h, days=30){
    const end = todayISO();
    let dueCount=0, doneCount=0;
    for (let i=0;i<days;i++){
      const d = addDaysISO(end, -i);
      const due = habitDueOn(h, d);
      if (!due) continue;
      dueCount++;
      if (h.checks?.[d]) doneCount++;
    }
    return dueCount ? (doneCount/dueCount) : 0;
  }

  // -------- CRUD --------
  function openHabitEditor(habitId=null){
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    ensureHabitCategories(yr);

    const editing = habitId ? (yr.habits||[]).find(x=>x.id===habitId) : null;

    const cats = yr.categories.habits || [];
    const catOptions = [
      `<option value="">Uncategorized</option>`,
      ...cats.filter(c=>!c.archived).map(c => `<option value="${window.App.esc(c.id)}">${window.App.esc(c.name)}</option>`)
    ].join("");

    const r = editing?.recurrenceRule || {kind:"weekdays"};

    const body = `
      <div class="grid">
        <div>
          <div class="muted">Title</div>
          <input id="hTitle" class="input" value="${window.App.esc(editing?.title||"")}" placeholder="e.g. 10 min Spanish" />
        </div>
        <div>
          <div class="muted">Category</div>
          <div class="row">
            <select id="hCat" class="input">${catOptions}</select>
            <button id="addCatBtn" class="btn secondary small">+ Category</button>
          </div>
        </div>

        <div style="grid-column:1/-1">
          <div class="muted">Recurrence</div>
          <select id="hRecKind" class="input">
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays only</option>
            <option value="daysOfWeek">Days of week (custom)</option>
            <option value="timesPerWeek">X times per week</option>
            <option value="monthly">Monthly (day of month)</option>
            <option value="everyNDays">Every N days</option>
          </select>

          <div id="recOptions" class="stack" style="margin-top:10px"></div>
        </div>

        <div style="grid-column:1/-1">
          <div class="muted">Notes</div>
          <textarea id="hNotes" class="input">${window.App.esc(editing?.notes||"")}</textarea>
        </div>
      </div>
    `;

    const actions = `
      ${editing ? `<button id="deleteHabitBtn" class="btn danger">Delete</button>` : ``}
      <button id="saveHabitBtn" class="btn">${editing ? "Save" : "Create"}</button>
    `;

    const { modal, close } = openModal(window.App, editing ? "Edit Habit" : "Create Habit", body, actions);

    modal.querySelector("#hCat").value = editing?.categoryId || "";
    modal.querySelector("#hRecKind").value = r.kind || "weekdays";

    const recOptions = modal.querySelector("#recOptions");

    function renderRecOptions(kind){
      if (kind === "daysOfWeek") {
        recOptions.innerHTML = `
          <div class="muted">Choose days (Mon..Sun)</div>
          <div class="row">
            ${[1,2,3,4,5,6,7].map(d=>`
              <label class="pill" style="cursor:pointer">
                <input type="checkbox" class="dow" value="${d}" ${Array.isArray(r.days)&&r.days.includes(d)?"checked":""}/>
                ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d-1]}
              </label>
            `).join("")}
          </div>
        `;
      } else if (kind === "timesPerWeek") {
        recOptions.innerHTML = `
          <div class="grid">
            <div>
              <div class="muted">Times per week</div>
              <input id="tpw" type="number" class="input" min="1" max="7" value="${Number(r.times||2)}" />
            </div>
            <div>
              <div class="muted">Allowed days (optional)</div>
              <div class="row">
                ${[1,2,3,4,5,6,7].map(d=>`
                  <label class="pill" style="cursor:pointer">
                    <input type="checkbox" class="adw" value="${d}" ${Array.isArray(r.allowedDays)&&r.allowedDays.includes(d)?"checked":""}/>
                    ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d-1]}
                  </label>
                `).join("")}
              </div>
              <div class="muted tiny">If none selected → any day allowed.</div>
            </div>
          </div>
        `;
      } else if (kind === "monthly") {
        recOptions.innerHTML = `
          <div class="grid">
            <div>
              <div class="muted">Day of month (1-31)</div>
              <input id="dom" type="number" class="input" min="1" max="31" value="${Number(r.dayOfMonth||1)}" />
            </div>
          </div>
        `;
      } else if (kind === "everyNDays") {
        recOptions.innerHTML = `
          <div class="grid">
            <div>
              <div class="muted">Interval (days)</div>
              <input id="intv" type="number" class="input" min="1" value="${Number(r.interval||2)}" />
            </div>
            <div>
              <div class="muted">Start date</div>
              <input id="startIso" type="date" class="input" value="${window.App.esc(r.startDate||todayISO())}" />
            </div>
          </div>
        `;
      } else {
        recOptions.innerHTML = `<div class="muted">No extra options.</div>`;
      }
    }

    renderRecOptions(modal.querySelector("#hRecKind").value);
    modal.querySelector("#hRecKind").onchange = (e)=> renderRecOptions(e.target.value);

    modal.querySelector("#addCatBtn").onclick = () => {
      const name = prompt("New habit category name:");
      if (!name) return;
      yr.categories.habits.push({ id: dbUid(), name: name.trim(), archived:false });
      dbSave(db);
      window.App.toast("Category added");
      close(); openHabitEditor(habitId);
    };

    modal.querySelector("#saveHabitBtn").onclick = () => {
      const title = modal.querySelector("#hTitle").value.trim();
      if (!title) return alert("Title required.");

      const kind = modal.querySelector("#hRecKind").value;
      let recurrenceRule = { kind };

      if (kind === "daysOfWeek") {
        const days = Array.from(modal.querySelectorAll(".dow")).filter(x=>x.checked).map(x=>Number(x.value));
        recurrenceRule.days = days.length ? days : [1,2,3,4,5];
      } else if (kind === "timesPerWeek") {
        const times = Number(modal.querySelector("#tpw")?.value || 2);
        const allowedDays = Array.from(modal.querySelectorAll(".adw")).filter(x=>x.checked).map(x=>Number(x.value));
        recurrenceRule.times = Math.max(1, Math.min(7, times));
        if (allowedDays.length) recurrenceRule.allowedDays = allowedDays;
      } else if (kind === "monthly") {
        recurrenceRule.dayOfMonth = Math.max(1, Math.min(31, Number(modal.querySelector("#dom")?.value || 1)));
      } else if (kind === "everyNDays") {
        recurrenceRule.interval = Math.max(1, Number(modal.querySelector("#intv")?.value || 2));
        recurrenceRule.startDate = modal.querySelector("#startIso")?.value || todayISO();
      }

      const payload = {
        title,
        categoryId: modal.querySelector("#hCat").value || "",
        notes: modal.querySelector("#hNotes").value.trim(),
        recurrenceRule
      };

      yr.habits = Array.isArray(yr.habits) ? yr.habits : [];
      if (editing) Object.assign(editing, payload);
      else yr.habits.push({
        id: dbUid(),
        createdAt: todayISO(),
        ...payload,
        checks: {},
        linkedGoalIds: []
      });

      dbSave(db);
      close();
      window.App.toast(editing ? "Saved" : "Created");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };

    if (editing){
      modal.querySelector("#deleteHabitBtn").onclick = () => {
        if (!confirm("Delete habit?")) return;
        yr.habits = (yr.habits||[]).filter(x=>x.id!==editing.id);
        dbSave(db);
        close();
        window.App.toast("Deleted");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      };
    }
  }

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

  H.openHabitEditor = openHabitEditor;
  H.habitDueOn = habitDueOn;
  H.currentStreak = currentStreak;
  H.bestStreak = bestStreak;
  H.consistency = consistency;

  function toggleHabitCheck(hId, iso){
    const db = dbLoad();
    const yr = window.App.getYearModel(db);
    const h = (yr.habits||[]).find(x=>x.id===hId);
    if (!h) return;
    h.checks = h.checks && typeof h.checks === "object" ? h.checks : {};
    if (h.checks[iso]) delete h.checks[iso];
    else h.checks[iso] = true;
    dbSave(db);
  }

  window.Views.habits = ({ db, App, setPrimary }) => {
    const year = App.getCurrentYear(db);
    const yr = App.getYearModel(db);
    ensureHabitCategories(yr);

    App.setCrumb(`Habits • ${year}`);
    setPrimary("+ Add Habit", () => openHabitEditor(null));

    const iso = todayISO();
    const habits = Array.isArray(yr.habits) ? yr.habits : [];

    const dueToday = habits.filter(h => habitDueOn(h, iso));
    const doneToday = dueToday.filter(h => !!h.checks?.[iso]).length;

    const catOptions = [`<option value="">All categories</option>`]
      .concat((yr.categories.habits||[]).filter(c=>!c.archived).map(c => `<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
      .join("");

    const header = `
      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">Habits</div>
          <div class="muted">Binary only • Recurrence engine • Streaks</div>
          <div class="row" style="margin-top:10px">
            <span class="pill">Due today <b>${dueToday.length}</b></span>
            <span class="pill">Done <b>${doneToday}</b></span>
            <span class="pill">Today <b>${App.esc(iso)}</b></span>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn" onclick="window.Habits.openHabitEditor()">+ New habit</button>
          </div>
        </div>
        ${App.heroSVG()}
      </div>
    `;

    function habitCard(h){
      const due = habitDueOn(h, iso);
      const done = !!h.checks?.[iso];
      const streak = currentStreak(h, iso);
      const cons = Math.round(consistency(h, 30)*100);
      return `
        <div class="card glass2 stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <div style="font-weight:900">${App.esc(h.title)}</div>
            <span class="pill"><b>${due ? (done ? "DONE" : "DUE") : "—"}</b></span>
          </div>
          <div class="muted">${App.esc(habitCatLabel(yr, h.categoryId))}</div>
          <div class="row" style="margin-top:8px">
            <span class="pill">Streak <b>${streak}</b></span>
            <span class="pill">30d <b>${cons}%</b></span>
          </div>
          <div class="row" style="margin-top:10px">
            ${due ? `<button class="btn small" onclick="(function(){ window.Habits._toggle('${App.esc(h.id)}','${iso}'); })()">${done?"Undo":"Mark done"}</button>` : ``}
            <button class="btn small secondary" onclick="window.Habits.openHabitEditor('${App.esc(h.id)}')">Edit</button>
          </div>
        </div>
      `;
    }

    App.viewEl.innerHTML = `
      <div class="stack">
        ${header}
        <div class="card big stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="kpi" style="font-size:20px">Today</div>
              <div class="muted">Check habits due today</div>
            </div>
            <div class="row">
              <select id="habitCatFilter" class="input" style="width:240px">${catOptions}</select>
              <button class="btn secondary" id="addCatBtn">+ Category</button>
            </div>
          </div>
          <div id="habitsList" class="stack" style="margin-top:12px; gap:12px">
            ${habits.map(habitCard).join("") || `<div class="muted">No habits yet.</div>`}
          </div>
        </div>

        <div class="card big stack">
          <div class="kpi" style="font-size:20px">Analytics</div>
          <div class="muted">Streaks + 30/90 day consistency (heatmap in Calendar Year view)</div>
          <div class="grid">
            <div class="card glass2 stack">
              <div style="font-weight:900">Best streak (all)</div>
              <div class="kpi" style="font-size:22px">${habits.length ? Math.max(...habits.map(h=>bestStreak(h))) : 0}</div>
            </div>
            <div class="card glass2 stack">
              <div style="font-weight:900">Avg 30d consistency</div>
              <div class="kpi" style="font-size:22px">${
                habits.length ? Math.round((habits.map(h=>consistency(h,30)).reduce((a,b)=>a+b,0)/habits.length)*100) : 0
              }%</div>
            </div>
            <div class="card glass2 stack">
              <div style="font-weight:900">Avg 90d consistency</div>
              <div class="kpi" style="font-size:22px">${
                habits.length ? Math.round((habits.map(h=>consistency(h,90)).reduce((a,b)=>a+b,0)/habits.length)*100) : 0
              }%</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("habitCatFilter").onchange = (e) => {
      const id = e.target.value;
      const filtered = id ? habits.filter(h=>h.categoryId===id) : habits;
      document.getElementById("habitsList").innerHTML =
        filtered.map(habitCard).join("") || `<div class="muted">No habits in this category.</div>`;
    };

    document.getElementById("addCatBtn").onclick = () => {
      const name = prompt("New habit category name:");
      if (!name) return;
      yr.categories.habits.push({ id: dbUid(), name: name.trim(), archived:false });
      dbSave(db);
      App.toast("Category added");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
  };

  // Small internal hook for inline onclick
  H._toggle = (id, iso) => {
    toggleHabitCheck(id, iso);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
})();
