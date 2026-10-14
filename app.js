/* Lift Log: a tiny workout tracker.
   No build step, no backend. All data lives in this browser's localStorage.
   Structure: blocks -> days -> exercises (the program); sessions log one day on one date. */
(function () {
'use strict';

// ============================================================ constants
const STORAGE_KEY = 'liftlog.v1';
const APP_VERSION = '1.1.0';
const TYPE_LABEL = { lb: 'Weight', bw: 'BW', band: 'Band', time: 'Timed' };
const TYPE_SHORT = { lb: 'lb', bw: 'bodyweight', band: 'band', time: 'timed' };
const DEFAULTS = {
  version: 1,
  settings: { weightStep: 5, repStep: 1, timeStep: 5, notesShown: 3, theme: 'auto', bands: ['Light', 'Medium', 'Heavy'] },
  currentBlockId: null,
  blocks: [],
  sessions: [],
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================ small helpers
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nameKey = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const round2 = v => Math.round(v * 100) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const move = (arr, from, to) => { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); };

function fmtDate(s, opts = {}) {
  if (!s) return '';
  const d = parseYmd(s), now = new Date();
  if (!opts.absolute) {
    if (s === todayStr()) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (s === ymd(y)) return 'Yesterday';
  }
  let out = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (opts.weekday) out = `${WEEKDAYS[d.getDay()]}, ${out}`;
  if (d.getFullYear() !== now.getFullYear()) out += `, ${d.getFullYear()}`;
  return out;
}

// Tiny element builder: h('div', {class:'x', onclick: fn}, child, [children...])
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const ICON = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z',
  program: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 2'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  back: 'M15 18l-6-6 6-6',
  dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  check: 'M5 12l5 5L20 7',
  chevron: 'M9 18l6-6-6-6',
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
};
function svgIcon(d, size = 22, strokeWidth = 2) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', strokeWidth);
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  for (const path of [].concat(d)) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', path); s.append(p); }
  return s;
}

