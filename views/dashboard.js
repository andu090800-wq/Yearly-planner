window.Views = window.Views || {};

window.Views.dashboard = ({ db, App, setPrimary }) => {
  App.setCrumb("Dashboard");

  setPrimary("+ Add Year", () => {
    const y = prompt("Add year (e.g. 2026):");
    if (!y) return;
    const n = Number(y);

    try {
      const db2 = dbLoad();
      dbAddYear(db2, n);                 // creates the year + sets currentYear
      App.toast(`Year ${n} added`);
      App.navTo(`#/year/${n}`);
    } catch (e) {
      alert(e.message);
    }
  });

  const years = (db.yearsOrder || []).slice().sort((a, b) => a - b);

  const header = `
    <div class="card big">
      <div class="row" style="justify-content:space-between; align-items:flex-start">
        <div class="stack" style="gap:8px">
          <div class="title">Plans</div>
          <div class="muted">Add your years manually • Everything stays on-device</div>
          <div class="row" style="margin-top:6px">
            <label class="pill" style="gap:10px">
              Currency
              <select id="currencySelect" class="input inputMini">
                <option value="RON">RON</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
        </div>

        <div class="row">
          <button class="btn" id="addYearBtn">+ Add Year</button>
        </div>
      </div>
    </div>
  `;

  const empty = `
    <div class="card big stack">
      <div class="title2">No years yet</div>
      <div class="muted">Create your first year (e.g. 2026) and start adding goals, habits, tasks and budget.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="emptyAddYearBtn">+ Add Year</button>
      </div>
    </div>
  `;

  const yearCards = years.map(y => {
    const yr = dbEnsureYear(db, y);
    const goals = (yr.goals || []).length;
    const habits = (yr.habits || []).length;
    const tx = (yr.budget?.transactions || []).length;

    return `
      <div class="card cardTap stack">
        <div class="yearBig">${App.esc(String(y))}</div>
        <div class="muted">Goals: ${goals} • Habits: ${habits} • Tx: ${tx}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn secondary" onclick="location.hash='#/year/${y}'">Open</button>
          <button class="btn" onclick="(function(){
            const db=dbLoad();
            db.settings.currentYear=${y};
            dbSave(db);
            location.hash='#/goals';
          })()">Use</button>
        </div>
      </div>
    `;
  }).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      ${header}
      ${years.length ? `
        <div class="card big stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="title2">Years</div>
              <div class="muted">Tap a year to open its dashboard.</div>
            </div>
          </div>
          <div class="gridYears" style="margin-top:12px">
            ${yearCards}
          </div>
        </div>
      ` : empty}
    </div>
  `;

  // Wire currency selector
  const sel = document.getElementById("currencySelect");
  sel.value = db.settings.currency || "RON";
  sel.onchange = () => {
    const db2 = dbLoad();
    db2.settings.currency = sel.value;
    dbSave(db2);
    App.toast("Currency updated");
    // refresh current view to reflect changes in other modules later
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  // Wire add-year buttons
  const add = () => {
    const y = prompt("Add year (e.g. 2026):");
    if (!y) return;
    const n = Number(y);
    try {
      const db2 = dbLoad();
      dbAddYear(db2, n);
      App.toast(`Year ${n} added`);
      App.navTo(`#/year/${n}`);
    } catch (e) { alert(e.message); }
  };

  document.getElementById("addYearBtn").onclick = add;
  const emptyBtn = document.getElementById("emptyAddYearBtn");
  if (emptyBtn) emptyBtn.onclick = add;
};
