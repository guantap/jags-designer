/* ============================================================
   JAGS v2 · Superficie Playbook
   Una selección, tres formatos de salida. Antes eran tres modales
   con su propia lista de jugadas cada uno.
   ============================================================ */

import { CATEGORIES } from '../model.js';
import { thumb, formats, openSheet } from '../print.js';
import * as store from '../store.js';

export function renderBook(root, ctx) {
  const { plays, onOpen, onDelete } = ctx;
  const ui = store.loadUI();
  const state = {
    side: ui.bookSide || 'off',
    picked: new Set(ui.bookPicked || []),
    format: ui.bookFormat || 'wristband',
    cat: '',
    team: ui.team || 'JAGS',
    rival: ui.rival || '',
  };

  const save = () => store.saveUI({ bookSide:state.side, bookFormat:state.format,
    bookPicked:[...state.picked], team:state.team, rival:state.rival });

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'book';
  root.appendChild(wrap);

  const paint = () => {
    const list = plays.filter(p => p.side === state.side && (!state.cat || p.category === state.cat));
    const picked = list.filter(p => state.picked.has(p.id));

    wrap.innerHTML = `
      <div class="book-bar">
        <div class="sideswitch" role="group" aria-label="Playbook">
          <button data-bs="off" aria-pressed="${state.side === 'off'}">Ofensivo</button>
          <button data-bs="def" aria-pressed="${state.side === 'def'}">Defensivo</button>
        </div>
        <select id="bk-cat" aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          ${CATEGORIES.map(c => `<option value="${c.id}" ${state.cat === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <button class="btn sm" id="bk-all">Todas</button>
        <button class="btn sm" id="bk-none">Ninguna</button>
      </div>

      <div class="book-main">
        <div class="book-grid">
          ${list.length ? list.map(p => `
            <label class="pcard ${state.picked.has(p.id) ? 'on' : ''}">
              <input type="checkbox" data-pick="${p.id}" ${state.picked.has(p.id) ? 'checked' : ''}>
              <span class="pcard-fig">${thumb(p, { showDepths:false })}</span>
              <span class="pcard-name">${p.name}</span>
              <span class="pcard-meta">${[p.category, p.situation, p.builtin ? 'base' : ''].filter(Boolean).join(' · ') || '—'}</span>
              <span class="pcard-acts">
                <button class="btn ghost sm" data-open="${p.id}">Abrir</button>
                ${p.builtin ? '' : `<button class="btn ghost sm" data-del="${p.id}">Borrar</button>`}
              </span>
            </label>`).join('')
          : `<div class="empty"><strong>Playbook ${state.side === 'off' ? 'ofensivo' : 'defensivo'} vacío</strong>
             ${state.side === 'off' ? 'Dibuja una jugada en Diseñar y guárdala.' : 'Las siete coberturas base deberían estar aquí. Si no aparecen, revisa el filtro.'}</div>`}
        </div>

        <aside class="book-out">
          <section class="block">
            <h2>Imprimir</h2>
            <div class="fmt">
              ${Object.entries(formats).map(([k, f]) => `
                <button class="fmt-btn" data-fmt="${k}" aria-pressed="${state.format === k}">
                  <b>${f.name}</b><span>${f.note}</span></button>`).join('')}
            </div>
            <div class="row">
              <label class="field">Equipo<input type="text" id="bk-team" value="${state.team}"></label>
              <label class="field">Rival<input type="text" id="bk-rival" value="${state.rival}"></label>
            </div>
            <button class="btn primary" id="bk-print" ${picked.length ? '' : 'disabled'}>
              Imprimir ${picked.length} jugada${picked.length === 1 ? '' : 's'}
            </button>
            <p class="notice">La selección es una sola: el formato solo cambia el layout de salida.</p>
          </section>

          <section class="block">
            <h2>Archivo</h2>
            <div class="toolbar">
              <button class="btn sm" id="bk-export">Exportar JSON</button>
              <button class="btn sm" id="bk-import">Importar JSON</button>
            </div>
            ${(() => { const bk = store.backupInfo();
              return bk ? `<p class="notice">Respaldo de la versión anterior del ${bk.ts.slice(0,10)}.
                <button class="btn ghost sm" id="bk-backup">Descargar respaldo</button></p>` : ''; })()}
            <p class="notice"><b>Tus jugadas viven en este navegador.</b> Exportá el JSON si vas a abrir JAGS desde otro dispositivo.</p>
          </section>
        </aside>
      </div>`;

    wrap.querySelectorAll('[data-bs]').forEach(b => b.onclick = () => { state.side = b.dataset.bs; save(); paint(); });
    wrap.querySelector('#bk-cat').onchange = (e) => { state.cat = e.target.value; paint(); };
    wrap.querySelector('#bk-all').onclick  = () => { list.forEach(p => state.picked.add(p.id)); save(); paint(); };
    wrap.querySelector('#bk-none').onclick = () => { list.forEach(p => state.picked.delete(p.id)); save(); paint(); };

    wrap.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => {
      c.checked ? state.picked.add(c.dataset.pick) : state.picked.delete(c.dataset.pick);
      save(); paint();
    });
    wrap.querySelectorAll('[data-open]').forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      onOpen(plays.find(p => p.id === b.dataset.open));
    });
    wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      onDelete(b.dataset.del); paint();
    });

    wrap.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { state.format = b.dataset.fmt; save(); paint(); });
    wrap.querySelector('#bk-team').oninput  = (e) => { state.team = e.target.value; save(); };
    wrap.querySelector('#bk-rival').oninput = (e) => { state.rival = e.target.value; save(); };

    wrap.querySelector('#bk-print').onclick = () => {
      const sel = plays.filter(p => state.picked.has(p.id));
      if (!sel.length) return;
      if (!openSheet(sel, state.format, { team:state.team, rival:state.rival }))
        alert('El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes para este sitio.');
    };

    wrap.querySelector('#bk-export').onclick = () => store.exportJSON(plays);
    wrap.querySelector('#bk-import').onclick = () => ctx.onImport();
    const bkb = wrap.querySelector('#bk-backup');
    if (bkb) bkb.onclick = () => store.downloadBackup();
  };

  paint();
}
