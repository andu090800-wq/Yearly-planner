window.Views = window.Views || {};

window.Views.payment = ({ db, App, setPrimary }) => {
  App.setCrumb("Payment method");
  setPrimary("+ Add", () => App.toast("Placeholder"));

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Payment method</div>
        <div class="muted">Placeholder only (no payments in this app).</div>
      </div>
    </div>
  `;
};
