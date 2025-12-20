window.Views = window.Views || {};

window.Views.more = ({ db, App, setPrimary }) => {
  App.setCrumb("More");
  setPrimary("+ Add", () => App.toast("Coming soon"));

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">More</div>
        <div class="muted">Mobile quick links</div>
        <div class="row">
          <button class="btn secondary" onclick="location.hash='#/settings'">Settings</button>
          <button class="btn secondary" onclick="location.hash='#/account'">Account</button>
          <button class="btn secondary" onclick="location.hash='#/notifications'">Notifications</button>
          <button class="btn secondary" onclick="location.hash='#/payment'">Payment</button>
        </div>
      </div>
    </div>
  `;
};