// ============================================================ storage
let data = load();
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error('Could not load saved data', e); }
  return clone(DEFAULTS);
}
function migrate(d) {
  const out = Object.assign(clone(DEFAULTS), d);
  out.settings = Object.assign(clone(DEFAULTS.settings), d.settings || {});
  if (!Array.isArray(out.blocks)) out.blocks = [];
  if (!Array.isArray(out.sessions)) out.sessions = [];
  if (!Array.isArray(out.settings.bands)) out.settings.bands = clone(DEFAULTS.settings.bands);
  out.version = 1;
  return out;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { toast('Save failed: ' + e.message); }
}
function applyTheme() {
  const t = data.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ============================================================ domain
const blockById = id => data.blocks.find(b => b.id === id) || null;
const currentBlock = () => blockById(data.currentBlockId) || data.blocks[0] || null;
const dayById = (block, id) => (block && block.days.find(d => d.id === id)) || null;
const sessionById = id => data.sessions.find(s => s.id === id) || null;
const sortedSessions = () => [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
const isBefore = (s, cur) => s.date < cur.date || (s.date === cur.date && s.createdAt < cur.createdAt);
// An exercise counts as logged once you edit any number or note, or check it off.
const entryLogged = e => !!(e.touched || e.done);
const sessionLogged = s => Object.values(s.entries).some(entryLogged);

function lastPerformance(key, cur) {
  for (const s of sortedSessions()) {
    if (cur && !isBefore(s, cur)) continue;
    for (const e of Object.values(s.entries)) if (e.nameKey === key && entryLogged(e)) return { session: s, entry: e };
  }
  return null;
}
function pastNotes(key, cur, n) {
  const out = [];
  for (const s of sortedSessions()) {
    if (cur && !isBefore(s, cur)) continue;
    for (const e of Object.values(s.entries)) {
      if (e.nameKey === key && e.note && e.note.trim()) { out.push({ date: s.date, note: e.note.trim() }); if (out.length >= n) return out; }
    }
  }
  return out;
}
// Every exercise name seen anywhere, newest definition wins. Used for autocomplete.
function knownExercises() {
  const map = new Map();
  const blocks = [...data.blocks].sort((a, b) => (b.id === data.currentBlockId) - (a.id === data.currentBlockId) || b.createdAt - a.createdAt);
  for (const b of blocks) for (const d of b.days) for (const ex of d.exercises) {
    const k = nameKey(ex.name);
    if (k && !map.has(k)) map.set(k, { name: ex.name, type: ex.type, sets: ex.sets, note: ex.note || '' });
  }
  for (const s of sortedSessions()) for (const e of Object.values(s.entries)) {
    if (!entryLogged(e) || map.has(e.nameKey)) continue;
    map.set(e.nameKey, { name: e.name, type: e.type, sets: e.sets.length, note: '' });
  }
  return map;
}
const emptySet = () => ({ w: null, r: null, s: null, band: null });
function newEntry(ex, cur) {
  const key = nameKey(ex.name);
  const last = lastPerformance(key, cur);
  const sets = [];
  for (let i = 0; i < ex.sets; i++) {
    const src = last ? (last.entry.sets[i] || last.entry.sets[last.entry.sets.length - 1]) : null;
    sets.push(src ? { w: src.w ?? null, r: src.r ?? null, s: src.s ?? null, band: src.band ?? null } : emptySet());
  }
  return { exerciseId: ex.id, name: ex.name, nameKey: key, type: ex.type, linkAbove: !!ex.linkAbove, sets, note: '', done: false, touched: false };
}
// Supersets: an exercise with linkAbove joins the exercise above it. Consecutive links form one group.
function dayGroups(exercises) {
  const groups = [];
  exercises.forEach((ex, i) => {
    if (i > 0 && ex.linkAbove) groups[groups.length - 1].push(ex);
    else groups.push([ex]);
  });
  return groups;
}
// Same idea for a session, but an exercise pulled out for today (solo) stands alone and
// does not break the chain for the ones around it.
function sessionGroups(items, solo) {
  const groups = [];
  let chain = null;
  for (const it of items) {
    const link = it.ex ? !!it.ex.linkAbove : !!it.e.linkAbove;
    if (solo[it.id]) { groups.push({ members: [it], solo: true }); continue; }
    if (link && chain) { chain.members.push(it); continue; }
    chain = { members: [it], solo: false };
    groups.push(chain);
  }
  return groups;
}
const groupLetter = n => String.fromCharCode(65 + (n % 26));
function createBlock(name, copyFrom) {
  const block = { id: uid(), name, createdAt: Date.now(), days: [] };
  if (copyFrom) block.days = copyFrom.days.map(d => ({ id: uid(), name: d.name, exercises: d.exercises.map(clone) }));
  else block.days = ['Day A', 'Day B', 'Day C'].map(n => ({ id: uid(), name: n, exercises: [] }));
  data.blocks.push(block);
  data.currentBlockId = block.id;
  save();
  return block;
}
function openDay(block, day) {
  const today = todayStr();
  let s = data.sessions.find(x => x.blockId === block.id && x.dayId === day.id && x.date === today);
  if (!s) {
    s = { id: uid(), blockId: block.id, dayId: day.id, blockName: block.name, dayName: day.name, date: today, createdAt: Date.now(), entries: {} };
    data.sessions.push(s);
    for (const ex of day.exercises) s.entries[ex.id] = newEntry(ex, s);
    save();
  }
  go(`/session/${s.id}`);
}
// Sessions that were opened but never logged are thrown away.
function pruneEmptySessions(keepId) {
  const before = data.sessions.length;
  data.sessions = data.sessions.filter(s => s.id === keepId || sessionLogged(s));
  if (data.sessions.length !== before) save();
}
function fmtSets(e) {
  const sets = e.sets || [];
  if (!sets.length) return '';
  const r = st => (st.r == null ? '–' : st.r);
  if (e.type === 'time') return sets.map(st => (st.s == null ? '–' : st.s) + 's').join(', ');
  if (e.type === 'band') {
    const bands = sets.map(st => st.band || '–');
    return bands.every(b => b === bands[0]) ? `${bands[0]} × ${sets.map(r).join(', ')}` : sets.map(st => `${st.band || '–'}×${r(st)}`).join(', ');
  }
  const wf = st => e.type === 'bw' ? (st.w ? `BW+${st.w}` : 'BW') : (st.w == null ? '–' : st.w);
  const ws = sets.map(wf);
  return ws.every(w => w === ws[0]) ? `${ws[0]} × ${sets.map(r).join(', ')}` : sets.map(st => `${wf(st)}×${r(st)}`).join(', ');
}

// ============================================================ UI primitives
let sheetEl = null;
function openSheet(content, opts = {}) {
  closeSheet();
  const sheet = h('div', { class: 'sheet', role: 'dialog' }, content);
  sheetEl = h('div', { class: 'overlay', onclick: ev => { if (ev.target === sheetEl) { closeSheet(); if (opts.onDismiss) opts.onDismiss(); } } }, sheet);
  document.body.append(sheetEl);
  document.body.classList.add('noscroll');
  return sheet;
}
function closeSheet() {
  if (!sheetEl) return;
  sheetEl.remove(); sheetEl = null;
  document.body.classList.remove('noscroll');
}
function confirmSheet({ title, message, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const done = v => { closeSheet(); resolve(v); };
    openSheet([
      h('h2', { class: 'sheet-title' }, title),
      message ? h('p', { class: 'muted' }, message) : null,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn full ' + (danger ? 'danger-solid' : 'primary'), onclick: () => done(true) }, ok),
        h('button', { class: 'btn full ghost', onclick: () => done(false) }, cancel)),
    ], { onDismiss: () => resolve(false) });
  });
}
function promptSheet({ title, value = '', placeholder = '', ok = 'Save' }) {
  return new Promise(resolve => {
    const input = h('input', { class: 'input', type: 'text', value, placeholder, autocapitalize: 'words', autocomplete: 'off' });
    const submit = () => { const v = input.value.trim(); closeSheet(); resolve(v || null); };
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') submit(); });
    openSheet([
      h('h2', { class: 'sheet-title' }, title),
      input,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn full primary', onclick: submit }, ok),
        h('button', { class: 'btn full ghost', onclick: () => { closeSheet(); resolve(null); } }, 'Cancel')),
    ], { onDismiss: () => resolve(null) });
    input.focus(); input.select();
  });
}
function menuSheet(items, title) {
  openSheet([
    title ? h('h2', { class: 'sheet-title' }, title) : null,
    h('div', { class: 'menu' }, items.filter(Boolean).map(it =>
      h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), onclick: () => { closeSheet(); it.action(); } }, it.label))),
  ]);
}
let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function topbar(title, sub, opts = {}) {
  const bar = h('div', { class: 'topbar' });
  if (opts.back) bar.append(h('button', { class: 'btn icon ghost', 'aria-label': 'Back', onclick: () => goBack(opts.back) }, svgIcon(ICON.back, 26)));
  bar.append(h('div', { class: 'topbar-text' }, h('h1', {}, title), sub ? h('div', { class: 'sub muted' }, sub) : null));
  if (opts.menu) bar.append(h('button', { class: 'btn icon ghost', 'aria-label': 'More options', onclick: opts.menu }, svgIcon(ICON.dots, 24, 3)));
  return bar;
}
function emptyState(title, text, label, onClick) {
  return h('div', { class: 'empty' }, h('h2', {}, title), h('p', { class: 'muted' }, text), h('button', { class: 'btn primary', onclick: onClick }, label));
}
function stepper(obj, field, step, onChange, mode = 'decimal', min = 0) {
  const show = () => { input.value = obj[field] == null ? '' : obj[field]; };
  const input = h('input', { type: 'text', inputmode: mode, autocomplete: 'off', placeholder: '–', 'aria-label': field });
  show();
  input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
  input.addEventListener('input', () => {
    const v = parseFloat(input.value.replace(',', '.'));
    obj[field] = Number.isFinite(v) ? v : null;
    onChange();
  });
  input.addEventListener('blur', show);
  const bump = d => { obj[field] = Math.max(min, round2((obj[field] || 0) + d)); show(); onChange(); };
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => bump(-step) }, '−'),
    input,
    h('button', { type: 'button', 'aria-label': 'Increase', onclick: () => bump(step) }, '+'));
}
function segmented(options, value, onChange) {
  const seg = h('div', { class: 'seg' });
  const btns = {};
  const set = v => { for (const k in btns) btns[k].classList.toggle('on', k === v); };
  for (const k in options) {
    btns[k] = h('button', { type: 'button', onclick: () => { set(k); onChange(k); } }, options[k]);
    seg.append(btns[k]);
  }
  set(value);
  seg.set = set;
  return seg;
}

