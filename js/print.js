/* ============================================================
   JAGS v2 · Impresión
   UNA selección, tres formatos (wristband, call sheet, playbook)
   y el panel de opciones completo que tenía el v1: layout de
   tarjeta, medidas en pulgadas, grosor de ruta, etiqueta, zonas
   y copias.

   Regla de dibujo en papel: SOLO la jugada. Sin marcas de yarda,
   sin números de profundidad, sin cuadrícula. La única referencia
   es la línea de scrimmage, porque sin ella el dibujo no se lee.
   ============================================================ */

import { FIELD, fullPath, depthOf } from './model.js';

const FORMATS = {
  wristband: { name:'Wristband', note:'Tarjetas para la muñequera' },
  callsheet: { name:'Call Sheet', note:'Hoja de mano, carta vertical' },
  playbook:  { name:'Playbook',   note:'Una jugada por página con notas' },
};
export const formats = FORMATS;

/* Layouts de tarjeta: cuántas jugadas entran en UNA tarjeta física. */
export const LAYOUTS = {
  '1': { cols:1, rows:1, label:'1' },
  '2': { cols:2, rows:1, label:'2' },
  '3': { cols:3, rows:1, label:'3' },
  '4': { cols:2, rows:2, label:'4' },
  '6': { cols:3, rows:2, label:'6' },
  '8': { cols:4, rows:2, label:'8' },
};

export const WIDTHS  = [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.5];
export const HEIGHTS = [2, 2.25, 2.5, 2.75, 3, 3.5, 4];
export const WEIGHTS = [
  { val:'thin',   label:'Fino'   },
  { val:'medium', label:'Medio'  },
  { val:'thick',  label:'Grueso' },
];
export const LABEL_MODES = [
  { val:'number', label:'Número' },
  { val:'name',   label:'Nombre' },
  { val:'both',   label:'Ambos'  },
  { val:'none',   label:'Ninguna'},
];

export const DEFAULTS = {
  layout: '6',
  cardW: 4.5,
  cardH: 2.5,
  copies: 1,
  weight: 'medium',
  labelMode: 'both',
  zones: false,
  showDepths: false,
  cutMarks: true,
  cols: 2,           // solo Call Sheet
};

/* ============================================================
   Tinta: convención de acetato, alto contraste sobre papel.
   Ofensiva en colores plenos bien separados en tono Y en
   luminancia, para que se distingan también fotocopiados en
   gris y a un brazo de distancia bajo sol vertical.
   ============================================================ */
const OFF_INK = {
  X:  '#0b3fd4',   // azul
  H:  '#067a3e',   // verde
  Y:  '#b5008a',   // magenta
  C:  '#c85200',   // naranja quemado
  QB: '#111827',   // grafito casi negro
};
const DEF_INK = {
  D1:'#c2101c', D2:'#7c1d0b', D3:'#8a6100', D4:'#8e0b3a', D5:'#b03030',
};
export const ink = (p) => p.side === 'off'
  ? (OFF_INK[p.label] || '#0b3fd4')
  : (DEF_INK[p.label] || '#c2101c');

/* Grosor y tamaño de pieza medidos en PULGADAS DE PAPEL, no en unidades
   del lienzo. Una celda de wristband mide 1.4" y una de playbook 7": si
   el trazo se define en unidades del viewBox, en la muñequera sale como
   un pelo y en el playbook como un plumón. Definido en pulgadas, el
   dibujo se ve igual de grueso en las tres salidas. */
const STROKE_IN = { thin:0.018, medium:0.028, thick:0.042 };
const RADIUS_IN = { thin:0.072, medium:0.085, thick:0.100 };
const FALLBACK_CELL = { w: 3.4, h: 2 };

/* ============================================================
   thumb(play, opts) — miniatura SVG recortada al área de acción.
   opts: { withDefense, showDepths, weight, zones }
   ============================================================ */
let markerSeq = 0;

