// app.js (FINAL): router + shared helpers + pull-to-refresh (under header)
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

    // Tot ce e "secondary" intră sub More (inclusiv budget/analytics dacă vrei)
    if (
      route === "account" ||
      route === "settings" ||
      route === "payment" ||
      route === "notifications" ||
      route === "budget" ||        // ✅
      route === "analytics"        // ✅
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

// =========================
// Pull-to-Refresh (under header, iOS-like)
// =========================
(function setupPullToRefresh(){
  const topBar = document.querySelector(".top");
  const content = document.querySelector(".content");

  // build indicator (under header)
  const ptr = document.createElement("div");
  ptr.id = "ptr";
  ptr.innerHTML = `
    <div class="ptrInner">
      <div class="ptrSpinner"></div>
      <div class="ptrText">Pull to refresh</div>
    </div>
  `;
  document.body.appendChild(ptr);

  const txt = ptr.querySelector(".ptrText");

  // helper: set fixed top = header height
  function syncPtrTop(){
    const topH = (topBar?.offsetHeight || 0);
    document.documentElement.style.setProperty("--ptrTop", topH + "px");
  }
  syncPtrTop();
  window.addEventListener("resize", syncPtrTop);

  // state
  let startY = 0;
  let pulling = false;
  let armed = false;
  let refreshing = false;

  const THRESH = 70; // px

  function setY(y){
    document.documentElement.style.setProperty("--ptrY", y + "px");
    document.documentElement.style.setProperty("--ptrOpacity", y > 0 ? "1" : "0");
  }

  function haptic(){
    // haptic where possible
    try { navigator.vibrate?.(10); } catch {}
  }

  async function doRefresh(){
    if (refreshing) return;
    refreshing = true;

    ptr.classList.remove("ptrPulling","ptrArmed");
    ptr.classList.add("ptrRefreshing");
    txt.textContent = "Refreshing…";

    // keep it visible while refreshing
    setY(52);

    // refresh app shell / views
    // (you can customize: render(), location.reload(), etc.)
    try {
      // safest: re-render current route
      if (typeof render === "function") render();
      else location.reload();
    } finally {
      // small delay so it feels real
      setTimeout(() => {
        ptr.classList.remove("ptrRefreshing");
        setY(0);
        txt.textContent = "Pull to refresh";
        refreshing = false;
      }, 450);
    }
  }

  // touch handling (works in iOS PWA)
  content.addEventListener("touchstart", (e) => {
    if (refreshing) return;
    if (window.scrollY > 0) return;     // only at top
    if (content.scrollTop > 0) return;  // if content is scroll container
    startY = e.touches[0].clientY;
    pulling = true;
    armed = false;

    syncPtrTop();
    ptr.classList.add("ptrPulling");
  }, { passive: true });

  content.addEventListener("touchmove", (e) => {
    if (!pulling || refreshing) return;
    if (window.scrollY > 0) return;

    const y = e.touches[0].clientY;
    let dy = y - startY;
    if (dy < 0) dy = 0;

    // resistance
    dy = Math.min(120, dy * 0.75);

    setY(dy);

    if (dy >= THRESH && !armed){
      armed = true;
      ptr.classList.add("ptrArmed");
      txt.textContent = "Release to refresh";
      haptic();
    } else if (dy < THRESH && armed){
      armed = false;
      ptr.classList.remove("ptrArmed");
      txt.textContent = "Pull to refresh";
    }

    // prevent safari rubber-band while we show our own PTR
    if (dy > 0) e.preventDefault();
  }, { passive: false });

  content.addEventListener("touchend", () => {
    if (!pulling || refreshing) return;
    pulling = false;
    ptr.classList.remove("ptrPulling");

    if (armed){
      doRefresh();
    } else {
      setY(0);
    }
  }, { passive: true });
})();