// ============================================================ routing
const TABS = [
  { path: '/', label: 'Today', icon: ICON.home, match: ['home', 'session'] },
  { path: '/program', label: 'Program', icon: ICON.program, match: ['program'] },
  { path: '/history', label: 'History', icon: ICON.history, match: ['history', 'exercise'] },
  { path: '/settings', label: 'Settings', icon: ICON.settings, match: ['settings'] },
];
function buildTabs() {
  const nav = document.getElementById('tabbar');
  for (const t of TABS) nav.append(h('a', { href: '#' + t.path, 'data-match': t.match.join(' ') }, svgIcon(t.icon, 22), t.label));
}
function updateTabs(name) {
  for (const a of document.querySelectorAll('#tabbar a')) a.classList.toggle('active', a.dataset.match.split(' ').includes(name));
}
function route() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', arg: decodeURIComponent(parts[1] || '') };
}
function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = '#' + path;
}
function goBack(fallback) {
  if (history.length > 1) history.back(); else go(fallback);
}
function render() {
  const r = route();
  pruneEmptySessions(r.name === 'session' ? r.arg : null);
  closeSheet();
  const app = clear(document.getElementById('app'));
  window.scrollTo(0, 0);
  const views = { home: viewHome, session: viewSession, program: viewProgram, history: viewHistory, exercise: viewExercise, settings: viewSettings };
  (views[r.name] || viewHome)(app, r.arg);
  updateTabs(r.name in views ? r.name : 'home');
}

// ============================================================ Home
function viewHome(app) {
  const block = currentBlock();
  const today = fmtDate(todayStr(), { weekday: true, absolute: true });
  app.append(topbar('Lift Log', block ? `${today} · ${block.name}` : today));
  if (!block) {
    app.append(emptyState('No program yet', 'A block holds your training days (A, B, C…) and the exercises in each.', 'Set up my program', () => { createBlock('My Program'); go('/program'); }));
    return;
  }
  if (!block.days.length) {
    app.append(emptyState('No days in this block', 'Add a day in Program to start logging.', 'Go to Program', () => go('/program')));
    return;
  }
  const todayS = todayStr();
  for (const day of block.days) {
    const inProgress = data.sessions.find(s => s.blockId === block.id && s.dayId === day.id && s.date === todayS && sessionLogged(s));
    const last = sortedSessions().find(s => s.dayId === day.id && sessionLogged(s));
    const n = day.exercises.length;
    let sub;
    if (inProgress) sub = `Today · ${Object.values(inProgress.entries).filter(entryLogged).length}/${n} logged`;
    else if (last) sub = `Last done ${fmtDate(last.date)} · ${plural(n, 'exercise')}`;
    else sub = `Not done yet · ${plural(n, 'exercise')}`;
    app.append(h('button', { class: 'card tap daycard', onclick: () => openDay(block, day) },
      h('div', { class: 'daycard-main' }, h('div', { class: 'daycard-name' }, day.name), h('div', { class: 'muted small' }, sub)),
      svgIcon(ICON.chevron, 20)));
  }
  if (!block.days.some(d => d.exercises.length)) app.append(h('p', { class: 'muted center small' }, 'Add exercises to your days in Program.'));
}

