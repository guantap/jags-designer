/* ============================================================
   JAGS v2 · Superficie Cancha
   Mediodía, sol vertical, treinta segundos entre series.
   No es el diseñador en pantalla chica: es otra herramienta.
   Consultar rápido, mostrar en grande, y anotar qué pasó.
   ============================================================ */

import { SITUATIONS } from '../model.js';
import { thumb } from '../print.js';
import * as store from '../store.js';

const RESULTS = [
  { id:'td',   label:'TD',        tone:'ok'   },
  { id:'first',label:'1er down',  tone:'ok'   },
  { id:'gain', label:'Avance',    tone:'warn' },
  { id:'inc',  label:'Incompleto',tone:'bad'  },
  { id:'sack', label:'Capturado', tone:'bad'  },
  { id:'int',  label:'Intercep.', tone:'bad'  },
];

export function renderCancha(root, ctx) {
  const { plays } = ctx;
  const ui = store.loadUI();
  const st = { side: ui.canchaSide || 'off', sit: '', open: null, gd: store.loadGameday() };

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'cancha';
  root.appendChild(wrap);

  const persist = () => { store.saveGameday(st.gd); store.saveUI({ canchaSide: st.side }); };

  const stats = () => {
    const by = {};
    st.gd.log.forEach(e => {
      by[e.playId] = by[e.playId] || { name:e.name, n:0, ok:0 };
      by[e.playId].n++;
      if (e.result === 'td' || e.result === 'first') by[e.playId].ok++;
    });
    return Object.values(by).sort((a, b) => (b.ok / b.n) - (a.ok / a.n) || b.n - a.n);
  };

  const paint = () => {
    const list = plays.filter(p => p.side === st.side && (!st.sit || p.situation === st.sit));

    wrap.innerHTML = `
      <div class="cn-bar">
        <div class="sideswitch">
          <button data-cs="off" aria-pressed="${st.side === 'off'}">Ataque</button>
          <button data-cs="def" aria-pressed="${st.side === 'def'}">Defensa</button>
        </div>
      </div>

      <div class="cn-sits">
        <button class="chip" data-sit="" aria-pressed="${!st.sit}">Todas</button>
        ${SITUATIONS.map(s => `<button class="chip" data-sit="${s}" aria-pressed="${st.sit === s}">${s}</button>`).join('')}
      </div>

      <div class="cn-grid">
        ${list.length ? list.map(p => `
          <button class="cn-card" data-play="${p.id}">
            <span class="cn-fig">${thumb(p, { showDepths:true })}</span>
            <span class="cn-name">${p.name}</span>
            ${p.situation ? `<span class="cn-sit">${p.situation}</span>` : ''}
          </button>`).join('')
        : `<div class="empty"><strong>Nada guardado en este lado</strong>Guarda jugadas desde Diseñar y aparecen acá.</div>`}
      </div>

      <section class="cn-gd">
        <h2>Parte del partido</h2>
        <div class="row">
          <label class="field">Rival<input type="text" id="gd-rival" value="${st.gd.rival}" placeholder="Equipo"></label>
          <label class="field">Fecha<input type="text" id="gd-date" value="${st.gd.date}"></label>
        </div>

        ${st.gd.log.length ? `
          <div class="gd-stats">
            ${stats().map(s => `<div class="gd-stat">
              <b>${s.name}</b><span>${s.ok}/${s.n} · ${Math.round(s.ok / s.n * 100)}%</span></div>`).join('')}
          </div>
          <ol class="gd-log">
            ${st.gd.log.slice().reverse().slice(0, 12).map((e, i) => `
              <li data-tone="${e.tone}"><span>${e.name}</span><b>${e.label}</b>
              <button class="btn ghost sm" data-rm="${st.gd.log.length - 1 - i}">✕</button></li>`).join('')}
          </ol>
          <button class="btn sm" id="gd-clear">Limpiar registro</button>`
        : `<p class="notice">Abre una jugada y marca qué pasó. El registro se queda en este teléfono.</p>`}
      </section>

      ${st.open ? sheet(st.open) : ''}`;

    wrap.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => { st.side = b.dataset.cs; persist(); paint(); });
    wrap.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => { st.sit = b.dataset.sit; paint(); });
    wrap.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
      st.open = plays.find(p => p.id === b.dataset.play); paint();
    });
    const close = wrap.querySelector('#cn-close');
    if (close) close.onclick = () => { st.open = null; paint(); };

    wrap.querySelectorAll('[data-res]').forEach(b => b.onclick = () => {
      const r = RESULTS.find(x => x.id === b.dataset.res);
      st.gd.log.push({ playId:st.open.id, name:st.open.name, result:r.id, label:r.label, tone:r.tone, ts:Date.now() });
      st.open = null; persist(); paint();
    });
    wrap.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      st.gd.log.splice(+b.dataset.rm, 1); persist(); paint();
    });
    const cl = wrap.querySelector('#gd-clear');
    if (cl) cl.onclick = () => { st.gd.log = []; persist(); paint(); };

    const rv = wrap.querySelector('#gd-rival'); if (rv) rv.oninput = (e) => { st.gd.rival = e.target.value; persist(); };
    const dt = wrap.querySelector('#gd-date');  if (dt) dt.oninput = (e) => { st.gd.date = e.target.value; persist(); };
  };

  const sheet = (p) => `
    <div class="cn-sheet" role="dialog" aria-label="${p.name}">
      <header><b>${p.name}</b><button class="btn sm" id="cn-close">Cerrar</button></header>
      <div class="cn-sheet-fig">${thumb(p, { showDepths:true })}</div>
      <p class="notice">¿Qué pasó?</p>
      <div class="cn-res">
        ${RESULTS.map(r => `<button class="btn sm" data-res="${r.id}" data-tone="${r.tone}">${r.label}</button>`).join('')}
      </div>
    </div>`;

  paint();
}
