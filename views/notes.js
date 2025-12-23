(() => {
  const fmt = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
  };

  function esc(s){ return window.App?.esc ? App.esc(s) : String(s??""); }

  // local helpers (no more missing nid/now)
  const now = () => (typeof dbNowMs === "function" ? dbNowMs() : Date.now());
  const nid = (_prefix="id") => (typeof dbUid === "function" ? dbUid() : (Date.now()+"-"+Math.random().toString(16).slice(2)));

  function ensureNotesModel(yr){
    if (yr.notes && typeof yr.notes === "object" && !Array.isArray(yr.notes)) return;

    // ultra-safe fallback (in case something bypassed normalize)
    const t = now();
    const folderId = nid("fld");
    const fileId = nid("fil");

    yr.notes = {
      folders: [{ id: folderId, name: "iCloud", createdAt: t, updatedAt: t }],
      files:   [{ id: fileId, folderId, name: "Notes", createdAt: t, updatedAt: t }],
      notes:   [],
      ui: { folderId, fileId, noteId: "", q: "" }
    };
  }

  function filteredNotes(yr){
    const ui = yr.notes.ui || {};
    const q = (ui.q || "").trim().toLowerCase();
    let list = (yr.notes.notes || []).filter(n => n.fileId === ui.fileId);

    // pinned first, then updatedAt desc
    list.sort((a,b) => (b.pinned|0)-(a.pinned|0) || (b.updatedAt||0)-(a.updatedAt||0));

    if (q) {
      list = list.filter(n =>
        (n.title||"").toLowerCase().includes(q) ||
        (n.body||"").toLowerCase().includes(q)
      );
    }
    return list;
  }

  function getCurrentNote(yr){
    const id = yr.notes.ui?.noteId;
    return (yr.notes.notes || []).find(n => n.id === id) || null;
  }

  function pickFirstNote(yr){
    const list = filteredNotes(yr);
    yr.notes.ui.noteId = list[0]?.id || "";
  }

  function ensureSelection(yr){
    const ui = yr.notes.ui || (yr.notes.ui = { folderId:"", fileId:"", noteId:"", q:"" });

    // folder
    const folders = yr.notes.folders || (yr.notes.folders = []);
    const files   = yr.notes.files   || (yr.notes.files = []);
    const notes   = yr.notes.notes   || (yr.notes.notes = []);

    const folderIds = new Set(folders.map(f => f.id));
    if (!folderIds.has(ui.folderId)) ui.folderId = folders[0]?.id || "";

    // file in folder
    const filesInFolder = files.filter(f => f.folderId === ui.folderId);
    const fileIds = new Set(filesInFolder.map(f => f.id));
    if (!fileIds.has(ui.fileId)) ui.fileId = filesInFolder[0]?.id || "";

    // note in file
    const note = getCurrentNote(yr);
    if (!note || note.fileId !== ui.fileId) pickFirstNote(yr);

    // if there are no files yet, clear selection safely
    if (!ui.fileId) ui.noteId = "";
  }

  function addFolder(yr){
    const name = prompt("Folder name:");
    if (!name) return;
    const t = now();
    const id = nid("fld");
    yr.notes.folders.push({ id, name: name.trim(), createdAt: t, updatedAt: t });
    yr.notes.ui.folderId = id;
    // reset file selection -> will be fixed by ensureSelection after render
    yr.notes.ui.fileId = "";
    yr.notes.ui.noteId = "";
  }

  function addFile(yr){
    const folderId = yr.notes.ui.folderId;
    if (!folderId) return;
    const name = prompt("File name:");
    if (!name) return;
    const t = now();
    const file = { id: nid("fil"), folderId, name: name.trim(), createdAt: t, updatedAt: t };
    yr.notes.files.push(file);
    yr.notes.ui.fileId = file.id;
    yr.notes.ui.noteId = "";
  }

  function addNote(yr){
    const fileId = yr.notes.ui.fileId;
    if (!fileId) return;
    const t = now();
    const n = {
      id: nid("note"),
      fileId,
      title: "",
      body: "",
      pinned: false,
      archived: false,
      createdAt: t,
      updatedAt: t
    };
    yr.notes.notes.unshift(n);
    yr.notes.ui.noteId = n.id;
  }

  function deleteNote(yr, id){
    if (!confirm("Delete note?")) return;
    yr.notes.notes = (yr.notes.notes || []).filter(n => n.id !== id);
    if (yr.notes.ui.noteId === id) yr.notes.ui.noteId = "";
    pickFirstNote(yr);
  }

  function togglePin(yr, id){
    const n = (yr.notes.notes || []).find(x => x.id === id);
    if (!n) return;
    n.pinned = !n.pinned;
    n.updatedAt = now();
  }

  function renameFolder(yr, id){
    const f = (yr.notes.folders || []).find(x => x.id === id);
    if (!f) return;
    const name = prompt("Rename folder:", f.name);
    if (!name) return;
    f.name = name.trim();
    f.updatedAt = now();
  }

  function renameFile(yr, id){
    const f = (yr.notes.files || []).find(x => x.id === id);
    if (!f) return;
    const name = prompt("Rename file:", f.name);
    if (!name) return;
    f.name = name.trim();
    f.updatedAt = now();
  }

  function setUI(yr, patch){
    yr.notes.ui = yr.notes.ui || {};
    Object.assign(yr.notes.ui, patch);
  }

  function renderNotes(ctx){
    const { db, App, setPrimary } = ctx;

    const yr = App.getYearModel(db);
    if (!yr){
      App.setCrumb("Notes");
      setPrimary("+ Note", () => App.toast("Create a year first"));
      App.viewEl.innerHTML = `<div class="card big muted">Create/select a year first.</div>`;
      return;
    }

    ensureNotesModel(yr);
    ensureSelection(yr);

    App.setCrumb("Notes");
    setPrimary("+ Note", () => { addNote(yr); dbSave(db); renderNotes(ctx); });

    const ui = yr.notes.ui;
    const folders = yr.notes.folders;
    const files = yr.notes.files.filter(f => f.folderId === ui.folderId);
    const notes = filteredNotes(yr);
    const active = getCurrentNote(yr);

    App.viewEl.innerHTML = `
      <div class="anShell">
        <aside class="anPane anFolders">
          <div class="anPaneTop">
            <div class="anPaneTitle">Folders</div>
            <button class="btn small secondary" id="anAddFolder">+</button>
          </div>
          <div class="anList">
            ${folders.map(f => `
              <button class="anRow ${f.id===ui.folderId ? "on":""}" data-folder="${esc(f.id)}">
                <div class="anRowMain">
                  <div class="anRowTitle">${esc(f.name)}</div>
                </div>
              </button>
            `).join("")}
          </div>
        </aside>

        <aside class="anPane anFiles">
          <div class="anPaneTop">
            <div class="anPaneTitle">Files</div>
            <button class="btn small secondary" id="anAddFile">+</button>
          </div>
          <div class="anList">
            ${files.map(f => `
              <button class="anRow ${f.id===ui.fileId ? "on":""}" data-file="${esc(f.id)}">
                <div class="anRowMain">
                  <div class="anRowTitle">${esc(f.name)}</div>
                  <div class="anRowMeta">${(yr.notes.notes||[]).filter(n=>n.fileId===f.id).length} notes</div>
                </div>
              </button>
            `).join("") || `<div class="muted tiny">No files. Create one.</div>`}
          </div>
        </aside>

        <section class="anPane anNotes">
          <div class="anNotesTop">
            <input class="input anSearch" id="anSearch" placeholder="Search" value="${esc(ui.q||"")}" />
            <div class="row">
              <button class="btn small secondary" id="anNewNote">New</button>
            </div>
          </div>

          <div class="anSplit">
            <div class="anNoteList">
              ${notes.map(n => `
                <button class="anNoteCard ${n.id===ui.noteId ? "on":""}" data-note="${esc(n.id)}">
                  <div class="anNoteTitle">
                    ${n.pinned ? "📌 " : ""}${esc((n.title||"").trim() || "New Note")}
                  </div>
                  <div class="anNotePreview">${esc((n.body||"").trim().slice(0,120))}</div>
                  <div class="anNoteMeta">${fmt(n.updatedAt || n.createdAt)}</div>
                </button>
              `).join("") || `<div class="muted tiny">No notes in this file.</div>`}
            </div>

            <div class="anEditor">
              ${active ? `
                <div class="anEditorTop">
                  <div class="row">
                    <button class="btn small secondary" id="anPin">${active.pinned ? "Unpin" : "Pin"}</button>
                    <button class="btn small danger" id="anDel">Delete</button>
                  </div>
                </div>
                <input class="input anTitle" id="anTitle" placeholder="Title" value="${esc(active.title||"")}" />
                <textarea class="input anBody" id="anBody" placeholder="Note">${esc(active.body||"")}</textarea>
                <div class="muted tiny">Autosave</div>
              ` : `
                <div class="muted">Select a note or create one.</div>
              `}
            </div>
          </div>
        </section>
      </div>
    `;

    // folders
    document.getElementById("anAddFolder").onclick = () => { addFolder(yr); dbSave(db); renderNotes(ctx); };
    App.viewEl.querySelectorAll("[data-folder]").forEach(btn => {
      btn.onclick = () => {
        setUI(yr, { folderId: btn.dataset.folder, fileId:"", noteId:"", q:"" });
        dbSave(db); renderNotes(ctx);
      };
      btn.oncontextmenu = (e) => { e.preventDefault(); renameFolder(yr, btn.dataset.folder); dbSave(db); renderNotes(ctx); };
    });

    // files
    document.getElementById("anAddFile").onclick = () => { addFile(yr); dbSave(db); renderNotes(ctx); };
    App.viewEl.querySelectorAll("[data-file]").forEach(btn => {
      btn.onclick = () => {
        setUI(yr, { fileId: btn.dataset.file, noteId:"", q:"" });
        pickFirstNote(yr);
        dbSave(db); renderNotes(ctx);
      };
      btn.oncontextmenu = (e) => { e.preventDefault(); renameFile(yr, btn.dataset.file); dbSave(db); renderNotes(ctx); };
    });

    // notes list
    document.getElementById("anNewNote").onclick = () => { addNote(yr); dbSave(db); renderNotes(ctx); };
    const search = document.getElementById("anSearch");
    search.oninput = () => { setUI(yr, { q: search.value, noteId:"" }); pickFirstNote(yr); dbSave(db); renderNotes(ctx); };

    App.viewEl.querySelectorAll("[data-note]").forEach(btn => {
      btn.onclick = () => { setUI(yr, { noteId: btn.dataset.note }); dbSave(db); renderNotes(ctx); };
    });

    // editor
    if (active) {
      document.getElementById("anPin").onclick = () => { togglePin(yr, active.id); dbSave(db); renderNotes(ctx); };
      document.getElementById("anDel").onclick = () => { deleteNote(yr, active.id); dbSave(db); renderNotes(ctx); };

      const title = document.getElementById("anTitle");
      const body = document.getElementById("anBody");

      const save = () => {
        active.title = title.value;
        active.body = body.value;
        active.updatedAt = now();
        dbSave(db);
      };

      let t;
      const debounce = () => { clearTimeout(t); t = setTimeout(save, 220); };
      title.oninput = debounce;
      body.oninput = debounce;
    }
  }

  window.Views = window.Views || {};
  window.Views.notes = (ctx) => renderNotes(ctx);
})();