// ============================================================ Session
function viewSession(app, id) {
  const s = sessionById(id);
  if (!s) { app.append(topbar('Session not found', null, { back: '/' })); return; }
  const block = blockById(s.blockId);
  const day = dayById(block, s.dayId);
  app.append(topbar(day ? day.name : s.dayName, block ? block.name : s.blockName, { back: '/', menu: () => sessionMenu(s) }));

  const prog = h('span', { class: 'muted small' });
  app.append(h('div', { class: 'row between session-meta' },
    h('button', { class: 'chip', onclick: () => changeDateSheet(s) }, fmtDate(s.date, { weekday: true })),
    prog));
  const list = h('div');
  app.append(list);

  let total = 0;
  const updateProgress = () => { prog.textContent = `${Object.values(s.entries).filter(entryLogged).length}/${total} logged`; };
  // Rebuilds the exercise cards in place (no scroll jump), e.g. after pulling one out of a superset.
  const buildList = () => {
    clear(list);
    const defs = day ? day.exercises : [];
    const items = [];
    for (const ex of defs) {
      let e = s.entries[ex.id];
      // Untouched entries are rebuilt each time so they always reflect the latest "last time".
      if (!e || !entryLogged(e)) e = s.entries[ex.id] = newEntry(ex, s);
      items.push({ id: ex.id, ex, e });
    }
    for (const e of Object.values(s.entries)) {
      if (!defs.some(d => d.id === e.exerciseId) && entryLogged(e)) items.push({ id: e.exerciseId, ex: null, e });
    }
    total = items.length;
    if (!total) list.append(h('p', { class: 'muted center' }, 'No exercises in this day yet. Add some in Program.'));
    const solo = s.solo || {};
    let letter = 0;
    for (const g of sessionGroups(items, solo)) {
      if (g.members.length > 1) {
        const L = groupLetter(letter++);
        g.members.forEach((m, i) => { m.label = `${L}${i + 1}`; });
        list.append(supersetCard(s, g.members, updateProgress, buildList));
      } else {
        const m = g.members[0];
        list.append(exerciseCard(s, m.e, m.ex, updateProgress, g.solo ? () => { delete s.solo[m.id]; save(); buildList(); } : null));
      }
    }
    save();
    updateProgress();
  };
  buildList();
}
function exerciseCard(s, e, ex, onChange, onRejoin) {
  const wrap = h('div');
  let open = !e.done;
  const mark = () => { e.touched = true; save(); onChange(); };
  const build = () => {
    clear(wrap);
    const card = h('div', { class: 'card ex' + (e.done ? ' is-done' : '') });
    const check = h('button', { class: 'check' + (e.done ? ' on' : ''), 'aria-label': 'Mark done', 'aria-pressed': String(e.done),
      onclick: ev => { ev.stopPropagation(); e.done = !e.done; open = !e.done; save(); onChange(); build(); } }, svgIcon(ICON.check, 18, 3));
    card.append(h('div', { class: 'ex-head', onclick: () => { if (e.done) { open = !open; build(); } } },
      h('div', { class: 'ex-title' }, h('div', { class: 'ex-name' }, e.name), ex && ex.note ? h('div', { class: 'ex-sticky' }, ex.note) : null),
      check));
    if (onRejoin) card.append(h('div', { class: 'solo-note' }, h('span', { class: 'muted' }, 'On its own today · '), h('button', { class: 'linkbtn', onclick: onRejoin }, 'Rejoin superset')));
    if (!open) {
      card.append(h('div', { class: 'ex-summary' }, fmtSets(e) || '—'));
      if (e.note) card.append(h('div', { class: 'muted small' }, e.note));
      wrap.append(card);
      return;
    }
    const last = lastPerformance(e.nameKey, s);
    card.append(last
      ? h('button', { class: 'last', onclick: () => go(`/exercise/${encodeURIComponent(e.nameKey)}`) },
          h('span', { class: 'muted' }, `Last · ${fmtDate(last.session.date)} · `), fmtSets(last.entry), svgIcon(ICON.chevron, 14))
      : h('div', { class: 'last muted' }, 'First time — no previous numbers'));

    const setsEl = h('div', { class: 'sets' });
    const colLabel = e.type === 'time' ? 'sec' : e.type === 'band' ? 'band' : e.type === 'bw' ? '+ lb' : 'lb';
    const renderSets = () => {
      clear(setsEl);
      setsEl.append(h('div', { class: 'setrow head' }, h('span', { class: 'n' }), h('span', { class: 'col' }, colLabel),
        e.type !== 'time' ? [h('span', { class: 'x' }), h('span', { class: 'col' }, 'reps')] : null));
      e.sets.forEach((st, i) => setsEl.append(setRow(e, st, i, mark)));
      setsEl.append(h('div', { class: 'set-actions' },
        h('button', { class: 'btn ghost small', onclick: () => { const prev = e.sets[e.sets.length - 1]; e.sets.push(prev ? { ...prev } : emptySet()); mark(); renderSets(); } }, '+ Set'),
        e.sets.length > 1 ? h('button', { class: 'btn ghost small', onclick: () => { e.sets.pop(); mark(); renderSets(); } }, '− Set') : null));
    };
    renderSets();
    card.append(setsEl);

    const note = h('textarea', { class: 'input note', rows: 1, placeholder: 'Note for today (optional)', value: e.note || '' });
    const grow = () => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; };
    note.addEventListener('input', () => { e.note = note.value; mark(); grow(); });
    card.append(note);
    requestAnimationFrame(grow);
    const notes = pastNotes(e.nameKey, s, data.settings.notesShown);
    if (notes.length) card.append(h('div', { class: 'pnotes' }, notes.map(n => h('div', { class: 'pnote' }, h('span', { class: 'muted' }, fmtDate(n.date) + ' · '), n.note))));
    wrap.append(card);
  };
  build();
  return wrap;
}
function setRow(e, st, i, mark, label) {
  const row = h('div', { class: 'setrow' }, h('span', { class: 'n' }, label || (i + 1)));
  if (e.type === 'band') row.append(bandSelect(st, mark));
  else if (e.type === 'time') row.append(stepper(st, 's', data.settings.timeStep, mark, 'numeric'));
  else row.append(stepper(st, 'w', data.settings.weightStep, mark, 'decimal'));
  if (e.type !== 'time') row.append(h('span', { class: 'x' }, '×'), stepper(st, 'r', data.settings.repStep, mark, 'numeric'));
  return row;
}
// One card for a superset: member headers, then the sets interleaved round by round.
function supersetCard(s, members, onChange, onLayoutChange) {
  const wrap = h('div');
  const allDone = () => members.every(m => m.e.done);
  let open = !allDone();
  const mark = e => { e.touched = true; save(); onChange(); };
  const typeHint = t => t === 'time' ? 'sec' : t === 'band' ? 'band × reps' : t === 'bw' ? 'BW + lb × reps' : 'lb × reps';
  const pullOutMenu = () => menuSheet(members.map(m => ({
    label: `Do ${m.e.name} on its own today`,
    action: () => { s.solo = s.solo || {}; s.solo[m.id] = true; save(); onLayoutChange(); },
  })), 'Pull out of superset');
  const build = () => {
    clear(wrap);
    const card = h('div', { class: 'card ex ss' + (allDone() ? ' is-done' : '') });
    card.append(h('div', { class: 'ss-head', onclick: () => { if (allDone()) { open = !open; build(); } } },
      h('span', { class: 'ss-label' }, 'Superset'),
      h('button', { class: 'btn icon ghost small', 'aria-label': 'Superset options', onclick: ev => { ev.stopPropagation(); pullOutMenu(); } }, svgIcon(ICON.dots, 20, 3))));
    for (const m of members) {
      const e = m.e;
      const check = h('button', { class: 'check' + (e.done ? ' on' : ''), 'aria-label': `Mark ${e.name} done`, 'aria-pressed': String(e.done),
        onclick: ev => { ev.stopPropagation(); e.done = !e.done; save(); onChange(); open = !allDone(); build(); } }, svgIcon(ICON.check, 18, 3));
      card.append(h('div', { class: 'ss-member' + (e.done ? ' is-done' : '') },
        h('span', { class: 'tag' }, m.label),
        h('div', { class: 'ex-title' },
          h('div', { class: 'ex-name' }, e.name, h('span', { class: 'muted small hint' }, ` · ${typeHint(e.type)}`)),
          m.ex && m.ex.note ? h('div', { class: 'ex-sticky' }, m.ex.note) : null),
        check));
      if (!open) {
        card.append(h('div', { class: 'ex-summary ss-indent' }, fmtSets(e) || '—'));
        if (e.note) card.append(h('div', { class: 'muted small ss-indent' }, e.note));
        continue;
      }
      const last = lastPerformance(e.nameKey, s);
      card.append(last
        ? h('button', { class: 'last ss-indent', onclick: () => go(`/exercise/${encodeURIComponent(e.nameKey)}`) },
            h('span', { class: 'muted' }, `Last · ${fmtDate(last.session.date)} · `), fmtSets(last.entry), svgIcon(ICON.chevron, 14))
        : h('div', { class: 'last muted ss-indent' }, 'First time — no previous numbers'));
    }
    if (!open) { wrap.append(card); return; }

    const roundsEl = h('div', { class: 'sets' });
    const renderRounds = () => {
      clear(roundsEl);
      const n = Math.max(...members.map(m => m.e.sets.length));
      for (let r = 0; r < n; r++) {
        roundsEl.append(h('div', { class: 'round-label' }, `Round ${r + 1}`));
        for (const m of members) if (m.e.sets[r]) roundsEl.append(setRow(m.e, m.e.sets[r], r, () => mark(m.e), m.label));
      }
      roundsEl.append(h('div', { class: 'set-actions' },
        h('button', { class: 'btn ghost small', onclick: () => {
          for (const m of members) { const prev = m.e.sets[m.e.sets.length - 1]; m.e.sets.push(prev ? { ...prev } : emptySet()); mark(m.e); }
          renderRounds();
        } }, '+ Round'),
        n > 1 ? h('button', { class: 'btn ghost small', onclick: () => {
          for (const m of members) if (m.e.sets.length === n) { m.e.sets.pop(); mark(m.e); }
          renderRounds();
        } }, '− Round') : null));
    };
    renderRounds();
    card.append(roundsEl);

    for (const m of members) {
      const e = m.e;
      const note = h('textarea', { class: 'input note', rows: 1, placeholder: `Note · ${e.name} (optional)`, value: e.note || '' });
      const grow = () => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; };
      note.addEventListener('input', () => { e.note = note.value; mark(e); grow(); });
      card.append(note);
      requestAnimationFrame(grow);
      const notes = pastNotes(e.nameKey, s, data.settings.notesShown);
      if (notes.length) card.append(h('div', { class: 'pnotes' }, notes.map(n => h('div', { class: 'pnote' }, h('span', { class: 'muted' }, `${fmtDate(n.date)} · ${e.name} · `), n.note))));
    }
    wrap.append(card);
  };
  build();
  return wrap;
}
function bandSelect(st, mark) {
  const bands = [...data.settings.bands];
  if (st.band && !bands.includes(st.band)) bands.unshift(st.band);
  const sel = h('select', { class: 'bandsel', 'aria-label': 'Band' }, h('option', { value: '' }, '–'), bands.map(b => h('option', { value: b }, b)));
  sel.value = st.band || '';
  sel.addEventListener('change', () => { st.band = sel.value || null; mark(); });
  return sel;
}
function sessionMenu(s) {
  menuSheet([
    { label: 'Change date', action: () => changeDateSheet(s) },
    { label: 'Delete this session', danger: true, action: async () => {
      if (await confirmSheet({ title: 'Delete session?', message: 'This removes everything logged for this day.', ok: 'Delete', danger: true })) {
        data.sessions = data.sessions.filter(x => x.id !== s.id); save(); go('/');
      }
    } },
  ]);
}
function changeDateSheet(s) {
  const input = h('input', { class: 'input', type: 'date', value: s.date });
  openSheet([
    h('h2', { class: 'sheet-title' }, 'Session date'),
    h('p', { class: 'muted small' }, 'Forgot to log a workout? Move this session to the day you actually did it.'),
    input,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn full primary', onclick: () => {
        const v = input.value; if (!v) return;
        if (data.sessions.some(x => x.id !== s.id && x.blockId === s.blockId && x.dayId === s.dayId && x.date === v)) { toast('That day already has a session on this date'); return; }
        s.date = v; save(); closeSheet(); render();
      } }, 'Save'),
      h('button', { class: 'btn full ghost', onclick: closeSheet }, 'Cancel')),
  ]);
}

