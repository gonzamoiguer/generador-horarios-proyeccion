import { formatDuration, parseDuration, formatClock, parseClock, naturalCompare } from './time.js';
import { collectFromDataTransfer, isVideoFile, readDuration } from './files.js';
import { buildCsv } from './csv.js';
import { buildM3u, pathInFolder } from './playlist.js';

const STORAGE_KEY = 'grilla-proyeccion:v2';

let nextId = 1;
const newId = () => `i${Date.now().toString(36)}${(nextId++).toString(36)}`;

function makeTab(name) {
  return { id: newId(), name, items: [], startTime: '18:00:00', sepDuration: 300 };
}

const state = {
  tabs: [],
  activeTab: null,
  csvSep: 'tab',
};

const cur = () => state.tabs.find((t) => t.id === state.activeTab) || state.tabs[0];

const $ = (sel) => document.querySelector(sel);
const rowsEl = $('#rows');
const totalsEl = $('#totals');
const emptyEl = $('#empty');
const statusEl = $('#status');
const startInput = $('#start-time');
const sepDurInput = $('#sep-duration');
const csvSepSelect = $('#separator-char');
const dropzone = $('#dropzone');
const tabsEl = $('#tabs');

/* ---------- Persistencia (localStorage) ---------- */

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}

function saveNow() {
  try {
    const data = JSON.stringify(state, (key, value) => (key === 'file' || key === 'loading' ? undefined : value));
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    /* sin almacenamiento disponible */
  }
}
window.addEventListener('pagehide', saveNow);

// Si la herramienta está abierta en otra pestaña del navegador, se toma su versión.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  if (cur().items.some((it) => it.loading)) return;
  clearTimeout(saveTimer);
  state.tabs = [];
  load();
  csvSepSelect.value = state.csvSep;
  renderAll();
});

function sanitizeTab(t) {
  const tab = makeTab(typeof t?.name === 'string' && t.name.trim() ? t.name : 'Proyección');
  if (typeof t?.id === 'string') tab.id = t.id;
  if (Array.isArray(t?.items)) {
    tab.items = t.items
      .filter((it) => it && (it.type === 'video' || it.type === 'separator') && typeof it.id === 'string')
      .map((it) => ({
        id: it.id,
        type: it.type,
        name: String(it.name ?? ''),
        fileName: typeof it.fileName === 'string' ? it.fileName : it.type === 'video' ? String(it.name ?? '') : '',
        path: typeof it.path === 'string' ? it.path : undefined,
        duration: Number.isFinite(it.duration) ? it.duration : it.type === 'separator' ? 0 : null,
      }));
  }
  if (typeof t?.startTime === 'string' && parseClock(t.startTime) != null) tab.startTime = t.startTime;
  if (Number.isFinite(t?.sepDuration)) tab.sepDuration = t.sepDuration;
  return tab;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (data && Array.isArray(data.tabs)) {
      state.tabs = data.tabs.map(sanitizeTab);
      state.activeTab = data.activeTab;
      if (typeof data.csvSep === 'string') state.csvSep = data.csvSep;
    }
  } catch {
    /* datos corruptos: se ignoran */
  }
  if (!state.tabs.length) state.tabs.push(makeTab('Proyección 1'));
  if (!state.tabs.some((t) => t.id === state.activeTab)) state.activeTab = state.tabs[0].id;
}

/* ---------- Pestañas ---------- */

function renderTabs() {
  tabsEl.textContent = '';
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTab ? ' active' : '');
    el.dataset.tab = tab.id;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(tab.id === state.activeTab));

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'tab-label';
    label.textContent = tab.name;
    label.title = 'Doble clic para renombrar';
    el.appendChild(label);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.textContent = '✕';
    close.title = 'Cerrar pestaña';
    close.setAttribute('aria-label', `Cerrar ${tab.name}`);
    el.appendChild(close);

    tabsEl.appendChild(el);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tab-add';
  add.textContent = '+';
  add.title = 'Nueva pestaña';
  add.setAttribute('aria-label', 'Nueva pestaña');
  tabsEl.appendChild(add);
}

function switchTab(id) {
  state.activeTab = id;
  setStatus('');
  renderAll();
  save();
}

function renderAll() {
  renderTabs();
  startInput.value = cur().startTime;
  sepDurInput.value = formatDuration(cur().sepDuration);
  render();
}