export function thumb(pl, opts = {}) {
  const { withDefense = null, showDepths = false, weight = 'medium', zones = false,
          cell = FALLBACK_CELL } = opts;
  const pieces = [...pl.pieces, ...(withDefense ? withDefense.pieces : [])];

  // Recorte al área real de acción.
  const ys = [FIELD.losY, FIELD.losY + 46];
  const xs = [60, FIELD.w - 60];
  pieces.forEach(p => {
    [{ x:p.x, y:p.y }, ...p.route, ...p.motion].forEach(q => { ys.push(q.y); xs.push(q.x); });
  });
  const raw = {
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
  };

  /* Unidades del viewBox por pulgada de papel. La dimensión que manda es
     la que se queda corta al encajar el dibujo en la celda (meet). */
  const upi = (w, h) => Math.max(w / cell.w, h / cell.h);
  let u = upi(raw.x1 - raw.x0, raw.y1 - raw.y0);
  let r = (RADIUS_IN[weight] || RADIUS_IN.medium) * u;
  // El margen depende del radio y el radio del margen: una pasada basta.
  let pad = r * 1.5;
  u = upi((raw.x1 - raw.x0) + pad * 2, (raw.y1 - raw.y0) + pad * 2);
  r = (RADIUS_IN[weight] || RADIUS_IN.medium) * u;
  pad = r * 1.5;
  const sw = (STROKE_IN[weight] || STROKE_IN.medium) * u;

  const y0 = Math.max(0, raw.y0 - pad);
  const y1 = Math.min(FIELD.h, raw.y1 + pad);
  const x0 = Math.max(0, raw.x0 - pad);
  const x1 = Math.min(FIELD.w, raw.x1 + pad);
  const uid = `t${++markerSeq}`;

  let defs = '';
  pieces.forEach(p => {
    // markerUnits fijo: la flecha no crece con el grosor de la ruta.
    defs += `<marker id="${uid}-${p.side}-${p.label}" viewBox="0 0 10 10" refX="8.5" refY="5"`
         +  ` markerWidth="${sw * 2.8}" markerHeight="${sw * 2.8}" markerUnits="userSpaceOnUse" orient="auto-start-reverse">`
         +  `<path d="M0 0 L10 5 L0 10 z" fill="${ink(p)}"/></marker>`;
  });

  let s = `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" xmlns="http://www.w3.org/2000/svg"`
        + ` preserveAspectRatio="xMidYMid meet"><defs>${defs}</defs>`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#ffffff"/>`;

  if (zones) {
    // Corte corto/profundo a 10 yardas, como relleno sutil. Es la única
    // pista de profundidad admitida cuando se piden zonas.
    const zy = FIELD.losY - 100;
    if (zy > y0) s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${Math.min(zy, y1) - y0}" fill="#0f172a" fill-opacity="0.045"/>`;
  }

  // Línea de scrimmage: la única referencia del campo.
  s += `<line x1="${x0}" y1="${FIELD.losY}" x2="${x1}" y2="${FIELD.losY}" stroke="#0f172a" stroke-width="${sw * 0.55}"/>`;

  pieces.forEach(p => {
    const c = ink(p);
    const m = fullPath(p, 'motion');
    if (m.length > 1) {
      s += `<path d="${m.map((q,i)=>`${i?'L':'M'}${q.x} ${q.y}`).join(' ')}" fill="none" stroke="${c}"`
        +  ` stroke-width="${sw * 0.5}" stroke-dasharray="3 3" opacity="0.65"/>`;
    }
    const rt = fullPath(p, 'route');
    if (rt.length > 1) {
      const dash = p.style === 'dashed' ? ` stroke-dasharray="${sw * 1.8} ${sw * 1.2}"` : '';
      const cap  = p.cap === 'arrow' ? ` marker-end="url(#${uid}-${p.side}-${p.label})"` : '';
      s += `<path d="${rt.map((q,i)=>`${i?'L':'M'}${q.x} ${q.y}`).join(' ')}" fill="none" stroke="${c}"`
        +  ` stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}${cap}/>`;
      const e = rt[rt.length - 1];
      if (p.cap === 'dot')   s += `<circle cx="${e.x}" cy="${e.y}" r="${sw * 0.8}" fill="${c}"/>`;
      if (p.cap === 'block') s += `<line x1="${e.x - r * 0.85}" y1="${e.y}" x2="${e.x + r * 0.85}" y2="${e.y}" stroke="${c}" stroke-width="${sw}"/>`;
      if (showDepths) {
        const d = depthOf(e.y);
        if (d) s += `<text x="${e.x + r * 0.7}" y="${e.y - r * 0.55}" font-size="${r * 1.1}" font-family="monospace" font-weight="700" fill="${c}">${d}y</text>`;
      }
    }
    if (p.side === 'off') {
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}"/>`
        +  `<text x="${p.x}" y="${p.y + r * 0.37}" text-anchor="middle" font-size="${r * 1.05}" font-weight="700" font-family="system-ui" fill="#fff">${p.label}</text>`;
    } else {
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#fff" stroke="${c}" stroke-width="${sw * 0.6}"/>`
        +  `<text x="${p.x}" y="${p.y + r * 0.37}" text-anchor="middle" font-size="${r * 0.95}" font-weight="700" font-family="system-ui" fill="${c}">${p.label}</text>`;
    }
  });
  return s + '</svg>';
}

