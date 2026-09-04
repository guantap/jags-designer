/* ============================================================
   JAGS v2 · Render de cancha
   Un solo renderizador para ofensiva y defensiva. La diferencia
   entre lados es el estilo del trazo, no el código.
   ============================================================ */

import { FIELD, ZONES, fullPath, pointAt, pathLength, depthOf, OFF_LABELS, DEF_LABELS } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

export const colorOf = (p) => p.side === 'off'
  ? `var(--off-${p.label})`
  : `var(--def-${(DEF_LABELS.indexOf(p.label) + 1) || 1})`;

/* Trazo suavizado tipo Catmull-Rom, o quebrado si smooth=false. */
function pathD(pts, smooth) {
  if (pts.length < 2) return '';
  if (!smooth || pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6},` +
         ` ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* Zigzag para motion pre-snap: convención de pizarrón. */
function zigzagD(pts, amp = 4, step = 11) {
  if (pts.length < 2) return '';
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(2, Math.floor(len / step));
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    for (let k = 0; k <= n; k++) {
      const t = k / n, s = (k % 2 === 0 ? 1 : -1) * (k === 0 || k === n ? 0 : amp);
      out.push({ x: a.x + (b.x - a.x) * t - uy * s, y: a.y + (b.y - a.y) * t + ux * s });
    }
  }
  return out.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
}

function defs(svg) {
  const d = el('defs');
  [...OFF_LABELS.map(l => ['off', l]), ...DEF_LABELS.map(l => ['def', l])].forEach(([side, label]) => {
    const c = side === 'off' ? `var(--off-${label})` : `var(--def-${DEF_LABELS.indexOf(label) + 1})`;
    const m = el('marker', { id:`ar-${side}-${label}`, viewBox:'0 0 10 10', refX:'8.5', refY:'5',
      markerWidth:'4', markerHeight:'4', orient:'auto-start-reverse' });
    m.appendChild(el('path', { d:'M0 0 L10 5 L0 10 z', fill:c }));
    d.appendChild(m);
    const t = el('marker', { id:`bl-${side}-${label}`, viewBox:'0 0 10 10', refX:'5', refY:'5',
      markerWidth:'5', markerHeight:'5', orient:'auto-start-reverse' });
    t.appendChild(el('path', { d:'M8 0 L8 10', stroke:c, 'stroke-width':'3', fill:'none' }));
    d.appendChild(t);
  });
  svg.appendChild(d);
}

/* ============================================================
   render(svg, opts)
   opts: { off, def, showZones, showDepths, smooth, selected,
           t (0..1 progreso de animación, null = estático), sim }
   ============================================================ */
