window.Views = window.Views || {};

window.Views.budget = ({ db, App, setPrimary }) => {
  const yr = App.getYearModel(db);
  const year = App.getCurrentYear(db);

  App.setCrumb(`Budget • ${year}`);
  setPrimary("+ Add Tx", () => document.getElementById("txAmount")?.focus());

  // Categories per-year
  yr.categories = yr.categories || { goals:[], habits:[], budgetIncome:[], budgetExpense:[] };
  yr.categories.budgetIncome = Array.isArray(yr.categories.budgetIncome) ? yr.categories.budgetIncome : [];
  yr.categories.budgetExpense = Array.isArray(yr.categories.budgetExpense) ? yr.categories.budgetExpense : [];

  const budget = yr.budget;
  budget.accounts = budget.accounts || [];
  budget.transactions = budget.transactions || [];
  budget.recurringRules = budget.recurringRules || [];

  const today = dbTodayISO();

  function monthKey(iso){ return iso.slice(0,7); } // YYYY-MM
  const curMonth = monthKey(today);

  function txSigned(tx){
    if (tx.type === "income") return +tx.amount;
    if (tx.type === "expense") return -tx.amount;
    return 0;
  }

  function monthTotals(month){
    const txs = budget.transactions.filter(t => monthKey(t.date) === month);
    let inc=0, exp=0;
    for (const t of txs) {
      if (t.type === "income") inc += t.amount;
      else if (t.type === "expense") exp += t.amount;
    }
    return { inc, exp, net: inc-exp, count: txs.length };
  }

  function catLabel(kind, id){
    const arr = kind==="income" ? yr.categories.budgetIncome : yr.categories.budgetExpense;
    const c = arr.find(x=>x.id===id);
    return c ? c.name : "Uncategorized";
  }

  function ensureMonthGenerated(month){
    // Very simple generator for recurring rules: monthly on dayOfMonth
    // Avoid duplicates by checking (ruleId + date + amount + categoryId + type)
    const start = `${month}-01`;
    const lastDay = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
    for (const r of budget.recurringRules) {
      const sched = r.schedule || {kind:"monthly", dayOfMonth:1, interval:1};
      if (sched.kind !== "monthly") continue;

      const dom = Math.max(1, Math.min(lastDay, Number(sched.dayOfMonth || 1)));
      const date = `${month}-${String(dom).padStart(2,"0")}`;

      const sig = `${r.id}|${date}|${r.type}|${r.amount}|${r.categoryId}|${r.accountId}`;
      const exists = budget.transactions.some(t => t._sig === sig);
      if (exists) continue;

      budget.transactions.push({
        id: dbUid(),
        type: r.type,
        amount: Number(r.amount || 0),
        date,
        accountId: r.accountId || (budget.accounts[0]?.id || ""),
        categoryId: r.categoryId || "",
        note: r.note || "(recurring)",
        createdAt: today,
        _sig: sig
      });
    }
  }

  ensureMonthGenerated(curMonth);
  dbSave(db);

  const totals = monthTotals(curMonth);

  const accountOptions = budget.accounts.map(a=>`<option value="${App.esc(a.id)}">${App.esc(a.name)}</option>`).join("");

  const incomeCatOptions = [`<option value="">Uncategorized</option>`]
    .concat(yr.categories.budgetIncome.filter(c=>!c.archived).map(c=>`<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
    .join("");

  const expenseCatOptions = [`<option value="">Uncategorized</option>`]
    .concat(yr.categories.budgetExpense.filter(c=>!c.archived).map(c=>`<option value="${App.esc(c.id)}">${App.esc(c.name)}</option>`))
    .join("");

  function txRow(t){
    const sign = t.type === "income" ? "+" : (t.type === "expense" ? "-" : "");
    const cat = (t.type==="income") ? catLabel("income", t.categoryId) : (t.type==="expense") ? catLabel("expense", t.categoryId) : "Transfer";
    return `
      <div class="card glass2 stack" style="padding:12px">
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:900">${App.esc(t.date)} • ${App.esc(t.type.toUpperCase())}</div>
          <div style="font-weight:900">${sign}${App.esc(String(t.amount))} RON</div>
        </div>
        <div class="muted">${App.esc(cat)} • ${App.esc(budget.accounts.find(a=>a.id===t.accountId)?.name || "")}</div>
        <div class="muted">${App.esc(t.note||"")}</div>
        <div class="row" style="margin-top:8px">
          <button class="btn small danger" onclick="(function(){
            if(!confirm('Delete transaction?')) return;
            const db=dbLoad(); const yr=App.getYearModel(db);
            yr.budget.transactions = (yr.budget.transactions||[]).filter(x=>x.id!=='${App.esc(t.id)}');
            dbSave(db);
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          })()">Delete</button>
        </div>
      </div>
    `;
  }

  App.viewEl.innerHTML = `
    <div class="stack">
      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">Budget</div>
          <div class="muted">Pro: Accounts • Transactions • Recurring bills • RON</div>
          <div class="row" style="margin-top:10px">
            <span class="pill">${App.esc(curMonth)} income <b>${Math.round(totals.inc)}</b></span>
            <span class="pill">${App.esc(curMonth)} expense <b>${Math.round(totals.exp)}</b></span>
            <span class="pill">net <b>${Math.round(totals.net)}</b></span>
          </div>
        </div>
        ${App.heroSVG()}
      </div>

      <div class="card big stack">
        <div class="kpi" style="font-size:20px">Add transaction</div>
        <div class="grid">
          <div>
            <div class="muted">Type</div>
            <select id="txType" class="input">
              <option value="income">Income</option>
              <option value="expense" selected>Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <div class="muted">Amount (RON)</div>
            <input id="txAmount" type="number" class="input" placeholder="e.g. 250" />
          </div>
          <div>
            <div class="muted">Date</div>
            <input id="txDate" type="date" class="input" value="${App.esc(today)}" />
          </div>
          <div>
            <div class="muted">Account</div>
            <select id="txAccount" class="input">${accountOptions}</select>
          </div>

          <div id="catWrap">
            <div class="muted">Category</div>
            <select id="txCategory" class="input">${expenseCatOptions}</select>
          </div>

          <div>
            <div class="muted">Note</div>
            <input id="txNote" class="input" placeholder="optional" />
          </div>

          <div style="grid-column:1/-1">
            <button id="addTxBtn" class="btn">Add</button>
          </div>
        </div>
      </div>

      <div class="card big stack">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="kpi" style="font-size:20px">This month</div>
            <div class="muted">${App.esc(curMonth)} • ${totals.count} transactions</div>
          </div>
          <button class="btn secondary" id="addRecurringBtn">+ Recurring bill</button>
        </div>

        <div class="stack" style="gap:12px; margin-top:12px">
          ${(budget.transactions||[])
            .filter(t=>monthKey(t.date)===curMonth)
            .sort((a,b)=>b.date.localeCompare(a.date))
            .map(txRow).join("") || `<div class="muted">No transactions this month.</div>`}
        </div>
      </div>
    </div>
  `;

  // Category depends on type
  const txTypeEl = document.getElementById("txType");
  const txCatEl = document.getElementById("txCategory");
  const catWrap = document.getElementById("catWrap");
  function syncCategoryOptions(){
    const t = txTypeEl.value;
    if (t === "income") { catWrap.style.display="block"; txCatEl.innerHTML = incomeCatOptions; }
    else if (t === "expense") { catWrap.style.display="block"; txCatEl.innerHTML = expenseCatOptions; }
    else { catWrap.style.display="none"; }
  }
  txTypeEl.onchange = syncCategoryOptions;
  syncCategoryOptions();

  document.getElementById("addTxBtn").onclick = () => {
    const type = txTypeEl.value;
    const amount = Number(document.getElementById("txAmount").value);
    const date = document.getElementById("txDate").value || today;
    const accountId = document.getElementById("txAccount").value;
    const note = document.getElementById("txNote").value.trim();
    const categoryId = (type === "transfer") ? "" : (txCatEl.value || "");

    if (!Number.isFinite(amount) || amount <= 0) return alert("Amount must be > 0");

    const db = dbLoad();
    const yr = App.getYearModel(db);
    yr.budget.transactions.push({
      id: dbUid(),
      type,
      amount,
      date,
      accountId,
      categoryId,
      note,
      createdAt: today
    });
    dbSave(db);
    App.toast("Transaction added");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  document.getElementById("addRecurringBtn").onclick = () => {
    const kind = prompt("Recurring (monthly) type: income or expense?", "expense");
    if (!kind) return;
    const type = (kind.toLowerCase()==="income") ? "income" : "expense";
    const amount = Number(prompt("Amount (RON):", "100") || "0");
    if (!Number.isFinite(amount) || amount<=0) return alert("Invalid amount");
    const dayOfMonth = Number(prompt("Day of month (1-31):", "1") || "1");
    const note = prompt("Note (optional):", "Recurring") || "";

    // pick category
    let categoryId = "";
    if (type === "income") {
      categoryId = prompt("Category name (will be created if missing):", "Salary") || "";
      if (categoryId) {
        let c = yr.categories.budgetIncome.find(x=>x.name.toLowerCase()===categoryId.toLowerCase());
        if (!c) { c = { id: dbUid(), name: categoryId, archived:false }; yr.categories.budgetIncome.push(c); }
        categoryId = c.id;
      }
    } else {
      categoryId = prompt("Category name (will be created if missing):", "Rent") || "";
      if (categoryId) {
        let c = yr.categories.budgetExpense.find(x=>x.name.toLowerCase()===categoryId.toLowerCase());
        if (!c) { c = { id: dbUid(), name: categoryId, archived:false }; yr.categories.budgetExpense.push(c); }
        categoryId = c.id;
      }
    }

    const db2 = dbLoad();
    const yr2 = App.getYearModel(db2);
    yr2.budget.recurringRules.push({
      id: dbUid(),
      type,
      amount,
      accountId: yr2.budget.accounts[0]?.id || "",
      categoryId,
      note,
      schedule: { kind:"monthly", dayOfMonth: Math.max(1, Math.min(31, dayOfMonth)), interval: 1 },
      startDate: "",
      endDate: "",
      lastGeneratedThrough: ""
    });
    dbSave(db2);
    App.toast("Recurring rule added");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
};
