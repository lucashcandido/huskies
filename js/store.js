// Zentrale Datenhaltung. Alles liegt lokal im Browser (localStorage) und kann
// als JSON exportiert / importiert werden. Die Funktionen hier sind die einzige
// Stelle, die den Speicher anfasst – ein späteres Backend (z. B. Supabase)
// lässt sich daher hier austauschen, ohne die Views zu ändern.

const KEY = 'huskies.v1';
const VERSION = 1;

const empty = () => ({ version: VERSION, athletes: [], rosters: [], personnel: [], plays: [] });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') return { ...empty(), ...s };
    }
  } catch (e) { console.warn('Konnte Daten nicht laden', e); }
  return empty();
}

export function db() { return state; }

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert('Speichern fehlgeschlagen (Speicher voll?): ' + e.message); }
  listeners.forEach(f => f());
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function get(coll, id) { return state[coll].find(x => x.id === id) || null; }

export function upsert(coll, obj) {
  obj.updatedAt = new Date().toISOString();
  const arr = state[coll];
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  persist();
  return obj;
}

export function remove(coll, id) {
  state[coll] = state[coll].filter(x => x.id !== id);
  if (coll === 'athletes') {
    // Verweise auf gelöschte Athlet:innen überall entfernen
    state.rosters.forEach(r => { r.members = r.members.filter(m => m.athleteId !== id); });
    state.personnel.forEach(p => p.slots.forEach(s => { if (s.athleteId === id) s.athleteId = null; }));
  }
  if (coll === 'rosters') {
    state.personnel.forEach(p => { if (p.rosterId === id) p.rosterId = null; });
  }
  if (coll === 'personnel') {
    state.plays.forEach(pl => {
      if (pl.offensePersonnelId === id) pl.offensePersonnelId = null;
      if (pl.defensePersonnelId === id) pl.defensePersonnelId = null;
    });
  }
  persist();
}

export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text, mode = 'replace') {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.athletes)) throw new Error('Keine gültige Huskies-Datei');
  if (mode === 'replace') {
    state = { ...empty(), ...data };
  } else {
    // Zusammenführen: gleiche IDs werden überschrieben, neue ergänzt
    for (const coll of ['athletes', 'rosters', 'personnel', 'plays']) {
      for (const item of data[coll] || []) {
        const i = state[coll].findIndex(x => x.id === item.id);
        if (i >= 0) state[coll][i] = item; else state[coll].push(item);
      }
    }
  }
  delete state.exportedAt;
  persist();
}

export function resetAll() { state = empty(); persist(); }

export function replaceState(next) { state = { ...empty(), ...next }; persist(); }
