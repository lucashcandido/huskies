// Aktives Team: wird einmal pro Gerät gewählt und gilt dann für alle Ansichten.
// Athlet:innen, Roster, Personnel und Spielzüge gehören jeweils zu einem Team (teamId).

import { db, upsert, uid, persist } from './store.js?v=202611211016';

const KEY = 'huskies.team';
export const TEAM_COLLS = ['athletes', 'rosters', 'personnel', 'plays'];

export function teams() {
  return [...db().teams].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'de'));
}

export function currentTeam() {
  const id = localStorage.getItem(KEY);
  return db().teams.find(t => t.id === id) || null;
}
export function currentTeamId() { return currentTeam()?.id || null; }

export function setTeam(id) { localStorage.setItem(KEY, id); }
export function clearTeam() { localStorage.removeItem(KEY); }

/** Einträge einer Sammlung, die zum aktiven Team gehören */
export function scoped(coll) {
  const id = currentTeamId();
  return db()[coll].filter(x => x.teamId === id);
}

/** Neues Team anlegen. Beim allerersten Team werden vorhandene Daten ohne Team diesem zugeordnet. */
export function createTeam(name) {
  const first = db().teams.length === 0;
  const t = { id: uid('team'), name: name.trim(), order: db().teams.length };
  db().teams.push(t);
  if (first) adoptUntagged(t.id);
  persist();
  return t;
}

export function adoptUntagged(teamId) {
  let n = 0;
  for (const c of TEAM_COLLS) for (const x of db()[c]) if (!x.teamId) { x.teamId = teamId; n++; }
  return n;
}

export function untaggedCount() {
  return TEAM_COLLS.reduce((n, c) => n + db()[c].filter(x => !x.teamId).length, 0);
}

export function renameTeam(id, name) {
  const t = db().teams.find(x => x.id === id);
  if (t && name.trim()) { t.name = name.trim(); upsert('teams', t); }
}

export function teamUsage(id) {
  return Object.fromEntries(TEAM_COLLS.map(c => [c, db()[c].filter(x => x.teamId === id).length]));
}
