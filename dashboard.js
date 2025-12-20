window.Views = window.Views || {};

window.Views.dashboard = ({ db, App, setPrimary }) => {
  App.setCrumb("Dashboard");

  setPrimary("+ Add Year", () => {
    const y = prompt("Add year (e.g. 2029):");
    if (!y) return;
    const n = Number(y);
    try {
      dbAddYear(db, n);
      App.toast(`Year ${n} added`);
      App.navTo(`#/year/${n}`);
    } catch (e) {
      alert(e.message);
    }
  });

  const years = (db.yearsOrder || []).slice().sort((a,b)=>a-b);

  const hero = `
    <div class="card big hero">
      <div class="heroGlow"></div>
      <div>
        <div class="kpi">Plans</div>
        <div class="muted">Years • Goals • Habits • Budget • Calendar</div>
        <div class="row" style="margin-top:10px">
          <span class="pill">Currency <b>${App.esc(db.settings.currency)}</b></span>
          <span class="pill">Week starts <b>Monday</b></span>
          <span class="pill">Today <b>${App.esc(dbTodayISO())}</b></span>
        </div>
      </div>
      ${App.heroSVG()}
    </div>
  `;

  const cards = years.map(y => {
    const yr = dbEnsureYear(db, y);
    const goals = (yr.goals||[]).length;
    const habits = (yr.habits||[]).length;
    const tx = (yr.budget?.transactions||[]).length;

    return `
      <div class="card glass2 stack">
        <div class="kpi">${App.esc(String(y))}</div>
        <div class="muted">Goals: ${goals} • Habits: ${habits} • Tx: ${tx}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" onclick="location.hash='#/year/${y}'">Open ${y}</button>
          <button class="btn secondary" onclick="(function(){
            const db=dbLoad(); db.settings.currentYear=${y}; dbSave(db);
            location.hash='#/goals';
          })()">Use this year</button>
        </div>
      </div>
    `;
  }).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      ${hero}
      <div class="card big stack">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="kpi" style="font-size:20px">Years</div>
            <div class="muted">Manual years • Cards</div>
          </div>
          <button class="btn secondary" onclick="(function(){
            const y = prompt('Add year (e.g. 2029):');
            if(!y) return;
            const n = Number(y);
            try{ const db=dbLoad(); dbAddYear(db,n); location.hash = '#/year/' + n; }
            catch(e){ alert(e.message); }
          })()">+ Add Year</button>
        </div>
        <div class="grid" style="margin-top:12px">${cards}</div>
      </div>
    </div>
  `;
};
