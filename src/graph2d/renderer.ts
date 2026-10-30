import type { Resolved, Value, Vec2 } from '../math/types';
import type { Settings, View } from '../store/project';
import { fmt } from '../math/solve';
import { march } from './march';
import { fmtTick, niceStep, Viewport } from './viewport';

/** The subset of CanvasRenderingContext2D the renderer uses (also implemented by SvgCtx). */
export interface Ctx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  setLineDash(d: number[]): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  save(): void;
  restore(): void;
}

export const C = {
  bg: '#0D0E0D',
  axis: '#787978',
  text: '#C4C5C4',
  bright: '#DCDCDC',
  gridMinor: 'rgba(120,121,120,0.10)',
  gridMajor: 'rgba(120,121,120,0.24)',
  accent: '#3282F6',
};

export const FONT_MONO = "11px 'JetBrains Mono', monospace";
export const FONT_LABEL = "italic 16px 'STIX Two Text', 'EB Garamond', serif";

export interface Overlay {
  hover?: { p: Vec2; color: string; text: string } | null;
  pending?: Vec2[];
  mouse?: Vec2 | null;
  toolShape?: 'segment' | 'line' | 'circle' | 'polygon' | 'vector' | 'ray' | null;
}

export interface DrawOpts {
  W: number; H: number; view: View; settings: Settings; selectedId: string | null; overlay?: Overlay;
}

function drawGrid(ctx: Ctx, vp: Viewport, s: Settings) {
  const { step, minor } = niceStep(vp.v.sx);
  const ys = niceStep(vp.v.sy);
  const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  if (s.grid) {
    ctx.lineWidth = 1;
    for (const [st, color] of [[minor, C.gridMinor], [step, C.gridMajor]] as const) {
      ctx.strokeStyle = color;
      for (let x = Math.ceil(vp.xmin / st) * st; x <= vp.xmax; x += st) { const p = Math.round(vp.px(x)) + 0.5; line(p, 0, p, vp.H); }
    }
    for (const [st, color] of [[ys.minor, C.gridMinor], [ys.step, C.gridMajor]] as const) {
      ctx.strokeStyle = color;
      for (let y = Math.ceil(vp.ymin / st) * st; y <= vp.ymax; y += st) { const p = Math.round(vp.py(y)) + 0.5; line(0, p, vp.W, p); }
    }
  }
  if (!s.axes) return;
  const ax = Math.round(Math.min(Math.max(vp.py(0), 0), vp.H)) + 0.5;
  const ay = Math.round(Math.min(Math.max(vp.px(0), 0), vp.W)) + 0.5;
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1.2;
  line(0, ax, vp.W, ax);
  line(ay, 0, ay, vp.H);
  // arrows
  ctx.fillStyle = C.axis;
  ctx.beginPath(); ctx.moveTo(vp.W, ax); ctx.lineTo(vp.W - 9, ax - 4); ctx.lineTo(vp.W - 9, ax + 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(ay, 0); ctx.lineTo(ay - 4, 9); ctx.lineTo(ay + 4, 9); ctx.closePath(); ctx.fill();
  ctx.font = FONT_LABEL;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('x', vp.W - 6, ax + 8);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('y', ay + 8, 4);

  ctx.font = FONT_MONO;
  ctx.fillStyle = C.axis;
  const labelY = Math.min(ax + 6, vp.H - 16);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let x = Math.ceil(vp.xmin / step) * step; x <= vp.xmax; x += step) {
    if (Math.abs(x) < step / 2) continue;
    const p = vp.px(x);
    if (p < 12 || p > vp.W - 20) continue;
    ctx.fillRect(Math.round(p), ax - 3, 1, 6);
    halo(ctx, fmtTick(x, step), p, labelY);
  }
  ctx.textAlign = ay > vp.W - 40 ? 'right' : 'right'; ctx.textBaseline = 'middle';
  const labelX = Math.max(ay - 7, 34);
  for (let y = Math.ceil(vp.ymin / ys.step) * ys.step; y <= vp.ymax; y += ys.step) {
    if (Math.abs(y) < ys.step / 2) continue;
    const p = vp.py(y);
    if (p < 20 || p > vp.H - 10) continue;
    ctx.fillRect(ay - 3, Math.round(p), 6, 1);
    halo(ctx, fmtTick(y, ys.step), labelX, p);
  }
  if (vp.px(0) > 0 && vp.px(0) < vp.W && vp.py(0) > 0 && vp.py(0) < vp.H) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    halo(ctx, '0', ay - 6, ax + 6);
  }
}

