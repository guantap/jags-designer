/* ============================================================
   JAGS v2 · Orquestador
   ============================================================ */

import {
  FIELD, OFF_LABELS, DEF_LABELS, CATEGORIES, SITUATIONS,
  play, applyFormation, mirrorPlay, clone,
} from './model.js';
import { render, colorOf } from './field.js';
import { Editor } from './draw.js';
import { simulate, matrix, frameAt } from './sim.js';
import * as store from './store.js';
import { renderBook } from './ui/book.js';
import { renderCancha } from './ui/cancha.js';

const $ = (s) => document.querySelector(s);
const svg = $('#field');

const S = {
  plays: store.loadPlays(),
  side: 'off',
  work: { off: play('off', 'Nueva jugada'), def: play('def', 'Nueva defensa') },
  vs: { off: null, def: null },   // vs.off = id de defensa rival; vs.def = id de jugada ofensiva
  currentId: { off: null, def: null },
  tab: 'design',
  showZones: true, showGrid: false, showDepths: false, smooth: false, showRival: true,
  t: null, anim: null,
  ...store.loadUI(),
};

const bySide  = (s) => S.plays.filter(p => p.side === s);
const current = () => S.work[S.side];
const other   = () => (S.side === 'off' ? 'def' : 'off');

function vsPlay() {
  const id = S.vs[S.side];
  const pool = bySide(other());
  return pool.find(p => p.id === id) || pool[0] || null;
}

const editor = new Editor(svg, () => { S.t = null; draw(); renderSide(); persistUI(); });
editor.setPlay(current());

/* ---------------- Simulación ---------------- */
function runSim() {
  const rival = vsPlay();
  if (!rival) return null;
  return S.side === 'off' ? simulate(current(), rival) : simulate(rival, current());
}

/* ---------------- Dibujo ---------------- */
function draw() {
  const sim = S.t !== null ? runSim() : null;
  // El rival se puede ocultar para dibujar limpio. Ocultarlo NO lo saca de
  // la simulacion: solo deja de pintarse.
  const rival = S.showRival ? vsPlay() : null;
  const off = S.side === 'off' ? current() : rival;
  const def = S.side === 'def' ? current() : rival;
  render(svg, {
    off, def,
    showZones: S.showZones, showGrid: S.showGrid, showDepths: S.showDepths,
    smooth: S.smooth, selected: editor.selected, t: S.t,
    sim: sim ? frameAt(sim, S.t) : null,
  });
  $('#hint').textContent = hintText();
  $('#clock').textContent = S.t === null ? 'estático' : `${S.t.toFixed(1)} s`;
}

function hintText() {
  const p = editor.piece;
  if (!p) return '';
  const verb = editor.mode === 'motion' ? 'motion pre-snap' : (S.side === 'def' ? 'caída / responsabilidad' : 'ruta');
  return `${p.label} · clic en la cancha agrega puntos de ${verb} · arrastra la pieza para mover su alineación`;
}

/* ---------------- Selector de piezas ---------------- */
function renderPieces() {
  const wrap = $('#pieces');
  wrap.innerHTML = '';
  current().pieces.forEach(p => {
    const b = document.createElement('button');
    b.className = 'pchip';
    b.setAttribute('aria-pressed', String(editor.selected === p.id));
    b.style.color = colorOf(p);
    b.innerHTML = `<span class="dot ${p.side === 'def' ? 'hollow' : ''}" style="background:${colorOf(p)}">${p.side === 'off' ? p.label : ''}</span><span style="color:var(--ink)">${p.label}</span>`;
    b.onclick = () => { editor.selected = p.id; renderPieces(); draw(); renderSide(); };
    wrap.appendChild(b);
  });
}

/* ---------------- Panel lateral ---------------- */
function renderSide() {
  const el = $('#side');
  el.innerHTML = '';
  el.appendChild(blockPiece());
  el.appendChild(blockSim());
  el.appendChild(blockMatrix());
  el.appendChild(blockSave());
  el.appendChild(blockPlaybook(false));
}

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function block(title) {
  const b = h('section', 'block');
  b.appendChild(h('h2', null, title));
  return b;
}