// ============================================================ Program
function viewProgram(app) {
  const block = currentBlock();
  app.append(topbar('Program', null, block ? { menu: () => blockMenu(block) } : {}));
  if (!block) {
    app.append(emptyState('No program yet', 'A block holds your training days. Start with A, B, C and add exercises.', 'Create block', () => { createBlock('My Program'); render(); }));
    return;
  }
  app.append(h('div', { class: 'block-head' },
    h('button', { class: 'block-name', onclick: () => renameBlock(block) }, block.name, svgIcon(ICON.pencil, 16)),
    data.blocks.length > 1 ? h('button', { class: 'btn small', onclick: switchBlockSheet }, 'Switch block') : null));
  for (const day of block.days) {
    const card = h('div', { class: 'card' });
    card.append(h('div', { class: 'row between' },
      h('div', { class: 'day-name' }, day.name),
      h('button', { class: 'btn icon ghost', 'aria-label': 'Day options', onclick: () => dayMenu(block, day) }, svgIcon(ICON.dots, 22, 3))));
    if (!day.exercises.length) card.append(h('div', { class: 'muted small pad' }, 'No exercises yet.'));
    const exRow = (ex, label) => h('button', { class: 'exrow', onclick: () => exerciseForm(block, day, ex) },
      label ? h('span', { class: 'tag' }, label) : null,
      h('div', { class: 'exrow-main' }, h('div', { class: 'exrow-name' }, ex.name), ex.note ? h('div', { class: 'muted small' }, ex.note) : null),
      h('div', { class: 'muted small nowrap' }, `${plural(ex.sets, 'set')} · ${TYPE_SHORT[ex.type] || ex.type}`),
      svgIcon(ICON.chevron, 16));
    let letter = 0;
    for (const g of dayGroups(day.exercises)) {
      if (g.length === 1) { card.append(exRow(g[0], null)); continue; }
      const L = groupLetter(letter++);
      card.append(h('div', { class: 'ss-box' }, h('div', { class: 'ss-caption' }, `Superset ${L}`), g.map((ex, i) => exRow(ex, `${L}${i + 1}`))));
    }
    card.append(h('button', { class: 'btn ghost full', onclick: () => exerciseForm(block, day, null) }, '+ Add exercise'));
    app.append(card);
  }
  app.append(h('button', { class: 'btn full', onclick: () => addDay(block) }, '+ Add day'));
}
async function renameBlock(block) {
  const v = await promptSheet({ title: 'Rename block', value: block.name });
  if (v) { block.name = v; save(); render(); }
}
async function addDay(block) {
  const v = await promptSheet({ title: 'New day', value: 'Day ' + String.fromCharCode(65 + (block.days.length % 26)), ok: 'Add' });
  if (v) { block.days.push({ id: uid(), name: v, exercises: [] }); save(); render(); }
}
function dayMenu(block, day) {
  const i = block.days.indexOf(day);
  menuSheet([
    { label: 'Rename day', action: async () => { const v = await promptSheet({ title: 'Rename day', value: day.name }); if (v) { day.name = v; save(); render(); } } },
    i > 0 ? { label: 'Move up', action: () => { move(block.days, i, i - 1); save(); render(); } } : null,
    i < block.days.length - 1 ? { label: 'Move down', action: () => { move(block.days, i, i + 1); save(); render(); } } : null,
    { label: 'Delete day', danger: true, action: async () => {
      if (await confirmSheet({ title: `Delete ${day.name}?`, message: 'Sessions already logged for this day stay in History.', ok: 'Delete', danger: true })) {
        block.days.splice(i, 1); save(); render();
      }
    } },
  ], day.name);
}
function blockMenu(block) {
  menuSheet([
    { label: 'Rename block', action: () => renameBlock(block) },
    { label: 'New block', action: newBlockSheet },
    data.blocks.length > 1 ? { label: 'Switch block', action: switchBlockSheet } : null,
    { label: 'Delete block', danger: true, action: async () => {
      if (await confirmSheet({ title: `Delete "${block.name}"?`, message: 'Its days and exercises are removed. Logged sessions stay in History.', ok: 'Delete block', danger: true })) {
        data.blocks = data.blocks.filter(b => b.id !== block.id);
        data.currentBlockId = data.blocks[0] ? data.blocks[0].id : null;
        save(); render();
      }
    } },
  ], block.name);
}
function newBlockSheet() {
  const cur = currentBlock();
  const nameIn = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Fall 2026', autocapitalize: 'words', autocomplete: 'off' });
  const copy = h('input', { type: 'checkbox', checked: true });
  openSheet([
    h('h2', { class: 'sheet-title' }, 'New block'),
    h('p', { class: 'muted small' }, 'Start a new block when you refresh your exercises. "Last time" numbers carry over for any exercise with the same name.'),
    h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn),
    cur ? h('label', { class: 'checkrow' }, copy, `Copy days and exercises from "${cur.name}"`) : null,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn full primary', onclick: () => {
        createBlock(nameIn.value.trim() || 'New block', cur && copy.checked ? cur : null);
        closeSheet(); render();
      } }, 'Create'),
      h('button', { class: 'btn full ghost', onclick: closeSheet }, 'Cancel')),
  ]);
  nameIn.focus();
}
function switchBlockSheet() {
  const cur = currentBlock();
  openSheet([
    h('h2', { class: 'sheet-title' }, 'Switch block'),
    h('div', { class: 'menu' }, data.blocks.map(b => h('button', { class: 'menu-item' + (cur && b.id === cur.id ? ' on' : ''), onclick: () => { data.currentBlockId = b.id; save(); closeSheet(); render(); } },
      b.name, cur && b.id === cur.id ? h('span', { class: 'muted small' }, '  · current') : null))),
  ]);
}
function exerciseForm(block, day, ex) {
  const editing = !!ex;
  const model = ex ? clone(ex) : { id: uid(), name: '', type: 'lb', sets: 3, note: '', linkAbove: false };
  const known = knownExercises();
  const idx = editing ? day.exercises.indexOf(ex) : day.exercises.length;
  const above = idx > 0 ? day.exercises[idx - 1] : null;
  const linkChk = h('input', { type: 'checkbox', checked: !!(above && model.linkAbove) });

  const nameIn = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Incline DB Press', value: model.name, autocomplete: 'off', autocapitalize: 'words' });
  const sugg = h('div', { class: 'suggest', hidden: true });
  const noteIn = h('input', { class: 'input', type: 'text', placeholder: 'e.g. seat 4, wide grip', value: model.note || '', autocomplete: 'off' });
  const seg = segmented(TYPE_LABEL, model.type, t => { model.type = t; });
  const setsStep = stepper(model, 'sets', 1, () => {}, 'numeric', 1);
  const setType = t => { model.type = t; seg.set(t); };

  const updateSugg = () => {
    clear(sugg);
    const q = nameKey(nameIn.value);
    const matches = q ? [...known.entries()].filter(([k]) => k.includes(q) && k !== q).slice(0, 6) : [];
    sugg.hidden = !matches.length;
    for (const [, def] of matches) sugg.append(h('button', { type: 'button', onclick: () => {
      nameIn.value = def.name; model.name = def.name;
      setType(def.type);
      model.sets = def.sets; setsStep.querySelector('input').value = def.sets;
      if (!noteIn.value && def.note) noteIn.value = def.note;
      clear(sugg); sugg.hidden = true;
    } }, def.name, h('span', { class: 'muted small' }, ` · ${plural(def.sets, 'set')} · ${TYPE_SHORT[def.type]}`)));
  };
  nameIn.addEventListener('input', () => { model.name = nameIn.value; updateSugg(); });

  const onSave = async () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Give the exercise a name'); nameIn.focus(); return; }
    model.name = name;
    model.note = noteIn.value.trim();
    model.sets = Math.max(1, Math.min(20, Math.round(model.sets || 1)));
    model.linkAbove = !!(above && linkChk.checked);
    if (editing) {
      const oldKey = nameKey(ex.name), newKey = nameKey(name);
      if (oldKey !== newKey) {
        const affected = data.sessions.filter(s => Object.values(s.entries).some(e => e.exerciseId === ex.id && entryLogged(e)));
        if (affected.length) {
          const yes = await confirmSheet({
            title: 'Rename in history too?',
            message: `${plural(affected.length, 'past session')} logged "${ex.name}". Rename them if this is the same exercise with a corrected name. Keep them if this is a different exercise, so its history starts fresh.`,
            ok: 'Rename history', cancel: 'Keep history as is',
          });
          if (yes) for (const s of affected) for (const e of Object.values(s.entries)) if (e.exerciseId === ex.id) { e.name = name; e.nameKey = newKey; }
        }
      }
      Object.assign(ex, model);
    } else {
      day.exercises.push(model);
    }
    save(); closeSheet(); render();
  };

  const actions = [h('button', { class: 'btn full primary', onclick: onSave }, editing ? 'Save' : 'Add exercise')];
  if (editing) {
    actions.push(h('div', { class: 'row gap' },
      h('button', { class: 'btn', disabled: idx === 0, onclick: () => { move(day.exercises, idx, idx - 1); save(); closeSheet(); render(); } }, '↑ Move up'),
      h('button', { class: 'btn', disabled: idx === day.exercises.length - 1, onclick: () => { move(day.exercises, idx, idx + 1); save(); closeSheet(); render(); } }, '↓ Move down')));
    actions.push(h('button', { class: 'btn full ghost danger', onclick: async () => {
      if (await confirmSheet({ title: `Remove ${ex.name}?`, message: 'Past sessions keep their logged numbers.', ok: 'Remove', danger: true })) {
        day.exercises.splice(idx, 1); save(); closeSheet(); render();
      }
    } }, 'Remove from this day'));
  }
  openSheet([
    h('h2', { class: 'sheet-title' }, editing ? 'Edit exercise' : `Add to ${day.name}`),
    h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn, sugg),
    h('div', { class: 'field' }, h('span', {}, 'Type'), seg),
    h('div', { class: 'field' }, h('span', {}, 'Sets'), setsStep),
    h('label', { class: 'field' }, h('span', {}, 'Sticky note'), noteIn),
    above ? h('label', { class: 'checkrow' }, linkChk, h('span', {}, 'Superset with ', h('b', {}, above.name), h('span', { class: 'muted small' }, ' (done together, round by round)'))) : null,
    h('div', { class: 'sheet-actions' }, actions),
  ]);
  if (!editing) nameIn.focus();
}