function halo(ctx: Ctx, t: string, x: number, y: number) {
  const fill = ctx.fillStyle;
  const w = ctx.measureText(t).width;
  ctx.fillStyle = C.bg;
  ctx.globalAlpha = 0.85;
  const left = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x;
  const top = ctx.textBaseline === 'middle' ? y - 7 : y - 1;
  ctx.fillRect(left - 2, top, w + 4, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fill;
  ctx.fillText(t, x, y);
}

function plotFn(ctx: Ctx, f: (x: number) => number, vp: Viewport, from = 0, to = vp.W) {
  ctx.beginPath();
  let pen = false, prev = 0;
  const step = 0.75;
  for (let px = from - 1; px <= to + 1; px += step) {
    const y = f(vp.wx(px));
    if (!Number.isFinite(y)) { pen = false; continue; }
    let py = vp.py(y);
    if (pen && Math.abs(py - prev) > vp.H) {
      const ym = vp.py(f(vp.wx(px - step / 2)));
      if (!Number.isFinite(ym) || ym < Math.min(prev, py) - 1 || ym > Math.max(prev, py) + 1) pen = false;
    }
    py = Math.max(-1e4, Math.min(vp.H + 1e4, py));
    if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    pen = true; prev = py;
  }
  ctx.stroke();
}

function infinite(vp: Viewport, a: Vec2, b: Vec2, ray = false): [Vec2, Vec2] {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(d.x, d.y) || 1;
  const L = (Math.hypot(vp.xmax - vp.xmin, vp.ymax - vp.ymin) + Math.hypot(a.x - vp.v.ox, a.y - vp.v.oy)) / len;
  return [ray ? a : { x: a.x - d.x * L, y: a.y - d.y * L }, { x: a.x + d.x * L, y: a.y + d.y * L }];
}

function seg(ctx: Ctx, vp: Viewport, a: Vec2, b: Vec2) {
  ctx.beginPath(); ctx.moveTo(vp.px(a.x), vp.py(a.y)); ctx.lineTo(vp.px(b.x), vp.py(b.y)); ctx.stroke();
}

function arrowHead(ctx: Ctx, vp: Viewport, a: Vec2, b: Vec2) {
  const x2 = vp.px(b.x), y2 = vp.py(b.y);
  const ang = Math.atan2(y2 - vp.py(a.y), x2 - vp.px(a.x));
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 12 * Math.cos(ang - 0.4), y2 - 12 * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - 12 * Math.cos(ang + 0.4), y2 - 12 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

export function dot(ctx: Ctx, x: number, y: number, color: string, r = 4.5, hollow = false) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = hollow ? C.bg : color;
  ctx.fill();
  ctx.lineWidth = hollow ? 2 : 1.2;
  ctx.strokeStyle = hollow ? color : 'rgba(0,0,0,0.6)';
  ctx.stroke();
}

function shadeFnIneq(ctx: Ctx, vp: Viewport, f: (x: number) => number, below: boolean) {
  for (let px = 0; px < vp.W; px += 2) {
    const y = f(vp.wx(px + 1));
    if (Number.isNaN(y)) continue;
    const py = Math.max(0, Math.min(vp.H, Number.isFinite(y) ? vp.py(y) : y > 0 ? 0 : vp.H));
    if (below) ctx.fillRect(px, py, 2, vp.H - py); else ctx.fillRect(px, 0, 2, py);
  }
}

function drawValue(ctx: Ctx, vp: Viewport, v: Value, color: string, width: number, labels: { p: Vec2; text: string; color: string }[], name: string, showLabel: boolean) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  switch (v.type) {
    case 'function': {
      if (v.ineq) {
        ctx.globalAlpha = 0.18;
        shadeFnIneq(ctx, vp, v.f, v.ineq.startsWith('<'));
        ctx.globalAlpha = 1;
        if (v.ineq === '<' || v.ineq === '>') ctx.setLineDash([8, 6]);
      }
      plotFn(ctx, v.f, vp);
      ctx.setLineDash([]);
      break;
    }
    case 'implicit': {
      const cell = 5;
      const nx = Math.ceil(vp.W / cell), ny = Math.ceil(vp.H / cell);
      if (v.op !== '=') {
        ctx.globalAlpha = 0.18;
        const test = v.op === '<' || v.op === '<=' ? (z: number) => z < 0 : (z: number) => z > 0;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          if (test(v.F(vp.wx(i * cell + cell / 2), vp.wy(j * cell + cell / 2)))) ctx.fillRect(i * cell, j * cell, cell, cell);
        }
        ctx.globalAlpha = 1;
        if (v.op === '<' || v.op === '>') ctx.setLineDash([8, 6]);
      }
      const segs = march(v.F, vp.xmin, vp.xmin + nx * cell / vp.v.sx, vp.ymax - ny * cell / vp.v.sy, vp.ymax, nx, ny);
      ctx.beginPath();
      for (const s of segs) { ctx.moveTo(vp.px(s[0]), vp.py(s[1])); ctx.lineTo(vp.px(s[2]), vp.py(s[3])); }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'segment': seg(ctx, vp, v.a, v.b); break;
    case 'line': { const [p, q] = infinite(vp, v.a, v.b); seg(ctx, vp, p, q); break; }
    case 'ray': { const [p, q] = infinite(vp, v.a, v.b, true); seg(ctx, vp, p, q); break; }
    case 'vector': seg(ctx, vp, v.a, v.b); arrowHead(ctx, vp, v.a, v.b); break;
    case 'circle': {
      ctx.beginPath();
      ctx.ellipse(vp.px(v.c.x), vp.py(v.c.y), v.r * vp.v.sx, v.r * vp.v.sy, 0, 0, Math.PI * 2);
      ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }
    case 'polygon': {
      ctx.beginPath();
      v.pts.forEach((p, i) => (i ? ctx.lineTo(vp.px(p.x), vp.py(p.y)) : ctx.moveTo(vp.px(p.x), vp.py(p.y))));
      ctx.closePath();
      ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }
    case 'angle': {
      const bx = vp.px(v.b.x), by = vp.py(v.b.y);
      const t1 = -Math.atan2(v.a.y - v.b.y, v.a.x - v.b.x);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 28, t1, t1 - v.value, true); ctx.closePath();
      ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.stroke();
      const mid = t1 - v.value / 2;
      labels.push({ p: { x: vp.wx(bx + 46 * Math.cos(mid)), y: vp.wy(by + 46 * Math.sin(mid)) }, text: `${fmt((v.value * 180) / Math.PI, 2)}°`, color });
      return;
    }
    case 'integral': {
      const a = vp.px(Math.min(v.a, v.b)), b = vp.px(Math.max(v.a, v.b));
      const y0 = vp.py(0);
      ctx.globalAlpha = 0.28;
      for (let px = Math.max(0, a); px < Math.min(vp.W, b); px += 1) {
        const y = v.f(vp.wx(px + 0.5));
        if (!Number.isFinite(y)) continue;
        const py = Math.max(-10, Math.min(vp.H + 10, vp.py(y)));
        ctx.fillRect(px, Math.min(py, y0), 1, Math.abs(y0 - py));
      }
      ctx.globalAlpha = 1;
      plotFn(ctx, v.f, vp, a, b);
      const mx = (v.a + v.b) / 2;
      labels.push({ p: { x: mx, y: v.f(mx) / 2 }, text: `${name} = ${fmt(v.value, 3)}`, color });
      return;
    }
    case 'curve': {
      ctx.beginPath();
      let pen = false;
      const N = 1200;
      for (let i = 0; i <= N; i++) {
        const t = v.t0 + ((v.t1 - v.t0) * i) / N;
        const x = v.fx(t), y = v.fy(t);
        if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
        if (pen) ctx.lineTo(vp.px(x), vp.py(y)); else ctx.moveTo(vp.px(x), vp.py(y));
        pen = true;
      }
      ctx.stroke();
      break;
    }
    default: return;
  }
  if (showLabel && name && v.type !== 'implicit') {
    const at = labelAnchor(v, vp);
    if (at) labels.push({ p: at, text: name, color });
  }
}

