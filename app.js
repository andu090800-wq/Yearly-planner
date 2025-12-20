const $ = (id) => document.getElementById(id);

const monthsDiv = $("months");
const yearSel = $("year");
const titleIn = $("title");
const dateIn = $("date");
const notesIn = $("notes");
const addBtn = $("addBtn");
const statusEl = $("status");
const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const importFile = $("importFile");
const wipeBtn = $("wipeBtn");

const STORAGE_KEY = "yearly_planner_v1";

const MONTHS_RO = [
  "Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie",
  "Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"
];

function nowYear() {
  return new Date().getFullYear();
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getYearData(year) {
  const all = loadAll();
  return all[String(year)] || [];
}

function setYearData(year, events) {
  const all = loadAll();
  all[String(year)] = events;
  saveAll(all);
}

function uid() {
  return (crypto.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2)));
}

function fmtDate(iso) {
  // iso: YYYY-MM-DD
  const [y,m,d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2,"0")}.${String(m).padStart(2,"0")}.${y}`;
}

function monthIndexFromISO(iso) {
  const parts = iso.split("-");
  return Math.max(0, Math.min(11, (Number(parts[1]) || 1) - 1));
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function renderYearOptions() {
  const y = nowYear();
  const years = [y-1, y, y+1, y+2, y+3];
  yearSel.innerHTML = "";
  for (const yy of years) {
    const opt = document.createElement("option");
    opt.value = String(yy);
    opt.textContent = String(yy);
    if (yy === y) opt.selected = true;
    yearSel.appendChild(opt);
  }
}

function renderMonths() {
  const year = Number(yearSel.value);
  const events = getYearData(year)
    .slice()
    .sort((a,b) => (a.date > b.date ? 1 : -1));

  monthsDiv.innerHTML = "";

  for (let m = 0; m < 12; m++) {
    const box = document.createElement("div");
    box.className = "month";

    const header = document.createElement("div");
    header.className = "row";
    header.style.justifyContent = "space-between";

    const h2 = document.createElement("h2");
    h2.textContent = MONTHS_RO[m];

    const count = events.filter(e => monthIndexFromISO(e.date) === m).length;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = `${count} evenimente`;

    header.appendChild(h2);
    header.appendChild(pill);

    const list = document.createElement("div");
    list.className = "events";

    const evs = events.filter(e => monthIndexFromISO(e.date) === m);
    if (!evs.length) {
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "—";
      list.appendChild(p);
    } else {
      for (const e of evs) list.appendChild(renderEvent(e));
    }

    box.appendChild(header);
    box.appendChild(list);
    monthsDiv.appendChild(box);
  }
}

function renderEvent(e) {
  const div = document.createElement("div");
  div.className = "event";

  const top = document.createElement("div");
  top.className = "top";

  const left = document.createElement("div");
  const t = document.createElement("div");
  t.className = "title";
  t.textContent = e.title || "(fără titlu)";
  const d = document.createElement("div");
  d.className = "date";
  d.textContent = fmtDate(e.date);

  left.appendChild(t);
  left.appendChild(d);

  const right = document.createElement("div");
  right.className = "row";
  right.style.justifyContent = "flex-end";

  const edit = document.createElement("button");
  edit.className = "secondary";
  edit.textContent = "Editează";
  edit.onclick = () => startEdit(e.id);

  const del = document.createElement("button");
  del.className = "danger";
  del.textContent = "Șterge";
  del.onclick = () => deleteEvent(e.id);

  right.appendChild(edit);
  right.appendChild(del);

  top.appendChild(left);
  top.appendChild(right);

  div.appendChild(top);

  if (e.notes?.trim()) {
    const n = document.createElement("div");
    n.className = "notes";
    n.textContent = e.notes;
    div.appendChild(n);
  }

  return div;
}

let editingId = null;

function addOrUpdate() {
  const year = Number(yearSel.value);
  const title = titleIn.value.trim();
  const date = dateIn.value;
  const notes = notesIn.value.trim();

  if (!date) {
    setStatus("Alege o dată.");
    return;
  }

  const events = getYearData(year);

  if (editingId) {
    const idx = events.findIndex(e => e.id === editingId);
    if (idx >= 0) {
      events[idx] = { ...events[idx], title, date, notes };
      setYearData(year, events);
      setStatus("Eveniment actualizat.");
    }
    editingId = null;
    addBtn.textContent = "Adaugă";
  } else {
    events.push({ id: uid(), title, date, notes });
    setYearData(year, events);
    setStatus("Eveniment adăugat.");
  }

  titleIn.value = "";
  notesIn.value = "";
  dateIn.value = "";
  renderMonths();
}

function startEdit(id) {
  const year = Number(yearSel.value);
  const events = getYearData(year);
  const e = events.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  titleIn.value = e.title || "";
  dateIn.value = e.date || "";
  notesIn.value = e.notes || "";
  addBtn.textContent = "Salvează";
  setStatus("Editezi un eveniment. Apasă “Salvează”.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteEvent(id) {
  const year = Number(yearSel.value);
  const events = getYearData(year).filter(e => e.id !== id);
  setYearData(year, events);
  setStatus("Eveniment șters.");
  renderMonths();
}

function exportJSON() {
  const all = loadAll();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "yearly-planner-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (typeof parsed !== "object" || parsed === null) throw new Error("JSON invalid");
      saveAll(parsed);
      setStatus("Import reușit.");
      renderMonths();
    } catch (e) {
      setStatus("Import eșuat: " + e.message);
    }
  };
  reader.readAsText(file);
}

function wipeAll() {
  if (!confirm("Sigur vrei să ștergi TOT?")) return;
  localStorage.removeItem(STORAGE_KEY);
  setStatus("Șters.");
  renderMonths();
}

addBtn.onclick = addOrUpdate;
yearSel.onchange = () => { editingId = null; addBtn.textContent = "Adaugă"; renderMonths(); };

exportBtn.onclick = exportJSON;
importBtn.onclick = () => importFile.click();
importFile.onchange = () => {
  const f = importFile.files?.[0];
  if (f) importJSON(f);
  importFile.value = "";
};
wipeBtn.onclick = wipeAll;

renderYearOptions();
renderMonths();