function startRename(tabEl) {
  const tab = state.tabs.find((t) => t.id === tabEl.dataset.tab);
  if (!tab) return;
  const label = tabEl.querySelector('.tab-label');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-input';
  input.value = tab.name;
  input.size = Math.max(8, tab.name.length + 1);
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    if (ok && input.value.trim()) tab.name = input.value.trim();
    renderTabs();
    save();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('input', () => (input.size = Math.max(8, input.value.length + 1)));
  input.addEventListener('blur', () => finish(true));
}

tabsEl.addEventListener('click', (e) => {
  if (e.target.closest('.tab-add')) {
    const tab = makeTab(`Proyección ${state.tabs.length + 1}`);
    tab.startTime = cur().startTime;
    tab.sepDuration = cur().sepDuration;
    state.tabs.push(tab);
    switchTab(tab.id);
    startRename(tabsEl.querySelector(`[data-tab="${tab.id}"]`));
    return;
  }
  const tabEl = e.target.closest('.tab');
  if (!tabEl) return;
  const tab = state.tabs.find((t) => t.id === tabEl.dataset.tab);
  if (e.target.closest('.tab-close')) {
    if (tab.items.length && !confirm(`¿Cerrar "${tab.name}"? Se borra su lista.`)) return;
    const idx = state.tabs.indexOf(tab);
    state.tabs.splice(idx, 1);
    if (!state.tabs.length) state.tabs.push(makeTab('Proyección 1'));
    if (state.activeTab === tab.id) state.activeTab = state.tabs[Math.max(0, idx - 1)].id;
    switchTab(state.activeTab);
    return;
  }
  if (e.target.closest('.tab-label') && tab.id !== state.activeTab) switchTab(tab.id);
});

tabsEl.addEventListener('dblclick', (e) => {
  const tabEl = e.target.closest('.tab');
  if (tabEl && e.target.closest('.tab-label')) startRename(tabEl);
});

/* ---------- Cálculo de horarios ---------- */

function computeSchedule() {
  let t = parseClock(cur().startTime) ?? 0;
  return cur().items.map((it) => {
    const start = t;
    t += it.duration ?? 0;
    return { start, end: t };
  });
}

/* ---------- Render ---------- */

function timeHtml(seconds) {
  const day = Math.floor(seconds / 86400);
  const extra = day > 0 ? `<sup class="day" title="Día siguiente">+${day}</sup>` : '';
  return `${formatClock(seconds)}${extra}`;
}

function render() {
  closeMoveMenu();
  rowsEl.textContent = '';
  let videoNum = 0;

  for (const it of cur().items) {
    const tr = document.createElement('tr');
    tr.dataset.id = it.id;
    tr.className = it.type === 'separator' ? 'row sep' : 'row';

    const num = it.type === 'video' ? ++videoNum : '';
    const missing = it.type === 'video' && it.duration == null && !it.loading;

    tr.innerHTML = `
      <td class="col-handle"><span class="handle" title="Arrastrar para reordenar" aria-hidden="true">⋮⋮</span></td>
      <td class="col-num muted">${num}</td>
      <td class="col-time mono" data-start></td>
      <td class="col-time mono muted" data-end></td>
      <td class="col-dur">
        <input class="dur mono${missing ? ' invalid' : ''}" type="text" inputmode="numeric"
          placeholder="${it.loading ? 'leyendo…' : 'hh:mm:ss'}" aria-label="Duración" />
      </td>
      <td class="col-name">
        <input class="name" type="text" aria-label="Nombre" />
        ${it.type === 'video' && it.fileName ? `<div class="orig muted" title="Archivo original"></div>` : ''}
      </td>
      <td class="col-actions">
        <button type="button" class="icon" data-act="move" title="Mover a otra pestaña" aria-label="Mover a otra pestaña" aria-haspopup="menu">⇄</button>
        <button type="button" class="icon" data-act="up" title="Subir" aria-label="Subir">↑</button>
        <button type="button" class="icon" data-act="down" title="Bajar" aria-label="Bajar">↓</button>
        <button type="button" class="icon remove" data-act="remove" title="Eliminar" aria-label="Eliminar">✕</button>
      </td>`;

    tr.querySelector('.dur').value = it.duration == null ? '' : formatDuration(it.duration);
    tr.querySelector('.name').value = it.name;
    const orig = tr.querySelector('.orig');
    if (orig) {
      orig.textContent = it.fileName;
      orig.hidden = it.fileName === it.name;
    }

    rowsEl.appendChild(tr);
  }

  emptyEl.hidden = cur().items.length > 0;
  updateTimes();
}

