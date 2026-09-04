/* ============================================================
   JAGS v2 · Modelo unificado
   Una sola clase de dato para las 10 piezas del campo.
   Esta es la pieza que desbloquea dibujar defensa: ofensiva y
   defensiva dejan de tener modelos distintos.
   ============================================================ */

/* Geometría heredada de v1 para que las jugadas guardadas migren sin deformarse.
   600x360 px · 10px = 1 yarda · LOS en y=240 · campo arriba (y decrece). */
export const FIELD = { w: 600, h: 360, losY: 240, endZoneY: 30, pxPerYard: 10 };

export const toYards = (px) => px / FIELD.pxPerYard;
export const depthOf = (y) => Math.round((FIELD.losY - y) / FIELD.pxPerYard);

export const OFF_LABELS = ['X', 'H', 'Y', 'C', 'QB'];
export const DEF_LABELS = ['D1', 'D2', 'D3', 'D4', 'D5'];

export const FORMATIONS = {
  '2x1':   { X:{x:80,y:240},  H:{x:230,y:240}, C:{x:300,y:240}, Y:{x:470,y:240}, QB:{x:300,y:285} },
  'bunch': { X:{x:250,y:240}, C:{x:285,y:240}, Y:{x:320,y:240}, H:{x:355,y:240}, QB:{x:285,y:285} },
  'trips': { C:{x:300,y:240}, X:{x:380,y:240}, H:{x:440,y:240}, Y:{x:500,y:240}, QB:{x:300,y:285} },
};

export const ZONES = [
  { id:1, name:'CORTA-I',    x:20,  y:140, w:180, h:100 },
  { id:2, name:'MEDIO',      x:200, y:140, w:200, h:100 },
  { id:3, name:'CORTA-D',    x:400, y:140, w:180, h:100 },
  { id:4, name:'PROFUNDA-I', x:20,  y:30,  w:280, h:110 },
  { id:5, name:'PROFUNDA-D', x:300, y:30,  w:280, h:110 },
];

export const CATEGORIES = [
  { id:'corto',      name:'Corto' },
  { id:'intermedio', name:'Intermedio' },
  { id:'profundo',   name:'Profundo' },
  { id:'doubleqb',   name:'Doble QB' },
  { id:'trick',      name:'Trick' },
  { id:'redzone',    name:'Red Zone' },
  { id:'critico',    name:'Crítico' },
  { id:'cobertura',  name:'Cobertura' },
  { id:'presion',    name:'Presión' },
];

export const SITUATIONS = [
  '1er down', '2do & corto', '2do & largo', '3ro & corto',
  '3ro & largo', '4to down', 'Dos minutos', 'Goal line',
];

/* ---------------- Pieza ----------------
   side      'off' | 'def'
   route     trazo post-snap  [{x,y}...]  (no incluye el origen)
   motion    trazo pre-snap   [{x,y}...]
   style     'solid' (carrera/ruta) | 'dashed' (responsabilidad de zona) | 'zigzag' (motion)
   cap       'arrow' | 'block' | 'dot' | 'none'
   duty      { type:'route'|'man'|'zone'|'blitz'|'spy', target?:label, radius?:px }
*/
export function piece(side, label, x, y, extra = {}) {
  return {
    id: `${side}-${label}`,
    side, label, x, y,
    route: [], motion: [],
    style: side === 'def' ? 'dashed' : 'solid',
    cap: side === 'def' ? 'dot' : 'arrow',
    duty: side === 'def' ? { type:'zone', radius:80 } : { type:'route' },
    ...extra,
  };
}

/* Fin real del recorrido de una pieza (dónde termina su responsabilidad). */
export function endOf(p) {
  const path = p.route && p.route.length ? p.route : p.motion;
  const last = path && path.length ? path[path.length - 1] : null;
  return last ? { x: last.x, y: last.y } : { x: p.x, y: p.y };
}