export function render(svg, opts) {
  const { off, def, showZones = true, showDepths = false, smooth = false,
          selected = null, t = null, sim = null, showGrid = false } = opts;

  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${FIELD.w} ${FIELD.h}`);
  defs(svg);

  svg.appendChild(el('rect', { x:0, y:0, width:FIELD.w, height:FIELD.h, fill:'var(--field-bg)' }));

  // ZONAS COMO AREAS. Una zona es una region, no una caja: se lee por
  // relleno. Asi el corte corto/profundo salta a la vista sin agregar
  // una cuarta linea punteada gris que compita con las rutas.
  if (showZones) {
    // Los rellenos sangran hasta el borde del campo: si dejan margen,
    // la zona vuelve a leerse como una caja y eso es justo lo que se evita.
    ZONES.forEach(z => {
      const deep = z.y + z.h <= FIELD.losY - 95;
      const x = z.x <= 22 ? 0 : z.x;
      const w = (z.x + z.w >= FIELD.w - 22 ? FIELD.w : z.x + z.w) - x;
      svg.appendChild(el('rect', { x, y:z.y, width:w, height:z.h,
        fill: deep ? 'var(--field-zone-deep)' : 'var(--field-zone-short)' }));
    });
  }

  // Marcas de yarda: la capa mas callada de todas.
  for (let d = 5; d <= 20; d += 5) {
    const y = FIELD.losY - d * FIELD.pxPerYard;
    svg.appendChild(el('line', { x1:26, y1:y, x2:FIELD.w - 26, y2:y,
      stroke:'var(--field-yard)', 'stroke-width':0.75, 'stroke-dasharray':'1.5 8' }));
    const lab = el('text', { x:8, y:y + 3, fill:'var(--field-label)', 'font-size':8.5,
      'font-family':'var(--mono)', opacity:0.75 });
    lab.textContent = `${d}y`;
    svg.appendChild(lab);
  }

  if (showGrid) {
    for (let x = 0; x <= FIELD.w; x += 15) svg.appendChild(el('line', { x1:x, y1:0, x2:x, y2:FIELD.h, stroke:'var(--field-line)', 'stroke-width':0.4, opacity:0.5 }));
    for (let y = 0; y <= FIELD.h; y += 15) svg.appendChild(el('line', { x1:0, y1:y, x2:FIELD.w, y2:y, stroke:'var(--field-line)', 'stroke-width':0.4, opacity:0.5 }));
  }

  if (showZones) {
    // Solo las divisiones INTERNAS entre zonas, no el marco de cada caja.
    const seen = new Set();
    ZONES.forEach(z => {
      [[z.x, z.y, z.x, z.y + z.h], [z.x + z.w, z.y, z.x + z.w, z.y + z.h]].forEach(([x1, y1, x2, y2]) => {
        if (x1 <= 22 || x1 >= FIELD.w - 22) return;   // los bordes de cancha no se dibujan
        const k = `${x1}:${y1}`;
        if (seen.has(k)) return;
        seen.add(k);
        svg.appendChild(el('line', { x1, y1, x2, y2, stroke:'var(--field-zone-edge)',
          'stroke-width':1.2, 'stroke-dasharray':'4 5' }));
      });
      // La columna izquierda (26px) es de las marcas de yarda: las etiquetas
      // de zona no se meten ahi.
      const lx = Math.max(z.x + 10, 32);
      const lab = el('text', { x:lx, y:z.y + 16, fill:'var(--field-label)', 'font-size':8.5,
        'font-family':'var(--mono)', 'font-weight':'600', 'letter-spacing':'0.14em' });
      lab.textContent = z.name;
      svg.appendChild(lab);
    });
  }

  // Línea de scrimmage
  svg.appendChild(el('line', { x1:0, y1:FIELD.losY, x2:FIELD.w, y2:FIELD.losY,
    stroke:'var(--field-los)', 'stroke-width':2 }));
  // Línea de rush a 7 yardas (regla IFAF)
  svg.appendChild(el('line', { x1:0, y1:FIELD.losY - 70, x2:FIELD.w, y2:FIELD.losY - 70,
    stroke:'var(--field-los)', 'stroke-width':1, 'stroke-dasharray':'3 6', opacity:0.55 }));
  const rl = el('text', { x:FIELD.w - 8, y:FIELD.losY - 74, 'text-anchor':'end',
    fill:'var(--field-los)', 'font-size':8, 'font-family':'var(--mono)',
    'font-weight':'600', 'letter-spacing':'0.1em', opacity:0.8 });
  rl.textContent = 'RUSH 7y';
  svg.appendChild(rl);

  // Burbujas de zona de los defensores (solo estático, estorban en animación)
  if (def && t === null) {
    // Solo la zona de la pieza seleccionada se rellena. Las demas quedan en
    // contorno tenue: cinco burbujas opacas ahogan la cancha.
    def.pieces.filter(p => p.duty.type === 'zone').forEach(p => {
      const e = endPoint(p);
      const on = selected === p.id;
      svg.appendChild(el('circle', { cx:e.x, cy:e.y, r:p.duty.radius || 80,
        fill: on ? colorOf(p) : 'none', 'fill-opacity': on ? 0.10 : 0,
        stroke:colorOf(p), 'stroke-opacity': on ? 0.55 : 0.16,
        'stroke-width':1, 'stroke-dasharray':'4 6' }));
    });
  }

  const all = [...(def ? def.pieces : []), ...(off ? off.pieces : [])];
  all.forEach(p => drawTrails(svg, p, smooth, showDepths, t));
  all.forEach(p => drawPiece(svg, p, selected, t, sim));
}

/* Avance de una pieza a los t segundos: recorre su trazo a velocidad real. */
const V_PIECE = 85; // px/s
export function progressOf(pts, tSec) {
  const total = pathLength(pts);
  if (total === 0) return 1;
  return Math.max(0, Math.min(1, (V_PIECE * tSec) / total));
}

function endPoint(p) {
  const r = fullPath(p, 'route');
  return r.length > 1 ? r[r.length - 1] : { x:p.x, y:p.y };
}

function drawTrails(svg, p, smooth, showDepths, t) {
  const c = colorOf(p);

  if (p.motion.length) {
    svg.appendChild(el('path', { d: zigzagD(fullPath(p, 'motion')), fill:'none',
      stroke:c, 'stroke-width':1.6, opacity:0.6, 'stroke-linecap':'round' }));
  }

  const pts = fullPath(p, 'route');
  if (pts.length < 2) return;

  const dash = p.style === 'dashed' ? '7 5' : null;
  const attrs = { d: pathD(pts, smooth), fill:'none', stroke:c, 'stroke-width':2.4,
    'stroke-linecap':'round', 'stroke-linejoin':'round' };
  if (dash) attrs['stroke-dasharray'] = dash;
  if (t === null) {
    if (p.cap === 'arrow') attrs['marker-end'] = `url(#ar-${p.side}-${p.label})`;
    if (p.cap === 'block') attrs['marker-end'] = `url(#bl-${p.side}-${p.label})`;
  }
  if (!attrs.d) return;
  const path = el('path', attrs);
  svg.appendChild(path);

  // El trazo se revela conforme avanza el reloj de la jugada.
  if (t !== null) {
    const total = path.getTotalLength();
    const f = progressOf(pts, t);
    path.style.strokeDasharray = dash ? dash : `${total}`;
    if (!dash) path.style.strokeDashoffset = `${total * (1 - f)}`;
    else path.style.opacity = String(0.35 + 0.65 * f);
  }

  if (p.cap === 'dot' && t === null) {
    const e = pts[pts.length - 1];
    svg.appendChild(el('circle', { cx:e.x, cy:e.y, r:3.4, fill:c }));
  }

  if (showDepths && t === null) {
    const e = pts[pts.length - 1];
    const d = depthOf(e.y);
    if (d !== 0) {
      const lab = el('text', { x:e.x + 8, y:e.y - 6, fill:c, 'font-size':9,
        'font-family':'var(--mono)', 'font-weight':'600' });
      lab.textContent = `${d}y`;
      svg.appendChild(lab);
    }
  }
}

