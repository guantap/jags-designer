/* ============================================================
   JAGS v2 · Persistencia
   Regla dura: nunca se migra sin respaldar primero. El v1 queda
   intacto en su llave original y además se copia a un respaldo
   con sello de tiempo que esta app jamás sobreescribe.
   ============================================================ */

import { migrateV1, coveragePlays } from './model.js';

const K_V1_SAVED = 'jags_designer_saved_v1';
const K_V1_STATE = 'jags_designer_state_v1';
const K_BACKUP   = 'jags_backup_v1_pre_v2';
const K_PLAYS    = 'jags_plays_v2';
const K_UI       = 'jags_ui_v2';

const read  = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (_) { return fb; } };
const write = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

/* Respaldo íntegro de v1. Se escribe una sola vez, nunca se pisa. */
export function backupV1() {
  if (localStorage.getItem(K_BACKUP)) return { already: true };
  const saved = localStorage.getItem(K_V1_SAVED);
  const state = localStorage.getItem(K_V1_STATE);
  if (!saved && !state) return { empty: true };
  write(K_BACKUP, { ts: new Date().toISOString(), saved, state });
  return { created: true, plays: (() => { try { return JSON.parse(saved || '[]').length; } catch (_) { return 0; } })() };
}

export function backupInfo() { return read(K_BACKUP, null); }

/* Descarga el respaldo como archivo, para que no dependa de este navegador. */
export function downloadBackup() {
  const b = backupInfo();
  if (!b) return false;
  const blob = new Blob([JSON.stringify(b, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jags-respaldo-v1-${b.ts.slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

/* ---------------- Playbook ---------------- */

export function loadPlays() {
  const store = read(K_PLAYS, null);
  if (store && Array.isArray(store.plays)) return store.plays;

  // Primer arranque de v2: respaldar, migrar lo ofensivo, sembrar lo defensivo.
  backupV1();
  const migrated = migrateV1(localStorage.getItem(K_V1_SAVED));
  const seeded = [...migrated, ...coveragePlays()];
  savePlays(seeded);
  return seeded;
}

export function savePlays(plays) { return write(K_PLAYS, { v:2, ts:new Date().toISOString(), plays }); }

export function loadUI()      { return read(K_UI, {}); }
export function saveUI(patch) { write(K_UI, { ...loadUI(), ...patch }); }

/* ---------------- Game-day ----------------
   El registro se escribe EN la cancha: vive local y se exporta.
   No viaja en el playbook. */
const K_GD = 'jags_gameday_v2';
export function loadGameday()  { return read(K_GD, { rival:'', date:new Date().toISOString().slice(0,10), log:[], notes:'' }); }
export function saveGameday(g) { return write(K_GD, g); }

/* ---------------- Sincronía (fase 7) ----------------
   El playbook remoto vive en data/playbook.json dentro del repo.
   Lectura de una vía: el celular consume lo que la Mac publicó. */
export async function fetchRemote() {
  try {
    const r = await fetch('data/playbook.json', { cache:'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.plays) ? j : null;
  } catch (_) { return null; }
}

export function exportJSON(plays, name = 'jags-playbook.json') {
  const blob = new Blob([JSON.stringify({ v:2, ts:new Date().toISOString(), plays }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const j = JSON.parse(fr.result);
        resolve(Array.isArray(j) ? j : (j.plays || []));
      } catch (e) { reject(e); }
    };
    fr.onerror = reject;
    fr.readAsText(file);
  });
}