function labelAnchor(v: Value, vp: Viewport): Vec2 | null {
  switch (v.type) {
    case 'segment': case 'vector': return { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
    case 'circle': return { x: v.c.x + v.r * Math.SQRT1_2, y: v.c.y + v.r * Math.SQRT1_2 };
    case 'function': {
      for (let px = vp.W * 0.75; px > 20; px -= 10) {
        const x = vp.wx(px), y = v.f(x);
        if (Number.isFinite(y) && vp.py(y) > 20 && vp.py(y) < vp.H - 20) return { x, y };
      }
      return null;
    }
    default: return null;
  }
}

export function draw(ctx: Ctx, items: Resolved[], o: DrawOpts) {
  const vp = new Viewport(o.view, o.W, o.H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawGrid(ctx, vp, o.settings);

  const labels: { p: Vec2; text: string; color: string }[] = [];
  const points: { p: Vec2; color: string; name: string; free: boolean; selected: boolean; hollow?: boolean; label: boolean }[] = [];

  for (const r of items) {
    const { obj, value: v } = r;
    if (!v || !obj.visible) continue;
    const selected = o.selectedId === obj.id;
    const width = (obj.lineWidth ?? 2.5) + (selected ? 1 : 0);
    const showLabel = obj.showLabel ?? o.settings.labels;
    if (v.type === 'point') { points.push({ p: v.p, color: obj.color, name: obj.name, free: v.free, selected, label: showLabel }); continue; }
    if (v.type === 'points') { v.pts.forEach((p) => points.push({ p, color: obj.color, name: '', free: false, selected, label: false })); continue; }
    if (v.type === 'text') { v.pts?.forEach((p) => points.push({ p, color: obj.color, name: '', free: false, selected, hollow: true, label: false })); continue; }
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      drawValue(ctx, vp, v, obj.color, width + 6, [], '', false);
      ctx.restore();
    }
    drawValue(ctx, vp, v, obj.color, width, labels, obj.name, showLabel);
  }

  for (const pt of points) {
    const x = vp.px(pt.p.x), y = vp.py(pt.p.y);
    if (x < -20 || x > o.W + 20 || y < -20 || y > o.H + 20) continue;
    if (pt.selected) { ctx.globalAlpha = 0.3; dot(ctx, x, y, pt.color, 10); ctx.globalAlpha = 1; }
    dot(ctx, x, y, pt.color, pt.free ? 5 : 4.2, pt.hollow);
    if (pt.label && pt.name) labels.push({ p: pt.p, text: pt.name, color: pt.color });
  }

  ctx.font = FONT_LABEL;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (const l of labels) {
    if (!Number.isFinite(l.p.x) || !Number.isFinite(l.p.y)) continue;
    ctx.fillStyle = l.color;
    halo(ctx, l.text, vp.px(l.p.x) + 7, vp.py(l.p.y) - 5);
  }

  const ov = o.overlay;
  if (ov) {
    if (ov.pending?.length && ov.mouse && ov.toolShape) {
      ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      const last = ov.pending[ov.pending.length - 1];
      if (ov.toolShape === 'circle') {
        const r = Math.hypot(ov.mouse.x - last.x, ov.mouse.y - last.y);
        ctx.beginPath(); ctx.ellipse(vp.px(last.x), vp.py(last.y), r * vp.v.sx, r * vp.v.sy, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (ov.toolShape === 'line' || ov.toolShape === 'ray') {
        const [p, q] = infinite(vp, last, ov.mouse, ov.toolShape === 'ray'); seg(ctx, vp, p, q);
      } else {
        if (ov.toolShape === 'polygon') for (let i = 1; i < ov.pending.length; i++) seg(ctx, vp, ov.pending[i - 1], ov.pending[i]);
        seg(ctx, vp, last, ov.mouse);
      }
      ctx.setLineDash([]);
    }
    ov.pending?.forEach((p) => dot(ctx, vp.px(p.x), vp.py(p.y), C.accent, 5));
    if (ov.hover) {
      const x = vp.px(ov.hover.p.x), y = vp.py(ov.hover.p.y);
      dot(ctx, x, y, ov.hover.color, 5, true);
      ctx.font = FONT_MONO;
      const w = ctx.measureText(ov.hover.text).width + 14;
      const bx = Math.min(x + 10, o.W - w - 4), by = Math.max(y - 32, 4);
      ctx.fillStyle = '#000'; ctx.globalAlpha = 0.85; ctx.fillRect(bx, by, w, 22); ctx.globalAlpha = 1;
      ctx.fillStyle = C.bright; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(ov.hover.text, bx + 7, by + 11);
    }
  }
}