/* --- Responsabilidad de la pieza seleccionada (solo tiene sentido en defensa) --- */
function blockPiece() {
  const p = editor.piece;
  const b = block(S.side === 'def' ? 'Responsabilidad' : 'Pieza');
  if (!p) return b;

  if (S.side === 'off') {
    b.appendChild(h('p', 'notice', `<b>${p.label}</b> · trazo sólido con flecha. El motion se dibuja en zigzag.`));
    return b;
  }

  const row = h('div', 'row');
  const lt = h('label', 'field', 'Tipo');
  const sel = document.createElement('select');
  [['zone','Zona'],['man','Marca'],['blitz','Blitz'],['spy','Spy']].forEach(([v, n]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = n;
    if (p.duty.type === v) o.selected = true; sel.appendChild(o);
  });
  sel.onchange = () => {
    editor.push();
    p.duty = sel.value === 'zone' ? { type:'zone', radius: p.duty.radius || 80 }
           : sel.value === 'man'  ? { type:'man', target: p.duty.target || 'X' }
           : { type: sel.value };
    p.style = sel.value === 'zone' ? 'dashed' : 'solid';
    p.cap   = sel.value === 'zone' ? 'dot' : 'arrow';
    draw(); renderSide();
  };
  lt.appendChild(sel); row.appendChild(lt);

  if (p.duty.type === 'man') {
    const lm = h('label', 'field', 'Marca a');
    const s2 = document.createElement('select');
    OFF_LABELS.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; if (p.duty.target === l) o.selected = true; s2.appendChild(o); });
    s2.onchange = () => { editor.push(); p.duty.target = s2.value; draw(); renderSide(); };
    lm.appendChild(s2); row.appendChild(lm);
  } else if (p.duty.type === 'zone') {
    const lr = h('label', 'field', `Radio de zona · ${Math.round((p.duty.radius || 80) / 10)}y`);
    const r = document.createElement('input');
    r.type = 'range'; r.min = 40; r.max = 140; r.step = 5; r.value = p.duty.radius || 80;
    r.oninput = () => { p.duty.radius = +r.value; draw(); };
    r.onchange = () => renderSide();
    lr.appendChild(r); row.appendChild(lr);
  }
  b.appendChild(row);
  b.appendChild(h('p', 'notice', 'La zona se dibuja punteada: el trazo es la caída, y el círculo su área de responsabilidad.'));
  return b;
}

/* --- Simulador: lectura por receptor --- */
function blockSim() {
  const b = block('Simulador');
  const rival = vsPlay();
  const pool = bySide(other());

  const lbl = h('label', 'field', S.side === 'off' ? 'Contra la defensa' : 'Contra la jugada');
  const sel = document.createElement('select');
  if (!pool.length) { const o = document.createElement('option'); o.textContent = '—'; sel.appendChild(o); sel.disabled = true; }
  pool.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; if (rival && rival.id === p.id) o.selected = true; sel.appendChild(o); });
  sel.onchange = () => { S.vs[S.side] = sel.value; persistUI(); draw(); renderSide(); };
  lbl.appendChild(sel);
  b.appendChild(lbl);

  if (!rival) {
    b.appendChild(h('div', 'empty', `<strong>Sin ${S.side === 'off' ? 'defensas' : 'jugadas'} guardadas</strong>Guarda una para poder simular.`));
    return b;
  }

  const sim = runSim();
  const v = h('div', 'verdict');
  v.dataset.tone = S.side === 'def'
    ? ({ ok:'bad', bad:'ok', warn:'warn', neutral:'neutral' })[sim.tone]
    : sim.tone;
  if (S.side === 'def') v.appendChild(h('div', 'v-meta', 'Leído desde la ofensiva rival'));
  v.appendChild(h('div', 'v-line', sim.verdict));
  v.appendChild(h('div', 'v-meta',
    `ventana de lanzamiento ${sim.window[0].toFixed(1)}–${sim.window[1].toFixed(1)}s · presión a los ${sim.rushTime.toFixed(1)}s`));
  b.appendChild(v);

  const reads = h('div', 'reads');
  sim.reads.forEach(r => {
    const row = h(r.bestT === null ? 'div' : 'button', 'read');
    row.dataset.st = r.status;
    if (r.bestT !== null) row.title = `Saltar a ${r.bestT.toFixed(1)}s`;
    row.appendChild(h('span', 'lbl', r.label));
    const bar = h('div', 'bar');
    bar.appendChild(h('i', null, '')).style.width = `${Math.min(100, (r.bestSep / 45) * 100)}%`;
    row.appendChild(bar);
    row.appendChild(h('span', 'num',
      r.bestT === null ? 'sin ruta' : `${r.bestSep / 10}y libre · ${r.depth}y · ${r.bestT.toFixed(1)}s`));
    row.onclick = () => { if (r.bestT !== null) { S.t = r.bestT; $('#scrubber').value = r.bestT * 100; draw(); } };
    row.style.cursor = r.bestT === null ? 'default' : 'pointer';
    reads.appendChild(row);
  });
  b.appendChild(reads);
  b.appendChild(h('p', 'notice', 'Clic en un receptor salta al segundo en que queda más abierto.'));
  return b;
}

