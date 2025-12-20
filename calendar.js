window.Views = window.Views || {};

window.Views.calendar = ({ db, App, setPrimary }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);

  App.setCrumb(`Calendar • ${year}`);
  setPrimary("+ Add", () => App.toast("Add from Goals/Habits"));

  const prefs = yr.calendar || { defaultView:"week", filters:{tasks:true,habits:true,milestones:true,goals:true}, focus:{type:"all",id:""} };
  const viewMode = prefs.defaultView || "week";

  const today = dbTodayISO();

  // Week starts Monday
  function weekStartISO(iso){
    const d = new Date(iso);
    const js = d.getDay(); // Sun=0
    const offset = (js === 0 ? 6 : js - 1);
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0,10);
  }
  function addDaysISO(iso, n){
    const d = new Date(iso);
    d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  }
  function dayLabel(iso){
    const d = new Date(iso);
    const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return `${names[d.getDay()]} ${iso}`;
  }

  // Collect items from goals/habits
  const goals = yr.goals || [];
  const habits = yr.habits || [];

  function collectForDay(iso, filters){
    const items = [];

    // Habits due
    if (filters.habits && window.Habits?.habitDueOn) {
      for (const h of habits) {
        const due = window.Habits.habitDueOn(h, iso);
        if (!due) continue;
        const done = !!h.checks?.[iso];
        items.push({ type:"habit", title: h.title, done, refId:h.id });
      }
    }

    // Goals end date
    if (filters.goals) {
      for (const g of goals) {
        if (g.endDate && g.endDate === iso) items.push({ type:"goal", title:`Goal deadline: ${g.title}`, done:false, refId:g.id });
      }
    }

    // Milestone deadlines + tasks due
    for (const g of goals) {
      for (const ms of (g.milestones||[])) {
        if (filters.milestones && ms.dueDate && ms.dueDate === iso) {
          items.push({ type:"milestone", title:`Milestone: ${ms.title} (${g.title})`, done:false, refId:g.id });
        }
        if (filters.tasks) {
          for (const t of (ms.tasks||[])) {
            if (t.dueDate && t.dueDate === iso) {
              items.push({ type:"task", title:`Task: ${t.title} (${g.title})`, done:!!t.done, refId:g.id });
            }
          }
        }
      }
    }

    return items;
  }

  function savePrefs(next){
    yr.calendar = { ...yr.calendar, ...next };
    dbSave(db);
  }

  // UI
  const header = `
    <div class="card big hero">
      <div class="heroGlow"></div>
      <div>
        <div class="kpi">Calendar</div>
        <div class="muted">Default weekly • Switch weekly/monthly/yearly • Filters</div>
        <div class="row" style="margin-top:10px">
          <span class="pill">Today <b>${App.esc(today)}</b></span>
          <span class="pill">View <b>${App.esc(viewMode)}</b></span>
        </div>

        <div class="row" style="margin-top:10px">
          <button class="btn secondary" id="viewWeekBtn">Weekly</button>
          <button class="btn secondary" id="viewMonthBtn">Monthly</button>
          <button class="btn secondary" id="viewYearBtn">Yearly</button>
        </div>
      </div>
      ${App.heroSVG()}
    </div>
  `;

  const filters = prefs.filters || {tasks:true,habits:true,milestones:true,goals:true};
  const filterUI = `
    <div class="card big stack">
      <div class="kpi" style="font-size:20px">Filters</div>
      <div class="row">
        ${["tasks","habits","milestones","goals"].map(k=>`
          <label class="pill" style="cursor:pointer">
            <input type="checkbox" class="fchk" value="${k}" ${filters[k]?"checked":""}/>
            ${k}
          </label>
        `).join("")}
      </div>
      <div class="muted tiny">Tip: Habits “done” can be toggled from Calendar too.</div>
    </div>
  `;

  function renderWeek(){
    const start = weekStartISO(today);
    const days = Array.from({length:7}, (_,i)=>addDaysISO(start, i));

    const cols = days.map(d=>{
      const items = collectForDay(d, filters);
      const list = items.length ? items.map(it=>{
        if (it.type === "habit") {
          const label = it.done ? "✅" : "⬜️";
          return `
            <div class="card glass2 stack" style="padding:10px">
              <div style="font-weight:900">${label} ${App.esc(it.title)}</div>
              <div class="row" style="margin-top:6px">
                <button class="btn small secondary" onclick="(function(){
                  window.Habits?._toggle('${App.esc(it.refId)}','${d}');
                })()">${it.done?"Undo":"Done"}</button>
              </div>
            </div>
          `;
        }
        const overdue = (it.type === "task" && d < today && !it.done);
        return `
          <div class="card glass2 stack" style="padding:10px">
            <div style="font-weight:900">${overdue ? "⚠️ " : ""}${App.esc(it.title)}</div>
            <div class="row" style="margin-top:6px">
              <button class="btn small" onclick="location.hash='#/goal/${App.esc(it.refId)}'">Open</button>
            </div>
          </div>
        `;
      }).join("") : `<div class="muted">No items.</div>`;

      return `
        <div class="card big stack">
          <div style="font-weight:900">${App.esc(dayLabel(d))}</div>
          <div class="stack" style="margin-top:10px; gap:10px">${list}</div>
        </div>
      `;
    }).join("");

    return `<div class="grid">${cols}</div>`;
  }

  function renderMonth(){
    // lightweight monthly: show list grouped by week
    const first = `${year}-${String(new Date(today).getMonth()+1).padStart(2,"0")}-01`;
    const start = weekStartISO(first);
    const weeks = [];
    for (let w=0; w<6; w++){
      const weekStart = addDaysISO(start, w*7);
      const days = Array.from({length:7}, (_,i)=>addDaysISO(weekStart, i));
      const weekItems = days.map(d=>({ d, items: collectForDay(d, filters) }));
      weeks.push({ weekStart, weekItems });
    }

    const html = weeks.map(w=>{
      const body = w.weekItems.map(x=>{
        if (!x.items.length) return "";
        return `
          <div class="card glass2 stack" style="padding:12px">
            <div style="font-weight:900">${App.esc(x.d)}</div>
            <div class="muted">${x.items.map(i=>i.type).join(", ")}</div>
            <div class="stack" style="margin-top:8px; gap:8px">
              ${x.items.slice(0,5).map(i=>`<div>• ${App.esc(i.title)}</div>`).join("")}
            </div>
          </div>
        `;
      }).join("") || `<div class="muted">No items this week.</div>`;

      return `
        <div class="card big stack">
          <div style="font-weight:900">Week of ${App.esc(w.weekStart)}</div>
          <div class="stack" style="margin-top:10px; gap:10px">${body}</div>
        </div>
      `;
    }).join("");

    return `<div class="stack">${html}</div>`;
  }

  function renderYear(){
    // heatmap-like summary for habits (simple): for each month show done/due ratio
    const months = Array.from({length:12}, (_,i)=>i+1);
    const habitSummary = (yr.habits||[]).map(h=>{
      const rows = months.map(m=>{
        const mm = String(m).padStart(2,"0");
        const start = `${year}-${mm}-01`;
        const end = new Date(year, m, 0); // last day
        const last = `${year}-${mm}-${String(end.getDate()).padStart(2,"0")}`;
        let due=0, done=0;
        let cur = start;
        while (cur <= last) {
          if (window.Habits?.habitDueOn && window.Habits.habitDueOn(h, cur)) {
            due++;
            if (h.checks?.[cur]) done++;
          }
          cur = addDaysISO(cur, 1);
        }
        const pct = due ? Math.round((done/due)*100) : 0;
        return `<span class="pill">${mm}: <b>${pct}%</b></span>`;
      }).join(" ");
      return `
        <div class="card big stack">
          <div style="font-weight:900">${App.esc(h.title)}</div>
          <div class="row" style="margin-top:10px">${rows}</div>
        </div>
      `;
    }).join("") || `<div class="card big"><div class="muted">No habits yet.</div></div>`;

    return `
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Yearly habit heatmap (summary)</div>
        <div class="muted">Per month done/due % (simple view)</div>
      </div>
      ${habitSummary}
    `;
  }

  App.viewEl.innerHTML = `
    <div class="stack">
      ${header}
      ${filterUI}
      <div id="calBody" class="stack"></div>
    </div>
  `;

  function refreshBody(){
    const calBody = document.getElementById("calBody");
    if (prefs.defaultView === "month") calBody.innerHTML = renderMonth();
    else if (prefs.defaultView === "year") calBody.innerHTML = renderYear();
    else calBody.innerHTML = renderWeek();
  }

  document.getElementById("viewWeekBtn").onclick = () => { prefs.defaultView="week"; savePrefs({defaultView:"week"}); refreshBody(); };
  document.getElementById("viewMonthBtn").onclick = () => { prefs.defaultView="month"; savePrefs({defaultView:"month"}); refreshBody(); };
  document.getElementById("viewYearBtn").onclick = () => { prefs.defaultView="year"; savePrefs({defaultView:"year"}); refreshBody(); };

  document.querySelectorAll(".fchk").forEach(chk=>{
    chk.onchange = () => {
      const k = chk.value;
      prefs.filters[k] = chk.checked;
      savePrefs({ filters: prefs.filters });
      refreshBody();
    };
  });

  refreshBody();
};
