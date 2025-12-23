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

  // ---------- Current year helpers (FIXED) ----------
  App.getCurrentYear = (db) => {
    const list = Array.isArray(db?.yearsOrder) ? db.yearsOrder : [];
    let cy = db?.settings?.currentYear;

    if (cy == null) {
      if (!list.length) return null;

      cy = Number(list[list.length - 1]);
      db.settings = db.settings || {};
      db.settings.currentYear = cy;
      dbSave(db); // persist
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
    primaryActionBtn.textContent = label || "+ Add";
    primaryActionBtn.onclick = handler || (() => App.toast("Coming soon"));
  }

  // ---------- Active nav highlight ----------
  // Map child routes to the "main tab" you want highlighted.
  function mapToRootTab(route) {
  if (route === "goal") return "goals";

  // tot ce e "secondary" intră sub More
  if (
    route === "account" ||
    route === "settings" ||
    route === "payment" ||
    route === "notifications" ||
    route === "budget" ||        // ✅ ADD THIS
    route === "analytics"        // (opțional, dar recomand)
  ) return "more";

  return route;
}

  function setActiveNav(route) {
    const root = mapToRootTab(route);

    document.querySelectorAll(".rbLink").forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${root}`);
    });

    document.querySelectorAll(".tab").forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#/${root}`);
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

  // ---------- Router ----------
  window.addEventListener("hashchange", render);
  render();

  function render() {
    const db = dbLoad();
    const parts = App.parseHash();
    if (!parts.length) return App.navTo("#/dashboard");

    const route = parts[0];
    setActiveNav(route);

    const ctx = { db, App, setPrimary };
    const Views = window.Views || {};

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

    if (route === "habits") return Views.habits?.(ctx);
    if (route === "calendar") return Views.calendar?.(ctx);
    if (route === "budget") return Views.budget?.(ctx);
    if (route === "analytics") return Views.analytics?.(ctx);
    if (route === "notifications") return Views.notifications?.(ctx);

    if (route === "settings") return Views.settings?.(ctx);
    if (route === "more") return Views.more?.(ctx);
    if (route === "account") return Views.account?.(ctx);
    if (route === "payment") return Views.payment?.(ctx);

    App.navTo("#/dashboard");
  }
})();