/* --- Matriz: la jugada contra todo el playbook contrario --- */
function blockMatrix() {
  const b = block('Contra todo el playbook');
  const pool = bySide(other());
  if (!pool.length) { b.appendChild(h('div', 'empty', 'Nada con qué comparar todavía.')); return b; }

  const m = S.side === 'off'
    ? matrix(current(), pool)
    : { rows: pool.map(o => { const s = simulate(o, current()); return { defId:o.id, defName:o.name, score:100 - s.score, tone: s.tone === 'ok' ? 'bad' : s.tone === 'bad' ? 'ok' : 'warn', best: s.reads[0] ? `${s.reads[0].label} · ${s.reads[0].depth}y` : '—', rushTime:s.rushTime }; }).sort((a,c)=>c.score-a.score),
        summary: `Esta defensa contra ${pool.length} jugada${pool.length>1?'s':''} guardada${pool.length>1?'s':''}` };

  b.appendChild(h('p', 'notice', `<b>${m.summary}</b>`));
  const t = h('table', 'matrix');
  t.innerHTML = `<thead><tr><th>${S.side === 'off' ? 'Defensa' : 'Jugada'}</th><th>Mejor opción</th><th>Índice</th></tr></thead>`;
  const tb = document.createElement('tbody');
  m.rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.defName}<div class="mini">presión ${r.rushTime.toFixed(1)}s</div></td><td class="mini">${r.best}</td><td class="sc" data-tone="${r.tone}">${r.score}</td>`;
    tr.style.cursor = 'pointer';
    tr.onclick = () => { S.vs[S.side] = r.defId; persistUI(); draw(); renderSide(); };
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  b.appendChild(t);
  return b;
}

/* --- Guardar --- */
function blockSave() {
  const b = block('Guardar');
  const pl = current();

  const n = h('label', 'field', 'Nombre');
  const ni = document.createElement('input');
  ni.type = 'text'; ni.value = pl.name;
  ni.oninput = () => { pl.name = ni.value; };
  n.appendChild(ni); b.appendChild(n);

  const row = h('div', 'row');
  const c = h('label', 'field', 'Categoría');
  const cs = document.createElement('select');
  cs.appendChild(new Option('—', ''));
  CATEGORIES.forEach(x => cs.appendChild(new Option(x.name, x.id)));
  cs.value = pl.category || '';
  cs.onchange = () => { pl.category = cs.value; };
  c.appendChild(cs); row.appendChild(c);

  const s = h('label', 'field', 'Situación');
  const ss = document.createElement('select');
  ss.appendChild(new Option('—', ''));
  SITUATIONS.forEach(x => ss.appendChild(new Option(x, x)));
  ss.value = pl.situation || '';
  ss.onchange = () => { pl.situation = ss.value; };
  s.appendChild(ss); row.appendChild(s);
  b.appendChild(row);

  const bar = h('div', 'toolbar');
  const save = h('button', 'btn primary', S.currentId[S.side] ? 'Guardar cambios' : 'Guardar jugada');
  save.onclick = () => {
    const copy = clone(pl);
    const id = S.currentId[S.side];
    if (id) { const i = S.plays.findIndex(p => p.id === id); copy.id = id; if (i >= 0) S.plays[i] = copy; else S.plays.unshift(copy); }
    else { S.plays.unshift(copy); S.currentId[S.side] = copy.id; }
    store.savePlays(S.plays);
    renderSide();
  };
  bar.appendChild(save);

  if (S.currentId[S.side]) {
    const nue = h('button', 'btn', 'Guardar como nueva');
    nue.onclick = () => {
      const copy = clone(pl);
      copy.id = `p${Date.now()}`; copy.name = `${pl.name} (copia)`; copy.builtin = false;
      S.plays.unshift(copy); S.currentId[S.side] = copy.id;
      store.savePlays(S.plays); renderSide();
    };
    bar.appendChild(nue);
  }
  b.appendChild(bar);
  return b;
}

/* --- Playbook --- */
function blockPlaybook(full) {
  const b = block(full ? `Playbook · ${S.side === 'off' ? 'ofensivo' : 'defensivo'}` : 'Playbook');
  const list = bySide(S.side);

  if (!list.length) {
    b.appendChild(h('div', 'empty', '<strong>Playbook vacío</strong>Dibuja una jugada y guárdala. Las siete coberturas base ya están en el lado defensivo.'));
    return b;
  }

  const wrap = h('div', 'plays');
  list.forEach(p => {
    const r = h('button', 'playrow');
    r.setAttribute('aria-current', String(S.currentId[S.side] === p.id));
    const meta = [p.category, p.situation, p.builtin ? 'base' : null].filter(Boolean).join(' · ') || '—';
    r.innerHTML = `<span><span class="nm">${p.name}</span><br><span class="mt">${meta}</span></span>`;
    const del = h('span', 'mt', p.builtin ? '' : '✕');
    del.style.padding = '0 .35rem';
    del.onclick = (e) => {
      e.stopPropagation();
      if (p.builtin) return;
      deletePlay(p.id);
      renderSide();
    };
    r.appendChild(del);
    r.onclick = () => {
      S.work[S.side] = clone(p);
      S.currentId[S.side] = p.id;
      editor.setPlay(S.work[S.side]);
      S.t = null;
      renderPieces(); draw(); renderSide();
    };
    wrap.appendChild(r);
  });
  b.appendChild(wrap);

  const bar = h('div', 'toolbar');
  const nu = h('button', 'btn', 'Nueva');
  nu.onclick = () => {
    S.work[S.side] = play(S.side, S.side === 'off' ? 'Nueva jugada' : 'Nueva defensa');
    S.currentId[S.side] = null;
    editor.setPlay(S.work[S.side]);
    renderPieces(); draw(); renderSide();
  };
  // Imprimir y archivo viven en la superficie Playbook: aquí solo se dibuja.
  bar.appendChild(nu);
  b.appendChild(bar);

  const bk = store.backupInfo();
  if (bk) {
    const note = h('p', 'notice', `Respaldo de la versión anterior guardado el ${bk.ts.slice(0,10)}. `);
    const dl = h('button', 'btn ghost sm', 'Descargar respaldo');
    dl.onclick = () => store.downloadBackup();
    note.appendChild(dl);
    b.appendChild(note);
  }
  return b;
}

/* ---------------- Controles ---------------- */
function persistUI() {
  store.saveUI({ side:S.side, showZones:S.showZones, showGrid:S.showGrid,
    showDepths:S.showDepths, smooth:S.smooth, showRival:S.showRival, vs:S.vs, tab:S.tab,
    work:S.work, currentId:S.currentId });
}

function setSide(side) {
  S.side = side;
  $('#side-off').setAttribute('aria-pressed', String(side === 'off'));
  $('#side-def').setAttribute('aria-pressed', String(side === 'def'));
  $('#formations').style.display = side === 'off' ? '' : 'none';
  $('#t-rival').textContent = side === 'def' ? 'Ver ofensiva' : 'Ver defensa';
  $('#t-rival').title = side === 'def'
    ? 'Muestra u oculta la jugada ofensiva rival sobre tu defensa'
    : 'Muestra u oculta la defensa contra la que estas diseñando';
  editor.setPlay(current());
  S.t = null;
  persistUI(); renderPieces(); draw(); renderSide();
}

function toggle(id, key) {
  const b = $(id);
  b.onclick = () => { S[key] = !S[key]; b.setAttribute('aria-pressed', String(S[key])); persistUI(); draw(); };
  b.setAttribute('aria-pressed', String(S[key]));
}

$('#side-off').onclick = () => setSide('off');
$('#side-def').onclick = () => setSide('def');

$('#t-route').onclick  = () => { editor.mode = 'route';  $('#t-route').setAttribute('aria-pressed','true');  $('#t-motion').setAttribute('aria-pressed','false'); draw(); };
$('#t-motion').onclick = () => { editor.mode = 'motion'; $('#t-motion').setAttribute('aria-pressed','true'); $('#t-route').setAttribute('aria-pressed','false'); draw(); };

toggle('#t-zones', 'showZones');
toggle('#t-rival', 'showRival');
toggle('#t-grid', 'showGrid');
toggle('#t-depths', 'showDepths');
toggle('#t-smooth', 'smooth');

$('#formations').querySelectorAll('[data-form]').forEach(b => {
  b.onclick = () => {
    editor.push();
    applyFormation(current(), b.dataset.form);
    $('#formations').querySelectorAll('[data-form]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  };
});

$('#b-mirror').onclick = () => { editor.push(); mirrorPlay(current()); draw(); };
$('#b-undo').onclick   = () => { editor.undo(); renderPieces(); };
$('#b-clear').onclick  = () => editor.clearSide();

const scrub = $('#scrubber');
scrub.oninput = () => { stopAnim(); S.t = +scrub.value / 100; draw(); };

function stopAnim() { if (S.anim) { cancelAnimationFrame(S.anim); S.anim = null; $('#b-play').textContent = 'Animar'; } }

$('#b-play').onclick = () => {
  if (S.anim) { stopAnim(); return; }
  $('#b-play').textContent = 'Detener';
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / 1000;
    S.t = Math.min(4.5, t);
    scrub.value = S.t * 100;
    draw();
    if (S.t < 4.5) S.anim = requestAnimationFrame(step);
    else stopAnim();
  };
  S.anim = requestAnimationFrame(step);
};

function openPlay(p) {
  if (!p) return;
  S.side = p.side;
  S.work[S.side] = clone(p);
  S.currentId[S.side] = p.id;
  editor.setPlay(S.work[S.side]);
  S.t = null;
  setSide(S.side);
  setTab('design');
}

function deletePlay(id) {
  // En sitio: las superficies guardan una referencia al arreglo. Reemplazarlo
  // las deja mirando una copia vieja.
  const i = S.plays.findIndex(x => x.id === id);
  if (i >= 0) S.plays.splice(i, 1);
  Object.keys(S.currentId).forEach(k => { if (S.currentId[k] === id) S.currentId[k] = null; });
  store.savePlays(S.plays);
}

function importPlays() {
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'application/json';
  file.onchange = async () => {
    if (!file.files[0]) return;
    try {
      const incoming = await store.importJSON(file.files[0]);
      const ids = new Set(S.plays.map(p => p.id));
      incoming.forEach(p => { if (!ids.has(p.id)) S.plays.push(p); });
      store.savePlays(S.plays);
      setTab(S.tab);
    } catch (_) { alert('El archivo no es un playbook válido.'); }
  };
  file.click();
}

function pullRemote(remotePlays) {
  const r = store.mergeRemote(S.plays, remotePlays);
  S.plays.splice(0, S.plays.length, ...r.plays);
  store.savePlays(S.plays);
  return r;
}

const TABS = ['design', 'book', 'cancha'];
function setTab(tab) {
  S.tab = TABS.includes(tab) ? tab : 'design';
  TABS.forEach(t => $(`#tab-${t}`).setAttribute('aria-selected', String(t === S.tab)));
  $('#stage').hidden = S.tab !== 'design';
  $('#side').hidden  = S.tab !== 'design';
  $('#book').hidden  = S.tab !== 'book';
  $('#cancha').hidden = S.tab !== 'cancha';
  document.querySelector('.main').dataset.tab = S.tab;
  // El interruptor de lado pertenece al diseñador: en Playbook y Cancha
  // cada superficie tiene el suyo.
  document.querySelector('.topbar .sideswitch').hidden = S.tab !== 'design';

  if (S.tab === 'design') renderSide();
  if (S.tab === 'book')   renderBook($('#book'), {
    plays:S.plays, onOpen:openPlay, onDelete:deletePlay, onImport:importPlays, onPull:pullRemote });
  if (S.tab === 'cancha') {
    document.documentElement.dataset.mode = 'cancha';
    $('#mode-toggle').textContent = 'Cancha';
    renderCancha($('#cancha'), { plays:S.plays });
  }
  persistUI();
}
TABS.forEach(t => { $(`#tab-${t}`).onclick = () => setTab(t); });

$('#mode-toggle').onclick = () => {
  const next = document.documentElement.dataset.mode === 'estudio' ? 'cancha' : 'estudio';
  document.documentElement.dataset.mode = next;
  $('#mode-toggle').textContent = next === 'estudio' ? 'Estudio' : 'Cancha';
  store.saveUI({ mode: next });
};

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); editor.undo(); renderPieces(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const ps = current().pieces;
    const i = ps.findIndex(p => p.id === editor.selected);
    editor.selected = ps[(i + 1) % ps.length].id;
    renderPieces(); draw(); renderSide();
  }
});

/* ---------------- Arranque ---------------- */
if (S.mode) { document.documentElement.dataset.mode = S.mode; $('#mode-toggle').textContent = S.mode === 'estudio' ? 'Estudio' : 'Cancha'; }
setSide(S.side || 'off');
setTab(S.tab || 'design');
