window.Views = window.Views || {};

window.Views.dashboard = ({ db, App, setPrimary }) => {
  App.setCrumb("Dashboard");

  setPrimary("+ Add Year", () => {
    const y = prompt("Add year (e.g. 2026):");
    if (!y) return;
    const n = Number(y);
    try {
      const db2 = dbLoad();
      dbAddYear(db2, n);
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
            <span class="pill">Today <b>${App.esc(dbTodayISO())}</b></span>

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
      </div>
    </div>
  `;

  const empty = `
    <div class="card big stack">
      <div class="title2">No years yet</div>
      <div class="muted">Tap <b>+ Add Year</b> (top right) to create your first plan year.</div>
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

        <div class="row" style="margin-top:10px; gap:8px">
          <button class="btn secondary small" onclick="location.hash='#/year/${y}'">Open</button>

          <button class="btn small" onclick="(function(){
            const db=dbLoad();
            db.settings.currentYear=${y};
            dbSave(db);
            location.hash='#/goals';
          })()">Use</button>

          <button class="btn danger small" onclick="(function(){
            const year=${y};

            if(!confirm('Delete year ' + year + ' and ALL its data?')) return;

            const typed = prompt('Type the year (' + year + ') to confirm deletion:');
            if(String(typed).trim() !== String(year)) {
              alert('Cancelled. Year not deleted.');
              return;
            }

            const db=dbLoad();
            try {
              dbDeleteYear(db, year);
              alert('Year ' + year + ' deleted.');
              location.hash = '#/dashboard';
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            } catch(e){
              alert(e.message);
            }
          })()">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  App.viewEl.innerHTML = `
    <div class="stack">
      ${header}

      ${years.length ? `
        <div class="card big stack">
          <div>
            <div class="title2">Years</div>
            <div class="muted">Tap a year to open its dashboard.</div>
          </div>

          <div class="gridYears" style="margin-top:12px">
            ${yearCards}
          </div>
        </div>
      ` : empty}
    </div>
  `;

  const sel = document.getElementById("currencySelect");
  sel.value = db.settings.currency || "RON";
  sel.onchange = () => {
    const db2 = dbLoad();
    db2.settings.currency = sel.value;
    dbSave(db2);
    App.toast("Currency updated");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
};
