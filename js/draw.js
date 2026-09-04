/* ============================================================
   JAGS v2 · Herramientas de dibujo
   Las mismas para ofensiva y defensiva. Un defensor se arrastra,
   se le dibuja una caída y se le deshace igual que a un receptor.
   ============================================================ */

import { FIELD, clone } from './model.js';
import { toField } from './field.js';

const GRID = 15; // 1.5 yardas

export class Editor {
  constructor(svg, onChange) {
    this.svg = svg;
    this.onChange = onChange;
    this.play = null;
    this.selected = null;
    this.mode = 'route';      // 'route' | 'motion' | 'move'
    this.snap = false;
    this.history = [];
    this.drag = null;
    this._bind();
  }

  setPlay(p) { this.play = p; this.selected = p ? p.pieces[0].id : null; this.history = []; }
  get piece() { return this.play && this.play.pieces.find(p => p.id === this.selected); }

  push() {
    if (!this.play) return;
    this.history.push(clone(this.play.pieces));
    if (this.history.length > 60) this.history.shift();
  }

  undo() {
    if (!this.history.length) return false;
    this.play.pieces = this.history.pop();
    this.onChange();
    return true;
  }

  clearPiece() {
    const p = this.piece;
    if (!p) return;
    this.push();
    p.route = []; p.motion = [];
    this.onChange();
  }

  clearSide() {
    if (!this.play) return;
    this.push();
    this.play.pieces.forEach(p => { p.route = []; p.motion = []; });
    this.onChange();
  }

  _snap(pt) {
    return this.snap
      ? { x: Math.round(pt.x / GRID) * GRID, y: Math.round(pt.y / GRID) * GRID }
      : { x: +pt.x.toFixed(1), y: +pt.y.toFixed(1) };
  }

  _hit(pt) {
    if (!this.play) return null;
    let best = null, bd = 18;
    this.play.pieces.forEach(p => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  _bind() {
    const down = (e) => {
      if (!this.play) return;
      const pt = this._snap(toField(this.svg, e));
      const hit = this._hit(pt);

      if (hit) {
        this.selected = hit.id;
        // Arrastrar la pieza: mueve alineación, y con ella todo su trazo.
        this.push();
        this.drag = { id: hit.id, from: { x: hit.x, y: hit.y } };
        this.onChange();
        e.preventDefault();
        return;
      }

      const p = this.piece;
      if (!p) return;
      this.push();
      if (this.mode === 'motion') p.motion.push(pt);
      else p.route.push(pt);
      this.onChange();
      e.preventDefault();
    };

    const move = (e) => {
      if (!this.drag || !this.play) return;
      const pt = this._snap(toField(this.svg, e));
      const p = this.play.pieces.find(x => x.id === this.drag.id);
      if (!p) return;
      const dx = pt.x - this.drag.from.x, dy = pt.y - this.drag.from.y;
      p.x = pt.x; p.y = pt.y;
      p.route  = p.route.map(q  => ({ x:q.x + dx, y:q.y + dy }));
      p.motion = p.motion.map(q => ({ x:q.x + dx, y:q.y + dy }));
      this.drag.from = pt;
      this.onChange();
      e.preventDefault();
    };

    const up = () => { this.drag = null; };

    this.svg.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.svg.addEventListener('touchstart', (e) => { if (e.touches.length === 1) e.preventDefault(); }, { passive:false });
  }
}
