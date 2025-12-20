// app.js (FINAL): router + shared helpers. All screens live in /views/*.js
(() => {
  const view = document.getElementById("view");
  const crumb = document.getElementById("crumb");
  const primaryActionBtn = document.getElementById("primaryActionBtn");
  const toastEl = document.getElementById("toast");

  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const wipeBtn = document.getElementById("wipeBtn");

  // ---------- Shared App object ----------
  const App = (window.App = window.App || {});
  App.viewEl = view;

  App.setCrumb = (t) => { crumb.textContent = t || ""; };
  App.navTo = (h) => { location.hash = h; };

  App.toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
  };

  App.esc = (s) => String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");

  App.parseHash = () => {
    const h = (location.hash || "#/dashboard").replace(/^#/, "");
    return h.split("/").filter(Boolean);
  };

  App.heroSVG = () => `
    <svg class="heroArt" viewBox="0 0 220 140" aria-hidden="true">
      <rect x="10" y="14" width="200" height="112" rx="22" fill="rgba(0,0,0,.06)"/>
      <rect x="26" y="34" width="86" height="10" rx="6" fill="rgba(0,0,0,.18)"/>
      <rect x="26" y="56" width="150" height="10" rx="6" fill="rgba(0,0,0,.10)"/>
      <rect x="26" y="78" width="120" height="10" rx="6" fill="rgba(0,0,0,.10)"/>
      <path d="M30 110 C56 84, 78 124, 108 92 C132 68, 156 84, 188 56"
            fill="none" stroke="black" stroke-width="5" stroke-linecap="round"/>
      <circle cx="30" cy="110" r="6" fill="black"/>
      <circle cx="108" cy="92" r="6" fill="black"/>
      <circle cx="188" cy="56" r="6" fill="black"/>
    </svg>`;

  // Current year helpers
  App.getCurrentYear = (db) => {
    const y = Number(db?.settings?.currentYear ?? 2026);
    dbEnsureYear(db, y);
    return y;
  };
  App.getYearModel = (db) => {
    const y = App.getCurrentYear(db);
    return dbEnsureYear(db, y);
  };

  // ---------- Primary action wiring ----------
  function setPrimary(label, handler) {
    primaryActionBtn.textContent = label || "+ Add";
    primaryActionBtn.onclick = handler || (() => App.toast("Coming soon"));
  }

  // ---------- Active nav highlight ----------
  function setActiveNav(route) {
    document.querySelectorAll(".rbLink").forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${route}`);
    });
    document.querySelectorAll(".tab").forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${route}`);
    });
  }

  // ---------- Data actions ----------
  exportBtn.onclick = () => {
    const db = dbLoad();
    const blob = new Blob([dbExport(db)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plans-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  importBtn.onclick = () => importFile.click();
  importFile.onchange = () => {
    const f = importFile.files?.[0];
    if (!f) return;

    const r = new FileReader();
    r.onload = () => {
      try {
        const imported = dbImport(String(r.result || ""));
        localStorage.setItem(DB_KEY, JSON.stringify(imported));
        App.toast("Imported");
        App.navTo("#/dashboard");
        render();
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    r.readAsText(f);
    importFile.value = "";
  };

  wipeBtn.onclick = () => {
    if (!confirm("Delete ALL local data on this device?")) return;
    localStorage.removeItem(DB_KEY);
    App.toast("Wiped");
    App.navTo("#/dashboard");
    render();
  };

  // ---------- Placeholder view ----------
  function renderPlaceholder(ctx, title, subtitle) {
    const { db } = ctx;
    App.setCrumb(title);
    setPrimary("+ Add", () => App.toast("Coming soon"));

    const y = App.getCurrentYear(db);
    view.innerHTML = `
      <div class="card big hero">
        <div class="heroGlow"></div>
        <div>
          <div class="kpi">${App.esc(title)}</div>
          <div class="muted">${App.esc(subtitle || "This screen will be built in the next stages.")}</div>
          <div class="row" style="margin-top:10px">
            <span class="pill">Year <b>${App.esc(String(y))}</b></span>
            <span class="pill">Currency <b>${App.esc(db.settings.currency)}</b></span>
            <span class="pill">Week starts <b>Monday</b></span>
            <span class="pill">Today <b>${App.esc(dbTodayISO())}</b></span>
          </div>
        </div>
        ${App.heroSVG()}
      </div>
    `;
  }

  // ---------- Router ----------
  window.addEventListener("hashchange", render);
  render();

  function render() {
    const db = dbLoad();
    const parts = App.parseHash();
    if (!parts.length) return App.navTo("#/dashboard");

    const route = parts[0];
    setActiveNav(route);

    // ctx passed to views
    const ctx = { db, App, setPrimary };

    // Views registry
    const Views = window.Views || {};

    // Dispatch
    if (route === "dashboard") return Views.dashboard?.(ctx);

    if (route === "year" && parts[1]) {
      ctx.year = Number(parts[1]);
      return Views.yearHome?.(ctx);
    }

    if (route === "goals") return Views.goals?.(ctx);

    if (route === "goal" && parts[1]) {
      ctx.goalId = parts[1];
      return Views.goalDetail?.(ctx);
    }

    // Settings / More can be real later; for now placeholders are OK
    if (route === "settings") return renderPlaceholder(ctx, "Settings", "Will include year switch + preferences.");
    if (route === "more") return renderPlaceholder(ctx, "More", "Mobile quick links will live here.");

    // Future modules placeholders
    if (route === "calendar") return renderPlaceholder(ctx, "Calendar", "Weekly/Monthly/Yearly + filters (Etapa 3/4).");
    if (route === "habits") return renderPlaceholder(ctx, "Habits", "Recurrence + streaks + heatmap (Etapa 3).");
    if (route === "budget") return renderPlaceholder(ctx, "Budget", "Accounts + transactions + recurring bills (Etapa 5).");
    if (route === "analytics") return renderPlaceholder(ctx, "Analytics", "Charts for goals/habits/budget (Etapa 5+).");

    if (route === "account") return renderPlaceholder(ctx, "Account", "Local-only app (for now).");
    if (route === "notifications") return renderPlaceholder(ctx, "Notifications", "In-app only (Etapa 4).");
    if (route === "payment") return renderPlaceholder(ctx, "Payment method", "Placeholder (no payments in v1).");

    // Unknown route
    App.navTo("#/dashboard");
  }
})();