function drawPiece(svg, p, selected, t, sim) {
  const c = colorOf(p);
  let pos = { x:p.x, y:p.y };

  if (t !== null) {
    const m = fullPath(p, 'motion');
    const r = fullPath(p, 'route');
    if (r.length > 1) pos = pointAt(r, progressOf(r, t));
    else if (m.length > 1) pos = m[m.length - 1];
  }

  const g = el('g', { class:'piece', 'data-id':p.id, style:'cursor:grab' });
  const isSel = selected === p.id;

  if (isSel) g.appendChild(el('circle', { cx:pos.x, cy:pos.y, r:16, fill:'none',
    stroke:c, 'stroke-width':1.5, opacity:0.55 }));

  // Ofensiva: círculo lleno. Defensiva: contorno grueso (convención de pizarrón).
  if (p.side === 'off') {
    g.appendChild(el('circle', { cx:pos.x, cy:pos.y, r:11, fill:c,
      stroke:'var(--field-bg)', 'stroke-width':2 }));
  } else {
    g.appendChild(el('circle', { cx:pos.x, cy:pos.y, r:11, fill:'var(--field-bg)',
      stroke:c, 'stroke-width':2.6 }));
  }

  const txt = el('text', { x:pos.x, y:pos.y + 3.6, 'text-anchor':'middle',
    'font-size':9.5, 'font-weight':'700', 'font-family':'var(--font)',
    fill: p.side === 'off' ? 'var(--field-bg)' : c, 'pointer-events':'none' });
  txt.textContent = p.label;
  g.appendChild(txt);

  // Marca de responsabilidad defensiva
  if (p.side === 'def' && t === null) {
    const tag = { man:'M', zone:'Z', blitz:'B', spy:'S' }[p.duty.type] || '';
    if (tag) {
      const b = el('text', { x:pos.x + 12, y:pos.y - 9, 'font-size':8, 'font-weight':'700',
        'font-family':'var(--mono)', fill:c, 'pointer-events':'none' });
      b.textContent = p.duty.type === 'man' ? `M:${p.duty.target || '?'}` : tag;
      g.appendChild(b);
    }
  }

  // Halo de "abierto" durante la simulación
  if (sim && p.side === 'off') {
    const r = sim.receivers && sim.receivers.find(x => x.label === p.label);
    if (r && r.open) g.appendChild(el('circle', { cx:pos.x, cy:pos.y, r:17, fill:'none',
      stroke:'var(--ok)', 'stroke-width':2, opacity:0.85 }));
  }

  svg.appendChild(g);
}

/* Convierte coordenadas de puntero a coordenadas de cancha. */
export function toField(svg, evt) {
  const r = svg.getBoundingClientRect();
  const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
  const cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - r.top;
  return { x: (cx / r.width) * FIELD.w, y: (cy / r.height) * FIELD.h };
}
