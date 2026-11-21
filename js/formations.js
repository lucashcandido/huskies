// Eigene Formationen: werden im Personnel angelegt und stehen danach im Playbook
// neben den Standard-Formationen zur Auswahl (Schlüssel 'cf_<id>').

import { db, upsert, remove, uid, persist } from './store.js?v=202611211248';
import { FORMATIONS, CX, isEligible, OFFENSE_PERSONNEL, formationPlayers, relRoutes, offenseInFormation, personnelOf, applyRunScheme } from './football.js?v=202611211248';
import { buildDefense } from './defense.js?v=202611211248';
import { scoped, currentTeamId } from './team.js?v=202611211248';

export const keyOf = f => 'cf_' + f.id;

/** Trägt die Formationen des aktiven Teams in FORMATIONS ein (vor jedem Rendern aufrufen) */
export function registerCustomFormations() {
  for (const k of Object.keys(FORMATIONS)) if (k.startsWith('cf_')) delete FORMATIONS[k];
  for (const f of scoped('formations')) {
    FORMATIONS[keyOf(f)] = {
      label: f.name, personnel: f.personnel, custom: true, family: familyFromPlayers(f.players),
      players: () => f.players.map(p => ({ role: p.role, pos: p.pos, x: p.x, y: p.y })),
    };
  }
}

/** 3 oder mehr Receiver auf einer Seite → „Trips“-Familie (für Routen-Übertragung) */
export function familyFromPlayers(players) {
  const wide = players.filter(p => isEligible(p) && !(['RB', 'FB'].includes(p.pos) && Math.abs(p.x - CX) < 4 && p.y < -3));
  const l = wide.filter(p => p.x < CX).length, r = wide.length - l;
  return Math.max(l, r) >= 3 ? 'trips' : 'doubles';
}

/** Startaufstellung für eine neue Formation: passende Standard-Formation oder Rollen des Personnels */
export function startPlayers(personnel, fromKey) {
  if (fromKey && FORMATIONS[fromKey]) return formationPlayers(fromKey).map(({ role, pos, x, y }) => ({ role, pos, x, y }));
  const std = Object.entries(FORMATIONS).find(([, f]) => !f.custom && f.personnel === personnel);
  if (std) return formationPlayers(std[0]).map(({ role, pos, x, y }) => ({ role, pos, x, y }));
  return (OFFENSE_PERSONNEL[personnel]?.slots || []).map((s, i) => ({ role: s.role, pos: s.pos, x: 4 + i * 4, y: -1 }));
}

export function playsUsing(f) { return scoped('plays').filter(p => p.formation === keyOf(f)); }

export function saveFormation(f) {
  const isNew = !db().formations.some(x => x.id === f.id);
  if (isNew) { f.id = f.id || uid('form'); f.teamId = f.teamId || currentTeamId(); }
  upsert('formations', f);
  registerCustomFormations();
  // Spielzüge in dieser Formation übernehmen die neue Aufstellung, Routen laufen mit
  const key = keyOf(f);
  let n = 0;
  for (const p of scoped('plays').filter(x => x.formation === key)) {
    const rel = relRoutes(p.offense, personnelOf(key));
    p.offense = offenseInFormation(key, rel).players;
    if (p.playType === 'run' && p.runScheme) applyRunScheme(p.offense, p.runScheme);
    if (!p.defenseLocked) p.defense = buildDefense(p.offense, p.concept, 'auto').players;
    n++;
  }
  if (n) persist();
  return n;
}

export function deleteFormation(f) { remove('formations', f.id); registerCustomFormations(); }

/** Spiegelt eine Aufstellung (rechts ↔ links) */
export function mirror(players) {
  const W = CX * 2;
  return players.map(p => ({ ...p, x: Math.round((W - p.x) * 2) / 2 }));
}
