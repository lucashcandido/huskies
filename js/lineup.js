// Aufstellung (Basis-Formationen) für das Roster.
// Jede:r Spieler:in hat optional einen festen Platz (athlete.slot, z. B. 'O:X')
// und eine Reihenfolge darin (athlete.depth). Wer keinen Platz hat, wird
// automatisch nach Position auf die passenden Plätze verteilt (Reihenfolge
// nach 40-yd-Zeit). Per Drag & Drop wird der Stand dann fest gespeichert.

import { metricValue } from './metrics.js';

// col/row beziehen sich auf ein 9-spaltiges Raster (Darstellung im Roster)
export const OFFENSE_SLOTS = [
  { id: 'O:X',  label: 'X',  pos: 'WR', col: 1, row: 1, name: 'Split End' },
  { id: 'O:LT', label: 'LT', pos: 'OL', col: 3, row: 1, name: 'Left Tackle' },
  { id: 'O:LG', label: 'LG', pos: 'OL', col: 4, row: 1, name: 'Left Guard' },
  { id: 'O:C',  label: 'C',  pos: 'OL', col: 5, row: 1, name: 'Center' },
  { id: 'O:RG', label: 'RG', pos: 'OL', col: 6, row: 1, name: 'Right Guard' },
  { id: 'O:RT', label: 'RT', pos: 'OL', col: 7, row: 1, name: 'Right Tackle' },
  { id: 'O:Y',  label: 'Y',  pos: 'TE', col: 8, row: 1, name: 'Tight End' },
  { id: 'O:Z',  label: 'Z',  pos: 'WR', col: 9, row: 2, name: 'Flanker' },
  { id: 'O:H',  label: 'H',  pos: 'WR', col: 2, row: 2, name: 'Slot' },
  { id: 'O:QB', label: 'QB', pos: 'QB', col: 5, row: 2, name: 'Quarterback' },
  { id: 'O:RB', label: 'RB', pos: 'RB', col: 5, row: 3, name: 'Running Back' },
];
export const DEFENSE_SLOTS = [
  { id: 'D:FS',  label: 'FS', pos: 'S',  col: 4, row: 1, name: 'Free Safety' },
  { id: 'D:SS',  label: 'SS', pos: 'S',  col: 6, row: 1, name: 'Strong Safety' },
  { id: 'D:CBL', label: 'CB', pos: 'CB', col: 1, row: 2, name: 'Cornerback links' },
  { id: 'D:W',   label: 'W',  pos: 'LB', col: 3, row: 2, name: 'Will LB' },
  { id: 'D:M',   label: 'M',  pos: 'LB', col: 5, row: 2, name: 'Mike LB' },
  { id: 'D:S',   label: 'S',  pos: 'LB', col: 7, row: 2, name: 'Sam LB' },
  { id: 'D:CBR', label: 'CB', pos: 'CB', col: 9, row: 2, name: 'Cornerback rechts' },
  { id: 'D:LE',  label: 'DE', pos: 'DL', col: 3, row: 3, name: 'Defensive End links' },
  { id: 'D:LT',  label: 'DT', pos: 'DL', col: 4, row: 3, name: 'Defensive Tackle' },
  { id: 'D:RT',  label: 'DT', pos: 'DL', col: 6, row: 3, name: 'Defensive Tackle' },
  { id: 'D:RE',  label: 'DE', pos: 'DL', col: 7, row: 3, name: 'Defensive End rechts' },
];
export const EXTRA_SLOTS = [
  { id: 'ST:K',  label: 'K',  pos: 'K',  name: 'Kicker' },
  { id: 'ST:P',  label: 'P',  pos: 'P',  name: 'Punter' },
  { id: 'ST:LS', label: 'LS', pos: 'LS', name: 'Long Snapper' },
  { id: '-',     label: 'Weitere', pos: null, name: 'Ohne festen Platz (FB, ATH, …)' },
];
export const ALL_SLOTS = [...OFFENSE_SLOTS, ...DEFENSE_SLOTS, ...EXTRA_SLOTS];
export const SLOT = Object.fromEntries(ALL_SLOTS.map(s => [s.id, s]));

const forty = a => metricValue(a, 'forty') ?? 99;
const byDepth = (x, y) => ((x.depth || 999) - (y.depth || 999)) || (forty(x) - forty(y)) || (x.lastName || '').localeCompare(y.lastName || '');

/** slotId → Spieler in Reihenfolge (1. = Starter). Feste Plätze zuerst, danach automatisch verteilte. */
export function lineup(players) {
  const out = Object.fromEntries(ALL_SLOTS.map(s => [s.id, []]));
  const auto = new Set(), pending = {};
  for (const a of players) {
    if (a.slot && out[a.slot]) out[a.slot].push(a);
    else (pending[a.position || ''] = pending[a.position || ''] || []).push(a);
  }
  for (const [pos, list] of Object.entries(pending)) {
    const slots = ALL_SLOTS.filter(s => s.pos && s.pos === pos);
    list.sort(byDepth);
    list.forEach((a, i) => { auto.add(a); out[slots.length ? slots[i % slots.length].id : '-'].push(a); });
  }
  for (const id in out) out[id].sort((x, y) => (auto.has(x) - auto.has(y)) || (auto.has(x) ? 0 : byDepth(x, y)));
  out._auto = auto;
  return out;
}

/** Platz eines Spielers (fest oder automatisch) */
export function slotOf(a, lu) {
  for (const [id, list] of Object.entries(lu)) if (id !== '_auto' && list.includes(a)) return id;
  return '-';
}
