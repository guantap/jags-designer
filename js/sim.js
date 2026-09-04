/* ============================================================
   JAGS v2 · Simulador
   Cambios frente a v1:
   1. Lee defensas DIBUJADAS, no siete presets. Cualquier defensa
      que dibujes o scoutees es un caso de prueba.
   2. Devuelve lectura POR RECEPTOR, no un puntaje global.
   3. Devuelve una LÍNEA DE TIEMPO, no una foto: el flat se abre
      al segundo 2 y el corner al 3.5, y eso importa.
   ============================================================ */

import { FIELD, fullPath, pointAt, pathLength, depthOf } from './model.js';

const DT   = 0.1;    // paso de simulación (s)
const T_END = 4.5;   // horizonte
const V_REC  = 85;   // px/s ≈ 8.5 y/s
const V_DEF  = 80;   // el defensor de marca corre algo menos que el receptor
const V_ZONE = 75;
const V_RUSH = 78;
const REACT  = 0.25; // retardo de reacción del defensor (s)
const BALL_READY = 1.0;  // snap + dropback
const OPEN   = 32;   // px de separación para considerar "abierto" (3.2 y)
const CLOSE  = 18;   // por debajo de esto, está cubierto de verdad

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function moveToward(from, to, maxStep) {
  const d = dist(from, to);
  if (d <= maxStep || d === 0) return { ...to };
  return { x: from.x + (to.x - from.x) * (maxStep / d), y: from.y + (to.y - from.y) * (maxStep / d) };
}

/* Posición de un atacante en el segundo t (recorre su ruta a velocidad constante). */
function recAt(p, t) {
  const pts = fullPath(p, 'route');
  if (pts.length < 2) return { x: pts[0].x, y: pts[0].y };
  const total = pathLength(pts);
  const travelled = Math.min(total, V_REC * Math.max(0, t));
  return pointAt(pts, total === 0 ? 0 : travelled / total);
}

/* Punto de destino de un defensor de zona: el final de su caída dibujada. */
function zoneAnchor(p) {
  const pts = fullPath(p, 'route');
  return pts.length > 1 ? pts[pts.length - 1] : { x:p.x, y:p.y };
}

/* ============================================================
   simulate(off, def) → resultado completo
   ============================================================ */
