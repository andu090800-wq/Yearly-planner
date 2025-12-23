// app.js — router + shared helpers (SAFE + resilient)
(() => {
  // ---------- DOM ----------
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

  App.setCrumb = (t) => { if (crumb) crumb.textContent = t || ""; };
  App.navTo = (h) => { location.hash = h; };

  App.toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = String(msg || "");
    toastEl.classList.remove("hidden");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
  };

  App.esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  App.parseHash = () => {
    const h = (location.hash || "#/dashboard").replace(/^#/, "");
    return h.split("/").filter(Boolean);
  };

  // ✅ FIX: views expect this; without it, navigation breaks
  App.heroSVG = () => "";

  // ---------- Current year helpers ----------
  App.getCurrentYear = (db) => {
    const list = Array.isArray(db?.yearsOrder) ? db.yearsOrder : [];
    let cy = db?.settings?.currentYear;

    if (cy == null) {
      if (!list.length) return null;
      cy = Number(list[list.length - 1]);
      db.settings = db.settings || {};
      db.settings.currentYear = cy;
      dbSave(db);
    }

    const y = Number(cy);
    dbEnsureYear(db, y);
    return y;
  };

  App.getYearModel = (db) => {
    const y = App.getCurrentYear(db);
    if (y == null) return null;
    return dbEnsureYear(db, y);
  };

  // ---------- Primary action wiring ----------
  function setPrimary(label, handler) {
    if (!primaryActionBtn) return;
    primaryActionBtn.textContent = label || "+ Add";
    primaryActionBtn.onclick = typeof handler === "function"
      ? handler
      : (() => App.toast("Coming soon"));
  }

  // ---------- Active nav highlight ----------
  function mapToRootTab(route) {
    // detail routes should highlight parent tab
    if (route === "goal") return "goals";
    if (route === "year") return "dashboard";
    return route;
  }

  function setActiveNav(route) {
    const root = mapToRootTab(route);

    document.querySelectorAll(".rbLink").forEach((a) => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${root}`);
    });

    document.querySelectorAll(".tab").forEach((a) => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${root}`);
    });
  }

  // ---------- Data actions ----------
  if (exportBtn) {
    exportBtn.onclick = () => {
      try {
        const db = dbLoad();
        const blob = new Blob([dbExport(db)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "plans-backup.json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert("Export failed: " + (e?.message || e));
      }
    };
  }

  if (importBtn && importFile) {
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
          alert("Import failed: " + (e?.message || e));
        }
      };
      r.readAsText(f);
      importFile.value = "";
    };
  }

  if (wipeBtn) {
    wipeBtn.onclick = () => {
      if (!confirm("Delete ALL local data on this device?")) return;
      localStorage.removeItem(DB_KEY);
      App.toast("Wiped");
      App.navTo("#/dashboard");
      render();
    };
  }

  // ---------- Router ----------
  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", render);
  render();

  function safeCallView(fn, ctx) {
    try {
      return fn?.(ctx);
    } catch (e) {
      console.error("View crashed:", e);
      App.setCrumb("Error");
      setPrimary("+ Add", () => App.toast("Coming soon"));
      App.viewEl.innerHTML = `
        <div class="card big stack">
          <div class="kpi" style="font-size:20px">Something crashed</div>
          <div class="muted">Open DevTools → Console for details.</div>
          <div class="row" style="margin-top:10px">
            <button class="btn" id="goDashBtn">Go to Dashboard</button>
          </div>
        </div>
      `;
      document.getElementById("goDashBtn").onclick = () => App.navTo("#/dashboard");
    }
  }

  function render() {
    const db = dbLoad();
    const parts = App.parseHash();
    if (!parts.length) return App.navTo("#/dashboard");

    const route = parts[0];
    setActiveNav(route);

    const ctx = { db, App, setPrimary };
    const Views = window.Views || {};

    if (route === "dashboard") return safeCallView(Views.dashboard, ctx);

    if (route === "year" && parts[1]) {
      ctx.year = Number(parts[1]);
      return safeCallView(Views.yearHome, ctx);
    }

    if (route === "calendar") return safeCallView(Views.calendar, ctx);

    if (route === "goals") return safeCallView(Views.goals, ctx);
    if (route === "goal" && parts[1]) {
      ctx.goalId = String(parts[1]);
      return safeCallView(Views.goalDetail, ctx);
    }

    if (route === "habits") return safeCallView(Views.habits, ctx);
    if (route === "notes") return safeCallView(Views.notes, ctx);

    if (route === "analytics") return safeCallView(Views.analytics, ctx);
    if (route === "budget") return safeCallView(Views.budget, ctx);

    if (route === "notifications") return safeCallView(Views.notifications, ctx);
    if (route === "settings") return safeCallView(Views.settings, ctx);
    if (route === "more") return safeCallView(Views.more, ctx);
    if (route === "account") return safeCallView(Views.account, ctx);
    if (route === "payment") return safeCallView(Views.payment, ctx);

    App.navTo("#/dashboard");
  }
})();