function updateTimes() {
  const schedule = computeSchedule();
  const rows = rowsEl.children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].querySelector('[data-start]').innerHTML = timeHtml(schedule[i].start);
    rows[i].querySelector('[data-end]').innerHTML = timeHtml(schedule[i].end);
  }

  const videos = cur().items.filter((it) => it.type === 'video');
  const missing = videos.filter((it) => it.duration == null && !it.loading).length;
  const total = cur().items.reduce((acc, it) => acc + (it.duration ?? 0), 0);
  const end = schedule.length ? schedule[schedule.length - 1].end : parseClock(cur().startTime) ?? 0;

  totalsEl.innerHTML = cur().items.length
    ? `<td></td><td></td><td class="muted">Total</td>
       <td class="col-time mono">${timeHtml(end)}</td>
       <td class="mono">${formatDuration(total)}</td>
       <td class="muted" colspan="2">${videos.length} video${videos.length === 1 ? '' : 's'}${
         missing ? ` · <span class="warn">${missing} sin duración</span>` : ''
       }</td>`
    : '';
}

function commit({ structural = true } = {}) {
  if (structural) render();
  else updateTimes();
  save();
}

/* ---------- Carga de archivos ---------- */

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function addFiles(files) {
  const videos = files.filter(isVideoFile);
  const skipped = files.length - videos.length;
  if (!videos.length) {
    setStatus(skipped ? 'No se encontraron archivos de video.' : '');
    return;
  }

  videos.sort((a, b) => naturalCompare(a.relPath || a.name, b.relPath || b.name));

  const added = videos.map((file) => ({
    id: newId(),
    type: 'video',
    name: file.name,
    fileName: file.name,
    path: pathInFolder(file.relPath || file.name),
    duration: null,
    loading: true,
    file,
  }));
  cur().items.push(...added);
  commit();
  setStatus(`Leyendo duración de ${added.length} archivo${added.length === 1 ? '' : 's'}…`);

  let done = 0;
  const queue = [...added];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      const d = await readDuration(it.file);
      it.loading = false;
      delete it.file;
      if (d != null) it.duration = Math.round(d);
      done++;
      updateRow(it);
      setStatus(`Leyendo duración… ${done}/${added.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const failed = added.filter((it) => it.duration == null).length;
  let msg = `${added.length} video${added.length === 1 ? '' : 's'} agregado${added.length === 1 ? '' : 's'}.`;
  if (failed) msg += ` ${failed} sin duración legible: completala a mano.`;
  if (skipped) msg += ` ${skipped} archivo${skipped === 1 ? '' : 's'} ignorado${skipped === 1 ? '' : 's'} (no son video).`;
  setStatus(msg);
  save();
}

function updateRow(it) {
  const tr = rowsEl.querySelector(`tr[data-id="${it.id}"]`);
  if (tr) {
    const input = tr.querySelector('.dur');
    if (document.activeElement !== input) {
      input.value = it.duration == null ? '' : formatDuration(it.duration);
    }
    input.placeholder = 'hh:mm:ss';
    input.classList.toggle('invalid', it.duration == null);
  }
  updateTimes();
}

/* ---------- Separadores ---------- */

function makeSeparator() {
  return { id: newId(), type: 'separator', name: 'Separador', duration: cur().sepDuration };
}

$('#add-separator').addEventListener('click', () => {
  cur().items.push(makeSeparator());
  commit();
});

$('#separators-between').addEventListener('click', () => {
  const out = [];
  cur().items.forEach((it, i) => {
    out.push(it);
    const next = cur().items[i + 1];
    if (it.type === 'video' && next && next.type === 'video') out.push(makeSeparator());
  });
  cur().items = out;
  commit();
});

/* ---------- Controles generales ---------- */

startInput.addEventListener('change', () => {
  if (parseClock(startInput.value) == null) {
    startInput.value = cur().startTime;
    return;
  }
  cur().startTime = startInput.value.length === 5 ? `${startInput.value}:00` : startInput.value;
  commit({ structural: false });
});

sepDurInput.addEventListener('change', () => {
  const d = parseDuration(sepDurInput.value);
  if (d == null) {
    sepDurInput.value = formatDuration(cur().sepDuration);
    return;
  }
  sepDurInput.value = formatDuration(d);
  if (d === cur().sepDuration && !cur().items.some((it) => it.type === 'separator' && it.duration !== d)) return;
  cur().sepDuration = d;
  for (const it of cur().items) {
    if (it.type !== 'separator') continue;
    it.duration = d;
    const input = rowsEl.querySelector(`tr[data-id="${it.id}"] .dur`);
    if (input) input.value = formatDuration(d);
  }
  commit({ structural: false });
});

csvSepSelect.addEventListener('change', () => {
  state.csvSep = csvSepSelect.value;
  save();
});

$('#sort-name').addEventListener('click', () => {
  // Ordena los videos por nombre y deja los separadores en sus posiciones.
  const videos = cur().items.filter((it) => it.type === 'video');
  videos.sort((a, b) => naturalCompare(a.name, b.name));
  cur().items = cur().items.map((it) => (it.type === 'video' ? videos.shift() : it));
  commit();
});

$('#clear').addEventListener('click', () => {
  if (!cur().items.length) return;
  if (!confirm('¿Vaciar la grilla?')) return;
  cur().items = [];
  setStatus('');
  commit();
});

/* ---------- Edición en la tabla ---------- */

const itemOf = (el) => {
  const tr = el.closest('tr[data-id]');
  return tr ? cur().items.find((it) => it.id === tr.dataset.id) : null;
};

rowsEl.addEventListener('input', (e) => {
  if (!e.target.classList.contains('name')) return;
  const it = itemOf(e.target);
  if (it) {
    it.name = e.target.value;
    const orig = e.target.parentElement.querySelector('.orig');
    if (orig) orig.hidden = it.fileName === it.name;
    save();
  }
});

rowsEl.addEventListener('change', (e) => {
  if (!e.target.classList.contains('dur')) return;
  const it = itemOf(e.target);
  if (!it) return;
  const raw = e.target.value.trim();
  const d = raw === '' ? null : parseDuration(raw);
  if (raw !== '' && d == null) {
    e.target.value = it.duration == null ? '' : formatDuration(it.duration);
    return;
  }
  it.duration = it.type === 'separator' ? d ?? 0 : d;
  e.target.value = it.duration == null ? '' : formatDuration(it.duration);
  e.target.classList.toggle('invalid', it.type === 'video' && it.duration == null);
  commit({ structural: false });
});

rowsEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
});

rowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const idx = cur().items.indexOf(itemOf(btn));
  if (idx < 0) return;
  const act = btn.dataset.act;
  if (act === 'move') {
    toggleMoveMenu(btn, cur().items[idx]);
    return;
  }
  if (act === 'remove') {
    cur().items.splice(idx, 1);
  } else {
    const to = act === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= cur().items.length) return;
    const [it] = cur().items.splice(idx, 1);
    cur().items.splice(to, 0, it);
  }
  commit();
  if (act !== 'remove') {
    rowsEl.querySelector(`tr[data-id="${cur().items[act === 'up' ? idx - 1 : idx + 1].id}"] button[data-act="${act}"]`)?.focus();
  }
});

/* ---------- Mover a otra pestaña ---------- */

let moveMenu = null;

function closeMoveMenu({ focusButton = false } = {}) {
  if (!moveMenu) return;
  const { el, button } = moveMenu;
  el.remove();
  button.setAttribute('aria-expanded', 'false');
  moveMenu = null;
  if (focusButton && button.isConnected) button.focus();
}

function toggleMoveMenu(button, item) {
  const wasOpenHere = moveMenu?.button === button;
  closeMoveMenu();
  if (wasOpenHere) return;

  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');

  const title = document.createElement('div');
  title.className = 'menu-title';
  title.textContent = 'Mover a';
  el.appendChild(title);

  const others = state.tabs.filter((t) => t.id !== state.activeTab);
  if (!others.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-empty';
    empty.textContent = 'No hay otras pestañas';
    el.appendChild(empty);
  }
  for (const tab of others) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'menu-item';
    opt.setAttribute('role', 'menuitem');
    opt.textContent = tab.name;
    opt.addEventListener('click', () => {
      closeMoveMenu();
      moveItemToTab(item, tab);
    });
    el.appendChild(opt);
  }

  document.body.appendChild(el);
  moveMenu = { el, button };
  button.setAttribute('aria-expanded', 'true');

  // Se ubica junto al botón; si no entra abajo, se abre hacia arriba.
  const r = button.getBoundingClientRect();
  const m = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.right - m.width), window.innerWidth - m.width - 8);
  const below = r.bottom + 4;
  const top = below + m.height > window.innerHeight - 8 ? Math.max(8, r.top - m.height - 4) : below;
  el.style.left = `${left + window.scrollX}px`;
  el.style.top = `${top + window.scrollY}px`;

  el.querySelector('.menu-item')?.focus();
}

function moveItemToTab(item, tab) {
  const idx = cur().items.indexOf(item);
  if (idx < 0) return;
  cur().items.splice(idx, 1);
  tab.items.push(item);
  setStatus(`"${item.name}" se movió a ${tab.name}.`);
  commit();
}

document.addEventListener('pointerdown', (e) => {
  if (moveMenu && !moveMenu.el.contains(e.target) && e.target !== moveMenu.button) closeMoveMenu();
});
document.addEventListener('keydown', (e) => {
  if (!moveMenu) return;
  if (e.key === 'Escape') closeMoveMenu({ focusButton: true });
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = [...moveMenu.el.querySelectorAll('.menu-item')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  }
});
window.addEventListener('resize', () => closeMoveMenu());

/* ---------- Reordenar arrastrando ---------- */

const ROW_TYPE = 'application/x-grilla-row';
let dragId = null;

rowsEl.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.handle');
  if (handle) handle.closest('tr').draggable = true;
});

rowsEl.addEventListener('dragstart', (e) => {
  const tr = e.target.closest?.('tr[data-id]');
  if (!tr || !tr.draggable) return;
  dragId = tr.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(ROW_TYPE, dragId);
  tr.classList.add('dragging');
});

function clearDropMarks() {
  rowsEl.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
}

rowsEl.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  const rect = tr.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  clearDropMarks();
  tr.classList.add(after ? 'drop-after' : 'drop-before');
});

rowsEl.addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault();
  e.stopPropagation();
  const tr = e.target.closest('tr[data-id]');
  const from = cur().items.findIndex((it) => it.id === dragId);
  if (tr && from >= 0 && tr.dataset.id !== dragId) {
    const after = tr.classList.contains('drop-after');
    const [it] = cur().items.splice(from, 1);
    let to = cur().items.findIndex((x) => x.id === tr.dataset.id);
    if (after) to += 1;
    cur().items.splice(to, 0, it);
  }
  endDrag();
  commit();
});

function endDrag() {
  dragId = null;
  clearDropMarks();
  rowsEl.querySelectorAll('tr[draggable="true"]').forEach((tr) => {
    tr.draggable = false;
    tr.classList.remove('dragging');
  });
}

rowsEl.addEventListener('dragend', endDrag);
document.addEventListener('pointerup', () => {
  if (!dragId) rowsEl.querySelectorAll('tr[draggable="true"]').forEach((tr) => (tr.draggable = false));
});

/* ---------- Soltar archivos / carpetas ---------- */

const hasFiles = (e) => !dragId && Array.from(e.dataTransfer?.types || []).includes('Files');
let dragDepth = 0;

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropzone.classList.add('active');
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropzone.classList.remove('active');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('active');
  setStatus('Leyendo archivos…');
  const files = await collectFromDataTransfer(e.dataTransfer);
  addFiles(files);
});

const fileInput = $('#file-input');
const folderInput = $('#folder-input');
$('#pick-files').addEventListener('click', () => fileInput.click());
$('#pick-folder').addEventListener('click', () => folderInput.click());
for (const input of [fileInput, folderInput]) {
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []).map((f) => {
      f.relPath = f.webkitRelativePath || f.name;
      return f;
    });
    input.value = '';
    addFiles(files);
  });
}

/* ---------- Exportar ---------- */

function csvText() {
  const schedule = computeSchedule();
  const rows = cur().items.map((it, i) => [
    formatClock(schedule[i].start),
    formatClock(schedule[i].end),
    it.duration == null ? '' : formatDuration(it.duration),
    it.name,
    it.fileName || '',
  ]);
  return buildCsv([['Inicio', 'Fin', 'Duración', 'Nombre', 'Archivo original'], ...rows], state.csvSep === 'tab' ? '\t' : state.csvSep);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function flash(btn, label) {
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = label;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => (btn.textContent = original), 1600);
}

$('#copy-csv').addEventListener('click', async (e) => {
  if (!cur().items.length) return flash(e.currentTarget, 'Grilla vacía');
  const btn = e.currentTarget;
  flash(btn, (await copyText(csvText())) ? 'Copiado ✓' : 'No se pudo copiar');
});

function downloadText(text, ext, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cur().name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'grilla'}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#download-csv').addEventListener('click', (e) => {
  if (!cur().items.length) return flash(e.currentTarget, 'Grilla vacía');
  downloadText('\ufeff' + csvText(), 'csv', 'text/csv;charset=utf-8');
});

$('#download-vlc').addEventListener('click', (e) => {
  if (!cur().items.some((it) => it.type === 'video')) return flash(e.currentTarget, 'Sin videos');
  downloadText(buildM3u(cur().items), 'm3u8', 'audio/x-mpegurl;charset=utf-8');
});

/* ---------- Inicio ---------- */

load();
csvSepSelect.value = state.csvSep;
renderAll();
