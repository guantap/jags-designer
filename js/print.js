/* ============================================================
   JAGS v2 · Impresión
   Antes eran tres superficies con su propio modal, su propia
   selección y su propio render (wristband, call sheet, playbook).
   Ahora es UNA selección y tres formatos: cambia el layout, no
   los datos ni el dibujo.
   ============================================================ */

import { FIELD, fullPath, depthOf } from './model.js';

const FORMATS = {
  wristband: { name:'Wristband', cols:3, note:'Tarjetas chicas para la muñequera' },
  callsheet: { name:'Call Sheet', cols:2, note:'Hoja de mano, carta vertical' },
  playbook:  { name:'Playbook',   cols:1, note:'Una jugada por página con notas' },
};
export const formats = FORMATS;

/* Miniatura SVG de una jugada, recortada al área real de acción.
   Es el mismo dibujo del lienzo, sin cromo: sin zonas, sin cuadrícula. */
export function thumb(pl, opts = {}) {
  const { withDefense = null, showDepths = true } = opts;
  const pieces = [...pl.pieces, ...(withDefense ? withDefense.pieces : [])];

  // viewBox ajustado al contenido para que la jugada llene la tarjeta
  const ys = [FIELD.losY, FIELD.losY + 50];
  const xs = [40, FIELD.w - 40];
  pieces.forEach(p => {
    [{ x:p.x, y:p.y }, ...p.route, ...p.motion].forEach(q => { ys.push(q.y); xs.push(q.x); });
  });
  const pad = 26;
  const y0 = Math.max(0, Math.min(...ys) - pad);
  const y1 = Math.min(FIELD.h, Math.max(...ys) + pad);
  const x0 = Math.max(0, Math.min(...xs) - pad);
  const x1 = Math.min(FIELD.w, Math.max(...xs) + pad);
  const vb = `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
  const uid = `t${pl.id}`.replace(/[^a-zA-Z0-9]/g, '');

  const ink = (p) => p.side === 'off' ? OFF_INK[p.label] || '#1d4ed8' : DEF_INK[p.label] || '#b91c1c';

  let defs = '';
  pieces.forEach(p => {
    defs += `<marker id="${uid}-${p.side}-${p.label}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${ink(p)}"/></marker>`;
  });

  let s = `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><defs>${defs}</defs>`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#ffffff"/>`;
  s += `<line x1="${x0}" y1="${FIELD.losY}" x2="${x1}" y2="${FIELD.losY}" stroke="#0f172a" stroke-width="1.6"/>`;

  pieces.forEach(p => {
    const c = ink(p);
    const m = fullPath(p, 'motion');
    if (m.length > 1) s += `<path d="${m.map((q,i)=>`${i?'L':'M'}${q.x} ${q.y}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.7"/>`;
    const r = fullPath(p, 'route');
    if (r.length > 1) {
      const dash = p.style === 'dashed' ? ' stroke-dasharray="6 4"' : '';
      const cap = p.cap === 'arrow' ? ` marker-end="url(#${uid}-${p.side}-${p.label})"` : '';
      s += `<path d="${r.map((q,i)=>`${i?'L':'M'}${q.x} ${q.y}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${dash}${cap}/>`;
      if (p.cap === 'dot') { const e = r[r.length-1]; s += `<circle cx="${e.x}" cy="${e.y}" r="3" fill="${c}"/>`; }
      if (showDepths) {
        const e = r[r.length - 1], d = depthOf(e.y);
        if (d) s += `<text x="${e.x + 7}" y="${e.y - 5}" font-size="9" font-family="monospace" font-weight="700" fill="${c}">${d}y</text>`;
      }
    }
    if (p.side === 'off') {
      s += `<circle cx="${p.x}" cy="${p.y}" r="10" fill="${c}"/><text x="${p.x}" y="${p.y+3.5}" text-anchor="middle" font-size="9" font-weight="700" font-family="system-ui" fill="#fff">${p.label}</text>`;
    } else {
      s += `<circle cx="${p.x}" cy="${p.y}" r="10" fill="#fff" stroke="${c}" stroke-width="2.4"/><text x="${p.x}" y="${p.y+3.5}" text-anchor="middle" font-size="9" font-weight="700" font-family="system-ui" fill="${c}">${p.label}</text>`;
    }
  });
  return s + '</svg>';
}

/* Tinta de impresión: opaca sobre papel, no los tokens de pantalla. */
const OFF_INK = { X:'#1d4ed8', H:'#0f766e', Y:'#6d28d9', C:'#15803d', QB:'#1e3a8a' };
const DEF_INK = { D1:'#b91c1c', D2:'#c2410c', D3:'#a16207', D4:'#9f1239', D5:'#be123c' };

/* ============================================================
   Una selección, tres formatos.
   ============================================================ */
export function buildSheet(plays, format, meta = {}) {
  const f = FORMATS[format] || FORMATS.wristband;
  const { team = 'JAGS', rival = '', date = new Date().toISOString().slice(0, 10) } = meta;

  const card = (pl, i) => {
    const notes = format === 'playbook' && pl.notes
      ? `<p class="p-notes">${escapeHTML(pl.notes)}</p>` : '';
    const tags = [pl.category, pl.situation].filter(Boolean).join(' · ');
    return `<article class="p-card">
      <header><span class="p-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="p-name">${escapeHTML(pl.name)}</span>
        ${tags ? `<span class="p-tag">${escapeHTML(tags)}</span>` : ''}</header>
      <div class="p-field">${thumb(pl)}</div>
      ${notes}
    </article>`;
  };

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${escapeHTML(team)} · ${f.name}</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 12px/1.4 system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }
  .p-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px; }
  .p-head h1 { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; }
  .p-head .m { font-family: ui-monospace, monospace; font-size: 10px; color: #475569; margin-left: auto; }
  .p-grid { display: grid; grid-template-columns: repeat(${f.cols}, 1fr); gap: 8px; }
  .p-card { border: 1px solid #0f172a; border-radius: 4px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
  .p-card header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
  .p-num { font-family: ui-monospace, monospace; font-weight: 700; font-size: 13px; }
  .p-name { font-weight: 700; font-size: ${format === 'wristband' ? 11 : 13}px; text-transform: uppercase; letter-spacing: .02em; }
  .p-tag { margin-left: auto; font-size: 9px; color: #475569; font-family: ui-monospace, monospace; }
  .p-field { width: 100%; }
  .p-field svg { width: 100%; height: auto; display: block; }
  .p-notes { margin-top: 6px; font-size: 11px; color: #334155; border-top: 1px solid #cbd5e1; padding-top: 5px; }
  ${format === 'playbook' ? '.p-card { break-after: page; page-break-after: always; } .p-card:last-child { break-after: auto; page-break-after: auto; }' : ''}
  @media screen { body { padding: 16px; max-width: 900px; margin: 0 auto; } }
</style></head><body>
  <div class="p-head">
    <h1>${escapeHTML(team)} · ${f.name}</h1>
    ${rival ? `<span>vs ${escapeHTML(rival)}</span>` : ''}
    <span class="m">${escapeHTML(date)} · ${plays.length} jugada${plays.length === 1 ? '' : 's'}</span>
  </div>
  <div class="p-grid">${plays.map(card).join('')}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));<\/script>
</body></html>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function openSheet(plays, format, meta) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(buildSheet(plays, format, meta));
  w.document.close();
  return true;
}