/* Puntos completos incluyendo el origen. */
export function fullPath(p, which = 'route') {
  const start = which === 'motion'
    ? { x:p.x, y:p.y }
    : (p.motion.length ? p.motion[p.motion.length - 1] : { x:p.x, y:p.y });
  return [start, ...(p[which] || [])];
}

/* Punto sobre el trazo a fracción t (0..1) de la longitud total. */
export function pointAt(pts, t) {
  if (pts.length < 2) return { ...pts[0] };
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    segs.push(d); total += d;
  }
  if (total === 0) return { ...pts[0] };
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : want / segs[i];
      return {
        x: pts[i].x + (pts[i+1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i+1].y - pts[i].y) * f,
      };
    }
    want -= segs[i];
  }
  return { ...pts[pts.length - 1] };
}

export function pathLength(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
  return t;
}

/* ---------------- Jugada ---------------- */
export function play(side, name = 'Sin nombre') {
  const labels = side === 'off' ? OFF_LABELS : DEF_LABELS;
  const form = FORMATIONS['2x1'];
  return {
    id: `p${Date.now()}${Math.floor(Math.random()*1000)}`,
    side, name,
    formation: side === 'off' ? '2x1' : 'libre',
    pieces: labels.map(l => side === 'off'
      ? piece('off', l, form[l].x, form[l].y)
      : piece('def', l, 100 + (labels.indexOf(l) * 100), 180)),
    snapTo: 'QB', doubleQB: false, secondPasser: 'C', mirror: false,
    category: '', situation: '', notes: '',
    ts: new Date().toISOString(),
  };
}

export function applyFormation(pl, name) {
  const form = FORMATIONS[name];
  if (!form || pl.side !== 'off') return pl;
  pl.formation = name;
  pl.pieces.forEach(p => { if (form[p.label]) { p.x = form[p.label].x; p.y = form[p.label].y; } });
  return pl;
}

