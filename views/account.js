window.Views = window.Views || {};

window.Views.account = ({ db, App, setPrimary }) => {
  App.setCrumb("Account");
  setPrimary("+ Add", () => App.toast("Local-only app"));

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Account</div>
        <div class="muted">This app is local-only on your device (no server).</div>
        <div class="row" style="margin-top:10px">
          <span class="pill">Storage <b>localStorage</b></span>
          <span class="pill">Export/Import <b>available</b></span>
        </div>
      </div>
    </div>
  `;
};