export function simulate(off, def) {
  const eligible = off.pieces.filter(p => {
    if (p.label === 'C') return true;
    if (p.label === 'QB') return off.doubleQB || off.snapTo !== 'QB';
    return true;
  });
  // Un receptor que no corre ruta no es una lectura: se queda en el campo
  // (ocupa defensores) pero no compite por el balón.
  const receivers = eligible.filter(p => fullPath(p, 'route').length > 1);

  const qb = off.pieces.find(p => p.label === (off.snapTo || 'QB')) || off.pieces.find(p => p.label === 'QB');
  const qbPos = qb ? { x:qb.x, y:qb.y } : { x:300, y:285 };

  // El defensor de marca se alinea SOBRE su hombre: conserva la profundidad
  // que le dibujaste, pero toma el eje horizontal de su asignación. Sin esto,
  // una Cobertura 0 deja al receptor del ala libre por pura geometría heredada.
  const defs = def ? def.pieces.map(p => {
    let x = p.x;
    if (p.duty.type === 'man') {
      const tgt = off.pieces.find(o => o.label === p.duty.target);
      if (tgt) x = tgt.x;
    }
    return { src:p, pos:{ x, y:p.y }, locked:false };
  }) : [];

  // Reloj de presión: cuánto tarda el blitz en llegar al QB.
  const blitzers = defs.filter(d => d.src.duty.type === 'blitz');
  let rushTime = 7.0; // sin rush, manda la regla de los 7 segundos
  if (blitzers.length) {
    const d0 = Math.min(...blitzers.map(b => dist(b.pos, qbPos)));
    rushTime = d0 / V_RUSH;
  }

  const frames = [];
  const perRec = {};
  receivers.forEach(r => { perRec[r.label] = { label:r.label, best:null, samples:[] }; });

  for (let t = 0; t <= T_END + 1e-9; t += DT) {
    const tt = +t.toFixed(2);
    const recPos = {};
    receivers.forEach(r => { recPos[r.label] = recAt(r, tt); });

    // Movimiento de los defensores
    defs.forEach(d => {
      const step = DT * (d.src.duty.type === 'man' ? V_DEF : d.src.duty.type === 'blitz' ? V_RUSH : V_ZONE);
      if (tt < REACT && d.src.duty.type !== 'blitz') return;

      if (d.src.duty.type === 'blitz') {
        d.pos = moveToward(d.pos, qbPos, step);
      } else if (d.src.duty.type === 'man') {
        const target = recPos[d.src.duty.target] || recPos[receivers[0] && receivers[0].label];
        if (target) d.pos = moveToward(d.pos, target, step);
      } else {
        // Zona: primero cae a su punto, después rompe sobre la amenaza más cercana dentro del radio.
        const anchor = zoneAnchor(d.src);
        const radius = d.src.duty.radius || 80;
        if (!d.locked && dist(d.pos, anchor) > 4) { d.pos = moveToward(d.pos, anchor, step); return; }
        d.locked = true;
        let threat = null, best = Infinity;
        for (const l in recPos) {
          const dd = dist(anchor, recPos[l]);
          if (dd < radius && dd < best) { best = dd; threat = recPos[l]; }
        }
        d.pos = threat ? moveToward(d.pos, threat, step * 0.85) : moveToward(d.pos, anchor, step);
      }
    });

    const row = { t: tt, receivers: [] };
    receivers.forEach(r => {
      const rp = recPos[r.label];
      let sep = Infinity, by = null;
      defs.forEach(d => {
        if (d.src.duty.type === 'blitz') return;
        const dd = dist(rp, d.pos);
        if (dd < sep) { sep = dd; by = d.src.label; }
      });
      if (!isFinite(sep)) { sep = 999; by = null; }
      const throwable = tt >= BALL_READY && tt <= rushTime;
      const entry = {
        label: r.label, sep: Math.round(sep), by,
        depth: depthOf(rp.y), open: sep >= OPEN, covered: sep < CLOSE, throwable,
        x: rp.x, y: rp.y,
      };
      row.receivers.push(entry);
      perRec[r.label].samples.push(entry);
      if (throwable) {
        const cur = perRec[r.label].best;
        if (!cur || sep > cur.sep) perRec[r.label].best = { ...entry, t: tt };
      }
    });
    frames.push(row);
  }

  // Lectura por receptor, ordenada por qué tan abierto queda dentro de la ventana
  const reads = receivers.map(r => {
    const rec = perRec[r.label];
    const b = rec.best;
    const firstOpen = rec.samples.find(s => s.throwable && s.open);
    return {
      label: r.label,
      bestSep: b ? b.sep : 0,
      bestT: b ? b.t : null,
      depth: b ? b.depth : 0,
      by: b ? b.by : null,
      openAt: firstOpen ? firstOpen.t : null,
      status: !b ? 'sin ruta' : b.sep >= OPEN ? 'abierto' : b.sep >= CLOSE ? 'disputado' : 'cubierto',
    };
  }).sort((a, b) => b.bestSep - a.bestSep);

  const top = reads[0] || null;
  const openCount = reads.filter(r => r.status === 'abierto').length;
  const pressured = rushTime < BALL_READY + 0.5;

  let verdict, tone;
  if (!top) { verdict = 'Sin rutas que evaluar'; tone = 'neutral'; }
  else if (pressured && openCount === 0) { verdict = 'La presión llega antes que la lectura'; tone = 'bad'; }
  else if (openCount >= 2) { verdict = `Gana: ${openCount} opciones abiertas`; tone = 'ok'; }
  else if (openCount === 1) { verdict = `Gana por ${top.label} a ${top.depth}y`; tone = 'ok'; }
  else if (top.bestSep >= CLOSE) { verdict = 'Disputada: exige lanzamiento preciso'; tone = 'warn'; }
  else { verdict = 'Cubierta: la defensa gana'; tone = 'bad'; }

  return {
    frames, reads, verdict, tone, openCount,
    rushTime: +rushTime.toFixed(2),
    ballReady: BALL_READY,
    window: [BALL_READY, +Math.min(rushTime, T_END).toFixed(2)],
    score: scoreOf(top, openCount, eligible.length, rushTime),
  };
}

/* Indice 0-100. Tres factores acotados para que ninguno sature la escala:
   que tan abierto queda el mejor, cuantos se abren, y cuanto dura la ventana.
   El reparto se mide contra los receptores ELEGIBLES, no contra los que corren:
   si no, una jugada de un solo hombre puntuaria como una de cuatro opciones. */
function scoreOf(top, openCount, n, rushTime) {
  if (!top || !n) return 0;
  const sep    = Math.min(1, top.bestSep / OPEN);
  const spread = openCount / n;
  const window = Math.min(1, Math.max(0, Math.min(rushTime, T_END) - BALL_READY) / 2.0);
  return Math.round(45 * sep + 35 * spread + 20 * window);
}

/* Estado en un instante concreto, para pintar el halo de "abierto". */
export function frameAt(sim, t) {
  if (!sim || !sim.frames.length) return null;
  const i = Math.max(0, Math.min(sim.frames.length - 1, Math.round(t / DT)));
  return sim.frames[i];
}

/* ============================================================
   matrix(off, defPlays[]) → tu jugada contra TODO el playbook
   defensivo, en una grilla. Era el modal "Comparar"; ahora es
   la respuesta principal de la herramienta.
   ============================================================ */
export function matrix(off, defPlays) {
  const rows = defPlays.map(d => {
    const s = simulate(off, d);
    return {
      defId: d.id, defName: d.name,
      score: s.score, tone: s.tone, verdict: s.verdict,
      openCount: s.openCount,
      best: s.reads[0] ? `${s.reads[0].label} · ${s.reads[0].depth}y` : '—',
      rushTime: s.rushTime,
    };
  }).sort((a, b) => a.score - b.score);

  const wins = rows.filter(r => r.tone === 'ok').length;
  return {
    rows, wins, total: rows.length,
    weakest: rows[0] || null,
    summary: rows.length === 0 ? 'Sin defensas guardadas'
      : wins === rows.length ? 'Gana contra todo el playbook defensivo'
      : wins === 0 ? 'No gana contra ninguna defensa guardada'
      : `Gana contra ${wins} de ${rows.length}`,
  };
}