export function mirrorPlay(pl) {
  const flip = (pt) => ({ ...pt, x: FIELD.w - pt.x });
  pl.pieces.forEach(p => {
    const f = flip(p);
    p.x = f.x;
    p.route = p.route.map(flip);
    p.motion = p.motion.map(flip);
  });
  pl.mirror = !pl.mirror;
  return pl;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

/* ============================================================
   MIGRACIÓN v1 → v2
   Las 7 coberturas hardcodeadas dejan de ser presets muertos:
   se convierten en las primeras 7 jugadas del playbook defensivo,
   editables y dibujables como cualquier otra.
   ============================================================ */

const V1_COVERAGES = {
  cover0: { name:'Cobertura 0', note:'Blitz total · Marcaje personal · Sin ayuda profunda',
    d:[{t:'man',r:40},{t:'man',r:40},{t:'man',r:40},{t:'man',r:40},{t:'blitz'}] },
  cover1: { name:'Cobertura 1', note:'1 profundo + marcaje personal',
    d:[{t:'zone',x:300,y:90,r:95},{t:'man',r:40},{t:'man',r:40},{t:'man',r:40},{t:'man',r:40}] },
  cover2: { name:'Cobertura 2', note:'2 profundos · Esquinas cortas',
    d:[{t:'zone',x:150,y:100,r:115},{t:'zone',x:450,y:100,r:115},{t:'zone',x:80,y:185,r:70},{t:'zone',x:520,y:185,r:70},{t:'zone',x:300,y:175,r:80}] },
  cover3: { name:'Cobertura 3', note:'3 tercios profundos · 2 cortos',
    d:[{t:'zone',x:120,y:85,r:105},{t:'zone',x:300,y:70,r:105},{t:'zone',x:480,y:85,r:105},{t:'zone',x:200,y:180,r:80},{t:'zone',x:400,y:180,r:80}] },
  cover4: { name:'Cobertura 4', note:'Cuartos · 1 corto',
    d:[{t:'zone',x:120,y:75,r:90},{t:'zone',x:260,y:75,r:90},{t:'zone',x:340,y:75,r:90},{t:'zone',x:480,y:75,r:90},{t:'zone',x:300,y:190,r:75}] },
  cover2_invert: { name:'C2 Invertida', note:'Rotación al fuerte · 2 profundos · 2 cortos · 1 blitz',
    d:[{t:'zone',x:480,y:90,r:115},{t:'zone',x:150,y:95,r:115},{t:'zone',x:400,y:175,r:110},{t:'zone',x:180,y:185,r:80},{t:'blitz'}] },
  box: { name:'Caja', note:'5 en la caja · sin profundidad · vulnerable a verticales',
    d:[{t:'zone',x:90,y:200,r:65},{t:'zone',x:210,y:190,r:60},{t:'zone',x:300,y:180,r:65},{t:'zone',x:390,y:190,r:60},{t:'zone',x:510,y:200,r:65}] },
};

/* Alineación de arranque de un defensor a partir de su responsabilidad.
   Los de zona arrancan más cerca del LOS y "caen" a su punto: ese caer es
   ahora un trazo dibujado (punteado), no un radio invisible. */
function defStart(spec, i) {
  if (spec.t === 'blitz') return { x: 300, y: FIELD.losY - 70 };   // 7 yardas, regla IFAF
  if (spec.t === 'man')   return { x: 90 + i * 110, y: FIELD.losY - 55 };
  const drop = Math.max(0, FIELD.losY - spec.y);
  return { x: spec.x, y: FIELD.losY - Math.min(drop * 0.35, 60) };
}

export function coveragePlays() {
  return Object.entries(V1_COVERAGES).map(([key, cov]) => {
    const pl = play('def', cov.name);
    pl.id = `cov-${key}`;
    pl.notes = cov.note;
    pl.category = cov.d.some(d => d.t === 'blitz') ? 'presion' : 'cobertura';
    pl.builtin = true;
    pl.pieces = cov.d.map((spec, i) => {
      const s = defStart(spec, i);
      const p = piece('def', DEF_LABELS[i], s.x, s.y);
      if (spec.t === 'zone') {
        p.duty = { type:'zone', radius: spec.r };
        p.style = 'dashed'; p.cap = 'dot';
        if (spec.x !== s.x || spec.y !== s.y) p.route = [{ x: spec.x, y: spec.y }];
      } else if (spec.t === 'man') {
        p.duty = { type:'man', target: OFF_LABELS[i] || 'X', radius: spec.r };
        p.style = 'solid'; p.cap = 'arrow';
      } else {
        p.duty = { type:'blitz' };
        p.style = 'solid'; p.cap = 'arrow';
        p.route = [{ x: 300, y: FIELD.losY + 45 }];
      }
      return p;
    });
    return pl;
  });
}

/* Convierte una jugada ofensiva guardada por v1 al modelo nuevo. */
export function migrateV1Play(old) {
  const pl = play('off', old.name || 'Sin nombre');
  pl.id = `m${old.id || Date.now()}`;
  pl.formation = old.formation || '2x1';
  pl.snapTo = old.snapTo || 'QB';
  pl.doubleQB = !!old.doubleQB;
  pl.secondPasser = old.secondPasser || 'C';
  pl.mirror = !!old.mirror;
  pl.category = old.category || '';
  pl.situation = old.situation || '';
  pl.notes = old.notes || '';
  pl.ts = old.ts || new Date().toISOString();

  const form = FORMATIONS[pl.formation] || FORMATIONS['2x1'];
  pl.pieces = OFF_LABELS.map(l => {
    const custom = (old.customPos || {})[l];
    const base = custom || form[l] || { x:300, y:240 };
    const p = piece('off', l, base.x, base.y);
    p.route  = Array.isArray((old.routes  || {})[l]) ? clone(old.routes[l])  : [];
    p.motion = Array.isArray((old.motions || {})[l]) ? clone(old.motions[l]) : [];
    return p;
  });
  return pl;
}

export function migrateV1(rawSaved) {
  let arr = [];
  try { arr = JSON.parse(rawSaved || '[]'); } catch (_) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map(migrateV1Play);
}