/* ============================================================
   Celda de jugada dentro de una tarjeta de wristband.
   ============================================================ */
function cell(pl, n, o) {
  const num  = String(n).padStart(2, '0');
  const show = o.labelMode;
  const head = show === 'none' ? '' : `<div class="w-h">`
    + (show === 'number' || show === 'both' ? `<span class="w-n">${num}</span>` : '')
    + (show === 'name'   || show === 'both' ? `<span class="w-t">${escapeHTML(pl.name)}</span>` : '')
    + `</div>`;
  return `<div class="w-cell">${head}<div class="w-fig">${thumb(pl, o)}</div></div>`;
}

function emptyCell() { return `<div class="w-cell w-empty"></div>`; }

/* Tarjetas físicas: cada una con su grilla interna de jugadas. */
/* Pulgadas útiles de UNA celda, descontando bordes, gaps y el encabezado
   de la celda. Es lo que el dibujo tiene realmente para ocupar. */
export function cellSize(o) {
  const lay = LAYOUTS[o.layout] || LAYOUTS['6'];
  const head = o.labelMode === 'none' ? 0 : 0.13;
  return {
    w: Math.max(0.5, (o.cardW - 0.22 - 0.06 * (lay.cols - 1)) / lay.cols),
    h: Math.max(0.4, (o.cardH - 0.22 - 0.06 * (lay.rows - 1)) / lay.rows - head),
  };
}

function wristbandCards(plays, o) {
  const lay = LAYOUTS[o.layout] || LAYOUTS['6'];
  const per = lay.cols * lay.rows;
  const cards = [];
  for (let i = 0; i < plays.length; i += per) cards.push(plays.slice(i, i + per));
  if (!cards.length) cards.push([]);

  const co = { ...o, cell: cellSize(o) };
  const html = [];
  for (let c = 0; c < o.copies; c++) {
    cards.forEach((group, gi) => {
      const cells = group.map((pl, j) => cell(pl, gi * per + j + 1, co));
      while (cells.length < per) cells.push(emptyCell());
      html.push(`<div class="w-card"${o.cutMarks ? ' data-cut="1"' : ''}>
        <div class="w-grid">${cells.join('')}</div>
      </div>`);
    });
  }
  return html.join('');
}

/* ============================================================
   buildSheet(plays, format, meta, options)
   ============================================================ */
