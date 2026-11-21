// Zentrale Datenhaltung.
//
// Lokal liegt alles im localStorage. Damit mehrere Coaches gleichzeitig arbeiten
// können, bekommt jedes Feld eines Datensatzes einen Zeitstempel (_ts). Beim
// Abgleich mit dem gemeinsamen Daten-Repo gewinnt pro Feld die neuere Änderung –
// zwei Coaches, die beim Combine verschiedene Stationen erfassen, überschreiben
// sich also nicht. Messungen werden einzeln (pro Messtag) zusammengeführt,
// Löschungen als Grabstein (_deleted) mitgeführt.
//
// Die Views ändern Objekte teils direkt und rufen dann persist()/upsert() auf.
// Deshalb vergleicht stampAll() den aktuellen Stand mit einer Schattenkopie des
// zuletzt bekannten Stands und stempelt alles, was sich geändert hat.

const KEY = 'huskies.v1';
const DIRTY_KEY = 'huskies.dirty';
const VERSION = 2;
export const COLLS = ['teams', 'athletes', 'rosters', 'personnel', 'formations', 'plays'];
const NESTED = { athletes: 'measurements' };            // Unterlisten, die einzeln zusammengeführt werden
const META = new Set(['_ts', '_mdel', 'updatedAt']);

const emptyDeleted = () => Object.fromEntries(COLLS.map(c => [c, {}]));
const empty = () => ({ version: VERSION, teams: [], athletes: [], rosters: [], personnel: [], formations: [], plays: [], _deleted: emptyDeleted() });


function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') return normalize(s);
    }
  } catch (e) { console.warn('Konnte Daten nicht laden', e); }
  return empty();
}
function normalize(s) {
  const out = { ...empty(), ...s };
  out._deleted = { ...emptyDeleted(), ...(s._deleted || {}) };
  COLLS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
  if (!s.version) out.version = 1;
  return out;
}
function loadDirty() {
  try { return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]')); } catch (e) { return new Set(); }
}

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Reihenfolge-unabhängige Darstellung (Listen nach id, Objekt-Schlüssel sortiert)
function canon(v) {
  if (Array.isArray(v)) {
    const arr = v.map(canon);
    return '[' + (v.every(x => x && x.id) ? arr.map((s, i) => [v[i].id, s]).sort((a, b) => a[0] < b[0] ? -1 : 1).map(x => x[1]) : arr).join(',') + ']';
  }
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function resetShadow(coll) {
  for (const c of coll ? [coll] : COLLS) shadow[c] = new Map(state[c].map(r => [r.id, clone(r)]));
}

function stampNested(rec, old, field, now) {
  let changed = false;
  if (!Array.isArray(rec[field])) rec[field] = [];
  rec._mdel = rec._mdel || {};
  const oldById = new Map((old?.[field] || []).map(m => [m.id, m]));
  const ids = new Set();
  for (const m of rec[field]) {
    ids.add(m.id);
    const o = oldById.get(m.id);
    m._ts = m._ts || {};
    for (const k of new Set([...Object.keys(m), ...Object.keys(o || {})])) {
      if (k === '_ts' || k === 'id') continue;
      if (!o || !same(o[k], m[k])) { m._ts[k] = now; changed = true; }
    }
  }
  for (const id of oldById.keys()) if (!ids.has(id)) { rec._mdel[id] = now; changed = true; }
  return changed;
}

/** Stempelt alle Änderungen seit dem letzten bekannten Stand. */
function stampAll(force = false) {
  const now = Date.now();
  for (const c of COLLS) {
    const sh = shadow[c];
    const seen = new Set();
    for (const rec of state[c]) {
      seen.add(rec.id);
      const old = force ? null : sh.get(rec.id);
      rec._ts = rec._ts || {};
      let ch = false;
      for (const k of new Set([...Object.keys(rec), ...Object.keys(old || {})])) {
        if (META.has(k) || k === 'id') continue;
        if (k === NESTED[c]) { if (stampNested(rec, old, k, now)) ch = true; continue; }
        if (!old || !same(old[k], rec[k])) { rec._ts[k] = now; ch = true; }
      }
      if (ch) { dirty.add(c); rec.updatedAt = new Date(now).toISOString(); }
    }
    for (const id of sh.keys()) if (!seen.has(id)) { state._deleted[c][id] = now; dirty.add(c); }
    resetShadow(c);
  }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]));
  } catch (e) { alert('Speichern fehlgeschlagen (Speicher voll?): ' + e.message); }
}

// ---------- Start (nach allen Hilfsfunktionen, die hier schon gebraucht werden) ----------
let state = load();
let shadow = {};
let dirty = loadDirty();
const listeners = new Set();
resetShadow();
// Daten aus Version 1 (ohne Zeitstempel) einmalig stempeln
if (state.version < VERSION) { state.version = VERSION; stampAll(true); saveLocal(); }

export function db() { return state; }

