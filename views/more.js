// views/more.js (FINAL)
window.Views = window.Views || {};

window.Views.more = ({ db, App, setPrimary }) => {
  App.setCrumb("More");
  try { setPrimary("", () => {}); } catch {}

  const today = dbTodayISO();
  const year = App.getCurrentYear(db);

  function click(id) {
    const el = document.getElementById(id);
    if (el) el.click();
    else App.toast("Not available on this screen");
  }

  App.viewEl.innerHTML = `
    <div class="stack">

      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">More</div>
          <div class="muted">Account, Settings, and Data tools.</div>
          <div class="row" style="margin-top:10px; flex-wrap:wrap">
            <span class="pill">Year <b>${App.esc(String(year ?? ""))}</b></span>
            <span class="pill">Currency <b>${App.esc(db?.settings?.currency || "RON")}</b></span>
            <span class="pill">Today <b>${App.esc(today)}</b></span>
          </div>
        </div>
        ${App.heroSVG ? App.heroSVG() : ""}
      </div>

      <div class="card big stack">
        <div class="title2">Account</div>
        <div class="stack" style="gap:10px">
          <a class="btn secondary" href="#/account">Account</a>
          <a class="btn secondary" href="#/notifications">Notifications</a>
          <a class="btn secondary" href="#/payment">Payment method</a>
          <a class="btn secondary" href="#/settings">Settings</a>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Tools</div>
        <div class="stack" style="gap:10px">
          <a class="btn secondary" href="#/analytics">Analytics</a>
          <a class="btn secondary" href="#/dashboard">Dashboard</a>
          <a class="btn secondary" href="#/calendar">Calendar</a>
          <a class="btn secondary" href="#/goals">Goals</a>
          <a class="btn secondary" href="#/habits">Habits</a>
          <a class="btn secondary" href="#/budget">Budget</a>
        </div>
      </div>

      <div class="card big stack">
        <div class="title2">Data (local, this device)</div>
        <div class="muted">These use the same buttons from the sidebar (desktop). On mobile, you can use them here.</div>

        <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:10px">
          <button class="btn secondary" id="moreExportBtn">Export</button>
          <button class="btn secondary" id="moreImportBtn">Import</button>
          <button class="btn danger" id="moreWipeBtn">Wipe</button>
        </div>

        <div class="muted tiny" style="margin-top:8px">
          Export saves a JSON backup. Import restores it. Wipe deletes all local data.
        </div>
      </div>

    </div>
  `;

  // Wire Data buttons to the existing sidebar controls (same behavior)
  const ex = document.getElementById("moreExportBtn");
  const im = document.getElementById("moreImportBtn");
  const wi = document.getElementById("moreWipeBtn");

  if (ex) ex.onclick = () => click("exportBtn");
  if (im) im.onclick = () => click("importBtn");
  if (wi) wi.onclick = () => click("wipeBtn");
};