export function buildSheet(plays, format, meta = {}, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const f = FORMATS[format] || FORMATS.wristband;
  const lay = LAYOUTS[o.layout] || LAYOUTS['6'];
  const { team = 'JAGS', rival = '', date = new Date().toISOString().slice(0, 10) } = meta;

  let body;
  if (format === 'wristband') {
    body = `<div class="w-sheet">${wristbandCards(plays, o)}</div>`;
  } else {
    const cols = format === 'playbook' ? 1 : o.cols;
    // 8.5" de carta - 20mm de margen = 7.71" útiles, menos los gaps.
    const cw = (7.71 - 0.1 * (cols - 1)) / cols - 0.18;
    const co = { ...o, cell: { w: cw, h: cw * 0.62 } };
    const card = (pl, i) => `<article class="p-card">
      <header><span class="p-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="p-name">${escapeHTML(pl.name)}</span>
        ${[pl.category, pl.situation].filter(Boolean).length
          ? `<span class="p-tag">${escapeHTML([pl.category, pl.situation].filter(Boolean).join(' · '))}</span>` : ''}
      </header>
      <div class="p-field">${thumb(pl, co)}</div>
      ${format === 'playbook' && pl.notes ? `<p class="p-notes">${escapeHTML(pl.notes)}</p>` : ''}
    </article>`;
    body = `<div class="p-grid" style="grid-template-columns:repeat(${cols},1fr)">${plays.map(card).join('')}</div>`;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${escapeHTML(team)} · ${f.name}</title>
<style>
  @page { size: letter portrait; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 12px/1.35 system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .p-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid #0f172a;
            padding-bottom: 5px; margin-bottom: 9px; }
  .p-head h1 { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; }
  .p-head .m { font-family: ui-monospace, monospace; font-size: 10px; color: #475569; margin-left: auto; }

  /* ---------- Wristband: tarjetas de tamaño físico exacto ---------- */
  .w-sheet { display: flex; flex-wrap: wrap; gap: 6mm; }
  .w-card { width: ${o.cardW}in; height: ${o.cardH}in; border: 1.2px solid #0f172a; border-radius: 3px;
            padding: 2mm; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
  .w-card[data-cut] { outline: 1px dashed #94a3b8; outline-offset: 2mm; }
  .w-grid { display: grid; height: 100%; gap: 1.4mm;
            grid-template-columns: repeat(${lay.cols}, 1fr); grid-template-rows: repeat(${lay.rows}, 1fr); }
  .w-cell { border: 0.8px solid #cbd5e1; border-radius: 2px; padding: 1mm; display: flex;
            flex-direction: column; min-height: 0; overflow: hidden; }
  .w-empty { border-style: dashed; }
  .w-h { display: flex; align-items: baseline; gap: 1.2mm; margin-bottom: 0.6mm; }
  .w-n { font-family: ui-monospace, monospace; font-weight: 700; font-size: ${lay.cols > 3 ? 8 : 10}px; }
  .w-t { font-weight: 800; font-size: ${lay.cols > 3 ? 7 : 9}px; text-transform: uppercase;
         letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .w-fig { flex: 1; min-height: 0; }
  .w-fig svg { width: 100%; height: 100%; display: block; }

  /* ---------- Call Sheet / Playbook ---------- */
  .p-grid { display: grid; gap: 7px; }
  .p-card { border: 1px solid #0f172a; border-radius: 4px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
  .p-card header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
  .p-num { font-family: ui-monospace, monospace; font-weight: 700; font-size: 13px; }
  .p-name { font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .02em; }
  .p-tag { margin-left: auto; font-size: 9px; color: #475569; font-family: ui-monospace, monospace; }
  .p-field svg { width: 100%; height: auto; display: block; }
  .p-notes { margin-top: 6px; font-size: 11px; color: #334155; border-top: 1px solid #cbd5e1; padding-top: 5px; }
  ${format === 'playbook' ? '.p-card { break-after: page; page-break-after: always; } .p-card:last-child { break-after: auto; page-break-after: auto; }' : ''}
  @media screen { body { padding: 16px; } }
</style></head><body>
  <div class="p-head">
    <h1>${escapeHTML(team)} · ${f.name}</h1>
    ${rival ? `<span>vs ${escapeHTML(rival)}</span>` : ''}
    <span class="m">${escapeHTML(date)} · ${plays.length} jugada${plays.length === 1 ? '' : 's'}${
      format === 'wristband' ? ` · ${o.cardW}"×${o.cardH}" · ${lay.label}/tarjeta${o.copies > 1 ? ` · ${o.copies} copias` : ''}` : ''}</span>
  </div>
  ${body}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));<\/script>
</body></html>`;
}

/* Vista previa de UNA tarjeta, para el panel de opciones en pantalla. */
export function previewCard(plays, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const lay = LAYOUTS[o.layout] || LAYOUTS['6'];
  const per = lay.cols * lay.rows;
  const group = plays.slice(0, per);
  const co = { ...o, cell: cellSize(o) };
  const cells = group.map((pl, j) => cell(pl, j + 1, co));
  while (cells.length < per) cells.push(emptyCell());
  return `<div class="wbprev" style="aspect-ratio:${o.cardW} / ${o.cardH}">
    <div class="wbprev-grid" style="grid-template-columns:repeat(${lay.cols},1fr);grid-template-rows:repeat(${lay.rows},1fr)">
      ${cells.join('')}
    </div></div>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function openSheet(plays, format, meta, options) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(buildSheet(plays, format, meta, options));
  w.document.close();
  return true;
}