export function persist() {
  stampAll();
  saveLocal();
  listeners.forEach(f => f({ remote: false }));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function get(coll, id) { return state[coll].find(x => x.id === id) || null; }

export function upsert(coll, obj) {
  const arr = state[coll];
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  persist();
  return obj;
}

export function remove(coll, id) {
  state[coll] = state[coll].filter(x => x.id !== id);
  if (coll === 'athletes') {
    state.rosters.forEach(r => { r.members = r.members.filter(m => m.athleteId !== id); });
    state.personnel.forEach(p => p.slots.forEach(s => { if (s.athleteId === id) s.athleteId = null; }));
  }
  if (coll === 'rosters') state.personnel.forEach(p => { if (p.rosterId === id) p.rosterId = null; });
  if (coll === 'personnel') {
    state.plays.forEach(pl => {
      if (pl.offensePersonnelId === id) pl.offensePersonnelId = null;
      if (pl.defensePersonnelId === id) pl.defensePersonnelId = null;
    });
  }
  persist();
}

// ---------------- Abgleich (wird von sync.js verwendet) ----------------

const maxTs = rec => {
  let m = 0;
  for (const v of Object.values(rec._ts || {})) m = Math.max(m, v);
  for (const f of Object.values(NESTED)) for (const x of rec[f] || []) for (const v of Object.values(x._ts || {})) m = Math.max(m, v);
  return m;
};

function mergeFields(l, r, skip) {
  let changed = false;
  l._ts = l._ts || {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (META.has(k) || k === 'id' || k === skip) continue;
    const rt = r._ts?.[k] || 0, lt = l._ts[k] || 0;
    if (rt > lt) {
      if (r[k] === undefined) delete l[k]; else l[k] = clone(r[k]);
      l._ts[k] = rt; changed = true;
    }
  }
  return changed;
}

function mergeRecord(c, l, r) {
  const field = NESTED[c];
  let changed = mergeFields(l, r, field);
  if ((r.updatedAt || '') > (l.updatedAt || '')) l.updatedAt = r.updatedAt;
  if (field) {
    l._mdel = l._mdel || {};
    for (const [id, t] of Object.entries(r._mdel || {})) if (t > (l._mdel[id] || 0)) { l._mdel[id] = t; changed = true; }
    const mine = new Map((l[field] || []).map(m => [m.id, m]));
    for (const rm of r[field] || []) {
      const lm = mine.get(rm.id);
      if (!lm) { l[field] = l[field] || []; l[field].push(clone(rm)); changed = true; }
      else if (mergeFields(lm, rm)) changed = true;
    }
    const before = (l[field] || []).length;
    l[field] = (l[field] || []).filter(m => Math.max(0, ...Object.values(m._ts || {})) > (l._mdel[m.id] || 0));
    if (l[field].length !== before) changed = true;
  }
  return changed;
}

/** Führt eine Datei aus dem Daten-Repo in den lokalen Stand ein. true = lokal hat sich etwas geändert */
export function mergeRemote(coll, remote) {
  stampAll();                                  // ausstehende lokale Änderungen zuerst stempeln
  let changed = false;
  const del = state._deleted[coll];
  for (const [id, t] of Object.entries(remote?.deleted || {})) if (t > (del[id] || 0)) del[id] = t;
  const byId = new Map(state[coll].map(r => [r.id, r]));
  for (const r of remote?.items || []) {
    if (!r || !r.id) continue;
    const l = byId.get(r.id);
    if (!l) {
      if (maxTs(r) > (del[r.id] || 0)) { const n = clone(r); state[coll].push(n); byId.set(n.id, n); changed = true; }
    } else if (mergeRecord(coll, l, r)) changed = true;
  }
  const before = state[coll].length;
  state[coll] = state[coll].filter(r => maxTs(r) > (del[r.id] || 0));
  if (state[coll].length !== before) changed = true;
  // Hat der lokale Stand etwas, was der entfernte nicht hat? → hochladen
  if (canon(state[coll]) !== canon(remote?.items || []) || canon(state._deleted[coll]) !== canon(remote?.deleted || {})) dirty.add(coll);
  resetShadow(coll);
  saveLocal();
  return changed;
}

export function fileFor(coll) {
  return { v: 1, coll, items: state[coll], deleted: state._deleted[coll] };
}
/** true, wenn der lokale Stand inhaltlich der Datei entspricht (dann ist kein Hochladen nötig) */
export function sameAsRemote(coll, remote) {
  return canon(state[coll]) === canon(remote?.items || []) && canon(state._deleted[coll]) === canon(remote?.deleted || {});
}
export function dirtyColls() { return [...dirty]; }
export function markClean(coll) { dirty.delete(coll); saveLocal(); }
export function markAllDirty() { COLLS.forEach(c => dirty.add(c)); saveLocal(); }
export function notifyRemote() { listeners.forEach(f => f({ remote: true })); }

// ---------------- Import / Export ----------------

export function exportJSON() {
  stampAll();
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text, mode = 'replace') {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.athletes)) throw new Error('Keine gültige Huskies-Datei');
  if (mode === 'replace') {
    replaceState(data);
  } else {
    for (const coll of COLLS) {
      for (const item of data[coll] || []) {
        const i = state[coll].findIndex(x => x.id === item.id);
        const copy = clone(item); delete copy._ts; delete copy._mdel;
        if (i >= 0) state[coll][i] = copy; else state[coll].push(copy);
      }
    }
    persist();
  }
}

/** Ersetzt den lokalen Stand; mit Sync gilt das als Löschen + Neuanlegen und wird an alle verteilt */
export function replaceState(next) {
  const n = normalize(next);
  for (const c of COLLS) {
    state[c] = n[c].map(r => { const x = clone(r); delete x._ts; delete x._mdel; (x[NESTED[c]] || []).forEach(m => delete m._ts); return x; });
    // vorhandene IDs gelten als neu → alle Felder werden frisch gestempelt; fehlende werden gelöscht
    for (const r of state[c]) shadow[c].delete(r.id);
  }
  persist();
}

export function resetAll() {
  COLLS.forEach(c => { state[c] = []; });
  persist();
}
