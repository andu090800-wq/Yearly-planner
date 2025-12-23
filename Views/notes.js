(() => {
  const fmt = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
  };

  function esc(s){ return window.App?.esc ? App.esc(s) : String(s??""); }

  function filteredNotes(db){
    const ui = db.notes.ui || {};
    const q = (ui.q || "").trim().toLowerCase();
    let list = db.notes.notes.filter(n => n.fileId === ui.fileId);

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

  function getCurrentNote(db){
    const id = db.notes.ui.noteId;
    return db.notes.notes.find(n => n.id === id) || null;
  }

  function pickFirstNote(db){
    const list = filteredNotes(db);
    db.notes.ui.noteId = list[0]?.id || "";
  }

  function ensureSelection(db){
    // dacă fileId invalid, selectează primul file din folder
    const ui = db.notes.ui;
    const folderId = ui.folderId;
    const filesInFolder = db.notes.files.filter(f => f.folderId === folderId);
    if (!filesInFolder.find(f => f.id === ui.fileId)) ui.fileId = filesInFolder[0]?.id || "";

    // dacă noteId invalid, alege prima notă
    const note = getCurrentNote(db);
    if (!note || note.fileId !== ui.fileId) pickFirstNote(db);
  }

  function addFolder(db){
    const name = prompt("Folder name:");
    if (!name) return;
    db.notes.folders.push({ id: nid("fld"), name: name.trim(), createdAt: now(), updatedAt: now() });
    db.notes.ui.folderId = db.notes.folders[db.notes.folders.length-1].id;
  }

  function addFile(db){
    const dbf = db.notes.ui.folderId;
    if (!dbf) return;
    const name = prompt("File name:");
    if (!name) return;
    const file = { id: nid("fil"), folderId: dbf, name: name.trim(), createdAt: now(), updatedAt: now() };
    db.notes.files.push(file);
    db.notes.ui.fileId = file.id;
    db.notes.ui.noteId = "";
  }

  function addNote(db){
    const fileId = db.notes.ui.fileId;
    if (!fileId) return;
    const n = {
      id: nid("note"),
      fileId,
      title: "",
      body: "",
      pinned: false,
      archived: false,
      createdAt: now(),
      updatedAt: now()
    };
    db.notes.notes.unshift(n);
    db.notes.ui.noteId = n.id;
  }

  function deleteNote(db, id){
    if (!confirm("Delete note?")) return;
    db.notes.notes = db.notes.notes.filter(n => n.id !== id);
    if (db.notes.ui.noteId === id) db.notes.ui.noteId = "";
    pickFirstNote(db);
  }

  function togglePin(db, id){
    const n = db.notes.notes.find(x => x.id === id);
    if (!n) return;
    n.pinned = !n.pinned;
    n.updatedAt = now();
  }

  function renameFolder(db, id){
    const f = db.notes.folders.find(x => x.id === id);
    if (!f) return;
    const name = prompt("Rename folder:", f.name);
    if (!name) return;
    f.name = name.trim();
    f.updatedAt = now();
  }

  function renameFile(db, id){
    const f = db.notes.files.find(x => x.id === id);
    if (!f) return;
    const name = prompt("Rename file:", f.name);
    if (!name) return;
    f.name = name.trim();
    f.updatedAt = now();
  }

  function setUI(db, patch){
    db.notes.ui = db.notes.ui || {};
    Object.assign(db.notes.ui, patch);
  }

  function renderNotes(ctx){
    const { db, App, setPrimary } = ctx;
    ensureNotesDefaults(db);
    ensureSelection(db);

    App.setCrumb("Notes");
    setPrimary("+ Note", () => { addNote(db); dbSave(db); renderNotes(ctx); });

    const ui = db.notes.ui;
    const folders = db.notes.folders;
    const files = db.notes.files.filter(f => f.folderId === ui.folderId);
    const notes = filteredNotes(db);
    const active = getCurrentNote(db);

    // Apple Notes layout: 3 columns on desktop
    App.viewEl.innerHTML = `
      <div class="anShell">
        <!-- LEFT: FOLDERS -->
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

        <!-- MIDDLE: FILES -->
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
                  <div class="anRowMeta">${db.notes.notes.filter(n=>n.fileId===f.id).length} notes</div>
                </div>
              </button>
            `).join("") || `<div class="muted tiny">No files. Create one.</div>`}
          </div>
        </aside>

        <!-- RIGHT: NOTES + EDITOR -->
        <section class="anPane anNotes">
          <div class="anNotesTop">
            <input class="input anSearch" id="anSearch" placeholder="Search" value="${esc(ui.q||"")}" />
            <div class="row">
              <button class="btn small secondary" id="anNewNote">New</button>
            </div>
          </div>

          <div class="anSplit">
            <!-- list -->
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

            <!-- editor -->
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

    // events: folders
    document.getElementById("anAddFolder").onclick = () => { addFolder(db); dbSave(db); renderNotes(ctx); };
    App.viewEl.querySelectorAll("[data-folder]").forEach(btn => {
      btn.onclick = () => {
        setUI(db, { folderId: btn.dataset.folder, fileId:"", noteId:"", q:"" });
        dbSave(db); renderNotes(ctx);
      };
      btn.oncontextmenu = (e) => { e.preventDefault(); renameFolder(db, btn.dataset.folder); dbSave(db); renderNotes(ctx); };
    });

    // events: files
    document.getElementById("anAddFile").onclick = () => { addFile(db); dbSave(db); renderNotes(ctx); };
    App.viewEl.querySelectorAll("[data-file]").forEach(btn => {
      btn.onclick = () => {
        setUI(db, { fileId: btn.dataset.file, noteId:"", q:"" });
        pickFirstNote(db);
        dbSave(db); renderNotes(ctx);
      };
      btn.oncontextmenu = (e) => { e.preventDefault(); renameFile(db, btn.dataset.file); dbSave(db); renderNotes(ctx); };
    });

    // notes list
    document.getElementById("anNewNote").onclick = () => { addNote(db); dbSave(db); renderNotes(ctx); };
    const search = document.getElementById("anSearch");
    search.oninput = () => { setUI(db, { q: search.value, noteId:"" }); pickFirstNote(db); dbSave(db); renderNotes(ctx); };

    App.viewEl.querySelectorAll("[data-note]").forEach(btn => {
      btn.onclick = () => { setUI(db, { noteId: btn.dataset.note }); dbSave(db); renderNotes(ctx); };
    });

    // editor
    if (active) {
      document.getElementById("anPin").onclick = () => { togglePin(db, active.id); dbSave(db); renderNotes(ctx); };
      document.getElementById("anDel").onclick = () => { deleteNote(db, active.id); dbSave(db); renderNotes(ctx); };

      const title = document.getElementById("anTitle");
      const body = document.getElementById("anBody");

      const save = () => {
        active.title = title.value;
        active.body = body.value;
        active.updatedAt = now();
        dbSave(db);
        // nu rerandăm la fiecare tastă, ca Apple Notes (save silent)
      };

      let t;
      const debounce = () => { clearTimeout(t); t = setTimeout(save, 220); };
      title.oninput = debounce;
      body.oninput = debounce;
    }
  }

  // expose
  window.Views = window.Views || {};
  window.Views.notes = (ctx) => renderNotes(ctx);
})();
