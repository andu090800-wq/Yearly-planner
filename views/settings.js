window.Views = window.Views || {};

window.Views.settings = ({ db, App, setPrimary }) => {
  App.setCrumb("Settings");
  setPrimary("+ Add", () => App.toast("Nothing to add here"));

  const years = (db.yearsOrder||[]).slice().sort((a,b)=>a-b);
  const opts = years.map(y=>`<option value="${y}" ${db.settings.currentYear===y?"selected":""}>${y}</option>`).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Settings</div>
        <div class="muted">Currency RON • Week starts Monday • Choose current year</div>

        <div class="grid">
          <div>
            <div class="muted">Current year</div>
            <select id="curYearSel" class="input">${opts}</select>
          </div>
          <div>
            <div class="muted">Currency</div>
            <input class="input" value="RON" disabled />
          </div>
          <div>
            <div class="muted">Week starts</div>
            <input class="input" value="Monday" disabled />
          </div>
        </div>

        <div class="row">
          <button id="saveBtn" class="btn secondary">Save</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("saveBtn").onclick = () => {
    const y = Number(document.getElementById("curYearSel").value);
    db.settings.currentYear = y;
    dbSave(db);
    App.toast("Saved");
    App.navTo("#/goals");
  };
};