// ============================================================ History
let historyTab = 'sessions';
function viewHistory(app) {
  app.append(topbar('History'));
  const body = h('div');
  const show = t => { historyTab = t; clear(body); (t === 'sessions' ? historySessions : historyExercises)(body); };
  app.append(segmented({ sessions: 'Sessions', exercises: 'Exercises' }, historyTab, show), body);
  show(historyTab);
}
function historySessions(body) {
  const list = sortedSessions().filter(sessionLogged);
  if (!list.length) { body.append(h('p', { class: 'muted center' }, 'Nothing logged yet.')); return; }
  let month = '';
  for (const s of list) {
    const m = s.date.slice(0, 7);
    if (m !== month) { month = m; const d = parseYmd(s.date); body.append(h('h3', { class: 'month' }, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`)); }
    const block = blockById(s.blockId), day = dayById(block, s.dayId);
    const n = Object.values(s.entries).filter(entryLogged).length;
    body.append(h('button', { class: 'card tap row between', onclick: () => go(`/session/${s.id}`) },
      h('div', {}, h('div', { class: 'strong' }, `${fmtDate(s.date, { weekday: true, absolute: true })} · ${day ? day.name : s.dayName}`),
        h('div', { class: 'muted small' }, `${block ? block.name : s.blockName} · ${plural(n, 'exercise')}`)),
      svgIcon(ICON.chevron, 18)));
  }
}
function historyExercises(body) {
  const stats = new Map();
  for (const s of data.sessions) for (const e of Object.values(s.entries)) {
    if (!entryLogged(e)) continue;
    const c = stats.get(e.nameKey) || { name: e.name, n: 0, last: '' };
    c.n++;
    if (s.date > c.last) { c.last = s.date; c.name = e.name; }
    stats.set(e.nameKey, c);
  }
  const list = [...stats.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (!list.length) { body.append(h('p', { class: 'muted center' }, 'Nothing logged yet.')); return; }
  for (const [k, c] of list) body.append(h('button', { class: 'card tap row between', onclick: () => go(`/exercise/${encodeURIComponent(k)}`) },
    h('div', {}, h('div', { class: 'strong' }, c.name), h('div', { class: 'muted small' }, `${plural(c.n, 'session')} · last ${fmtDate(c.last)}`)),
    svgIcon(ICON.chevron, 18)));
}
function viewExercise(app, key) {
  const perfs = [];
  for (const s of sortedSessions()) for (const e of Object.values(s.entries)) if (e.nameKey === key && entryLogged(e)) perfs.push({ s, e });
  app.append(topbar(perfs[0] ? perfs[0].e.name : key, plural(perfs.length, 'session'), { back: '/history' }));
  if (!perfs.length) app.append(h('p', { class: 'muted center' }, 'No history for this exercise yet.'));
  for (const { s, e } of perfs) {
    const block = blockById(s.blockId), day = dayById(block, s.dayId);
    app.append(h('button', { class: 'card tap', onclick: () => go(`/session/${s.id}`) },
      h('div', { style: 'flex:1; min-width:0' },
        h('div', { class: 'muted small' }, `${fmtDate(s.date, { weekday: true, absolute: true })} · ${day ? day.name : s.dayName}`),
        h('div', { class: 'strong', style: 'font-variant-numeric: tabular-nums' }, fmtSets(e) || '—'),
        e.note ? h('div', { class: 'muted small' }, e.note) : null),
      svgIcon(ICON.chevron, 18)));
  }
}

// ============================================================ Settings
function viewSettings(app) {
  app.append(topbar('Settings'));
  const st = data.settings;
  const numField = (label, key, hint, min = 0.5) => {
    const input = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: st[key] });
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v) && v >= min) { st[key] = v; save(); } else toast('Enter a number');
      input.value = st[key];
    });
    return h('label', { class: 'field row-field' }, h('span', {}, label, hint ? h('small', { class: 'muted' }, hint) : null), input);
  };
  app.append(h('div', { class: 'card' }, h('h2', {}, 'Steps'),
    numField('Weight step', 'weightStep', 'lb added per tap on + or −'),
    numField('Rep step', 'repStep', null, 1),
    numField('Time step', 'timeStep', 'seconds, for timed exercises', 1)));
  app.append(h('div', { class: 'card' }, h('h2', {}, 'Notes'),
    numField('Past notes shown', 'notesShown', 'under each exercise while logging', 0)));
  app.append(h('div', { class: 'card' }, h('h2', {}, 'Appearance'),
    h('div', { class: 'field row-field' }, h('span', {}, 'Theme'),
      segmented({ auto: 'Auto', light: 'Light', dark: 'Dark' }, st.theme, v => { st.theme = v; save(); applyTheme(); }))));
  const bandsIn = h('input', { class: 'input', type: 'text', value: st.bands.join(', '), placeholder: 'Light, Medium, Heavy' });
  bandsIn.addEventListener('change', () => {
    const list = bandsIn.value.split(',').map(x => x.trim()).filter(Boolean);
    st.bands = list.length ? list : clone(DEFAULTS.settings.bands); bandsIn.value = st.bands.join(', '); save();
  });
  app.append(h('div', { class: 'card' }, h('h2', {}, 'Bands'), h('p', { class: 'muted small' }, 'Comma-separated. These are the choices for band exercises.'), bandsIn));

  const fileIn = h('input', { type: 'file', accept: '.json,application/json' });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importJson(String(reader.result));
    reader.readAsText(f);
  });
  app.append(h('div', { class: 'card' }, h('h2', {}, 'Your data'),
    h('p', { class: 'muted small' }, `Everything is stored only on this device. Export a backup now and then, especially before switching phones. ${plural(data.sessions.filter(sessionLogged).length, 'session')} logged.`),
    h('div', { class: 'sheet-actions', style: 'margin-top:0' },
      h('button', { class: 'btn full primary', onclick: exportData }, 'Export backup'),
      h('button', { class: 'btn full', onclick: copyData }, 'Copy backup as text'),
      h('label', { class: 'btn full filebtn' }, 'Import backup file', fileIn),
      h('button', { class: 'btn full', onclick: pasteImportSheet }, 'Paste backup text'),
      h('button', { class: 'btn full ghost danger', onclick: async () => {
        if (await confirmSheet({ title: 'Erase all data?', message: 'Program, history and settings on this device are deleted. Export a backup first if you might want it back.', ok: 'Erase everything', danger: true })) {
          data = clone(DEFAULTS); save(); applyTheme(); toast('All data erased'); go('/');
        }
      } }, 'Erase all data'))));

  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!standalone) app.append(h('div', { class: 'card' }, h('h2', {}, 'Install'),
    h('p', { class: 'muted small' }, /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'In Safari, tap the Share button, then "Add to Home Screen". The app then opens full-screen, works offline, and iOS will not clear its data.'
      : 'Open this page on your phone and add it to the home screen for a full-screen, offline app.')));
  app.append(h('div', { class: 'version' }, `Lift Log ${APP_VERSION}`));
}
async function exportData() {
  const json = JSON.stringify(data, null, 2);
  const name = `liftlog-backup-${todayStr()}.json`;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Lift Log backup' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
async function copyData() {
  try { await navigator.clipboard.writeText(JSON.stringify(data)); toast('Backup copied to clipboard'); }
  catch (e) { toast('Could not copy: ' + e.message); }
}
function pasteImportSheet() {
  const ta = h('textarea', { class: 'input', rows: 6, placeholder: 'Paste the backup text here' });
  openSheet([
    h('h2', { class: 'sheet-title' }, 'Paste backup'),
    ta,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn full primary', onclick: () => importJson(ta.value) }, 'Import'),
      h('button', { class: 'btn full ghost', onclick: closeSheet }, 'Cancel')),
  ]);
  ta.focus();
}
async function importJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { toast('That is not valid backup text'); return; }
  if (!parsed || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.sessions)) { toast('This is not a Lift Log backup'); return; }
  const n = parsed.sessions.length;
  if (!await confirmSheet({ title: 'Replace all data?', message: `The backup has ${plural(parsed.blocks.length, 'block')} and ${plural(n, 'session')}. Everything currently on this device will be replaced.`, ok: 'Replace', danger: true })) return;
  data = migrate(parsed); save(); applyTheme(); toast('Backup imported'); go('/');
}

// ============================================================ boot
applyTheme();
buildTabs();
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && route().name === 'home') render(); });
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker not registered', e));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
