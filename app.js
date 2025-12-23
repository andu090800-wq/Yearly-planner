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

  // ---------- Pull to refresh (iOS-like, under header) ----------
  setupPullToRefresh();

  function setupPullToRefresh() {
    const header = document.querySelector(".top");
    const content = document.querySelector(".content");
    if (!header || !content) return;

    // create UI once
    let ptr = document.getElementById("ptr");
    if (!ptr) {
      ptr = document.createElement("div");
      ptr.id = "ptr";
      ptr.innerHTML = `
        <div class="ptrInner">
          <div class="ptrSpinner" aria-hidden="true"></div>
          <div class="ptrText">Pull to refresh</div>
        </div>
      `;
      // place under header, before content
      header.insertAdjacentElement("afterend", ptr);

      // Make sure it stays under header height (dynamic)
      requestAnimationFrame(() => {
        const h = header.getBoundingClientRect().height || 56;
        ptr.style.top = `${Math.round(h)}px`;
      });
      window.addEventListener("resize", () => {
        const h = header.getBoundingClientRect().height || 56;
        ptr.style.top = `${Math.round(h)}px`;
      });
    }

    const txt = ptr.querySelector(".ptrText");

    const THRESH = 72;        // px to trigger "release"
    const MAX_PULL = 110;     // max visual pull
    const RESIST = 0.55;      // resistance

    let startY = 0;
    let pulling = false;
    let armed = false;
    let refreshing = false;

    const haptic = (type = "light") => {
      try {
        if (navigator.vibrate) navigator.vibrate(type === "heavy" ? 18 : 10);
      } catch {}
    };

    const setPull = (px) => {
      ptr.style.setProperty("--ptrY", `${px}px`);
      ptr.style.setProperty("--ptrOpacity", `${Math.min(1, px / 28)}`);
    };

    const reset = () => {
      pulling = false;
      armed = false;
      ptr.classList.remove("ptrArmed", "ptrRefreshing", "ptrPulling");
      setPull(0);
      txt.textContent = "Pull to refresh";
    };

    const doRefresh = () => {
      if (refreshing) return;
      refreshing = true;

      ptr.classList.add("ptrRefreshing");
      txt.textContent = "Refreshing…";
      haptic("heavy");

      // NU atinge localStorage / DB. Doar reîncarcă UI + prinde update-uri PWA.
      try { render(); } catch {}

      setTimeout(() => location.reload(), 350);
    };

    const atTop = () => (document.scrollingElement?.scrollTop || 0) <= 0;

    window.addEventListener("touchstart", (e) => {
      if (refreshing) return;
      if (!atTop()) return;

      pulling = true;
      armed = false;
      startY = e.touches[0].clientY;
      ptr.classList.add("ptrPulling");
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!pulling || refreshing) return;

      const y = e.touches[0].clientY;
      let dy = (y - startY);

      if (dy <= 0) {
        reset();
        return;
      }

      // prevent iOS rubber band while pulling
      if (atTop()) e.preventDefault();

      dy = Math.min(MAX_PULL, dy * RESIST);
      setPull(dy);

      const nowArmed = dy >= THRESH;
      if (nowArmed && !armed) {
        armed = true;
        ptr.classList.add("ptrArmed");
        txt.textContent = "Release to refresh";
        haptic("light");
      } else if (!nowArmed && armed) {
        armed = false;
        ptr.classList.remove("ptrArmed");
        txt.textContent = "Pull to refresh";
      }
    }, { passive: false });

    window.addEventListener("touchend", () => {
      if (!pulling || refreshing) return;

      ptr.classList.remove("ptrPulling");

      if (armed) {
        setPull(THRESH);
        doRefresh();
      } else {
        reset();
      }
    }, { passive: true });

    window.addEventListener("touchcancel", () => {
      if (!pulling || refreshing) return;
      reset();
    }, { passive: true });

    window.addEventListener("pageshow", () => {
      refreshing = false;
      reset();
    });
  }

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
