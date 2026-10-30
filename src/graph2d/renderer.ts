import type { Resolved, Value, Vec2 } from '../math/types';
import { labelDefault, type Mode, type Settings, type View } from '../store/project';
import { fmt } from '../math/solve';
import { isRtl, labelPlain } from '../math/annotate';
import { riemannStrip } from '../math/calculus';
import { march } from './march';
import { fmtTick, niceStep, Viewport } from './viewport';
import { isoSide, POLAR_ANGLE, polarStep } from './grid';

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

const DARK = {
  bg: '#0D0E0D',
  axis: '#787978',
  text: '#C4C5C4',
  bright: '#DCDCDC',
  gridMinor: 'rgba(120,121,120,0.10)',
  gridMajor: 'rgba(120,121,120,0.24)',
  gridDot: 'rgba(120,121,120,0.6)',
  accent: '#3282F6',
};
/** Paper colors for printed worksheets. */
const LIGHT: typeof DARK = {
  bg: '#FFFFFF',
  axis: '#555655',
  text: '#222322',
  bright: '#111211',
  gridMinor: 'rgba(60,60,60,0.10)',
  gridMajor: 'rgba(60,60,60,0.26)',
  gridDot: 'rgba(60,60,60,0.6)',
  accent: '#1F6FE0',
};
/** The palette of the drawing in progress (draw() switches it). */
export const C = { ...DARK };

// rescaled by draw() to follow the font-size setting (14px = 1)
export let FONT_MONO = "11px 'JetBrains Mono', monospace";
export let FONT_LABEL = "italic 16px 'STIX Two Text', 'EB Garamond', serif";
export const FONT_TEXT = "17px 'IBM Plex Sans Arabic', 'STIX Two Text', sans-serif";
function setFontScale(k: number) {
  FONT_MONO = `${+(11 * k).toFixed(1)}px 'JetBrains Mono', monospace`;
  FONT_LABEL = `italic ${+(16 * k).toFixed(1)}px 'STIX Two Text', 'EB Garamond', serif`;
}

export interface Overlay {
  hover?: { p: Vec2; color: string; text: string } | null;
  pending?: Vec2[];
  mouse?: Vec2 | null;
  toolShape?: 'segment' | 'line' | 'circle' | 'polygon' | 'vector' | 'ray' | null;
  /** pen / arrow being drawn, in world units */
  sketch?: { pts: Vec2[]; arrow: boolean } | null;
}

export interface DrawOpts {
  W: number; H: number; view: View; settings: Settings; selectedId: string | null; overlay?: Overlay;
  /** text annotations are drawn by an HTML layer (KaTeX, Arabic shaping) instead of the canvas */
  htmlText?: boolean;
  light?: boolean;
  /** For the automatic label rule (Geometry labels everything); defaults to graphing. */
  mode?: Mode;
}

function drawGrid(ctx: Ctx, vp: Viewport, s: Settings) {
  const { step } = niceStep(vp.v.sx);
  const ys = niceStep(vp.v.sy);
  const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  if (s.grid) {
    ctx.lineWidth = 1;
    switch (s.gridType) {
      case 'polar': polarGrid(ctx, vp, s); break;
      case 'isometric': isoGrid(ctx, vp); break;
      case 'dots': dotGrid(ctx, vp); break;
      default: lineGrid(ctx, vp, s.gridType === 'major'); break;
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
  const names = s.axisLabels ?? { x: 'x', y: 'y' };
  ctx.fillText(names.x, vp.W - 6, ax + 8);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(names.y, ay + 8, 4);

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

/** Square grid: major lines, with the minor ones underneath unless majorOnly. */
function lineGrid(ctx: Ctx, vp: Viewport, majorOnly: boolean) {
  const xs = niceStep(vp.v.sx), ys = niceStep(vp.v.sy);
  const passes = (minor: number, major: number) => (majorOnly ? [[major, C.gridMajor]] : [[minor, C.gridMinor], [major, C.gridMajor]]) as [number, string][];
  for (const [st, color] of passes(xs.minor, xs.step)) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.ceil(vp.xmin / st) * st; x <= vp.xmax; x += st) { const p = Math.round(vp.px(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, vp.H); }
    ctx.stroke();
  }
  for (const [st, color] of passes(ys.minor, ys.step)) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let y = Math.ceil(vp.ymin / st) * st; y <= vp.ymax; y += st) { const p = Math.round(vp.py(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(vp.W, p); }
    ctx.stroke();
  }
}

/** Dots at the minor grid intersections, larger at the major ones. */
function dotGrid(ctx: Ctx, vp: Viewport) {
  const xs = niceStep(vp.v.sx), ys = niceStep(vp.v.sy);
  const near = (v: number, st: number) => Math.abs(v / st - Math.round(v / st)) < 1e-6;
  for (let x = Math.ceil(vp.xmin / xs.minor) * xs.minor; x <= vp.xmax; x += xs.minor) {
    const px = Math.round(vp.px(x));
    for (let y = Math.ceil(vp.ymin / ys.minor) * ys.minor; y <= vp.ymax; y += ys.minor) {
      const major = near(x, xs.step) && near(y, ys.step);
      const r = major ? 1.5 : 0.75;
      ctx.fillStyle = major ? C.gridDot : C.gridMajor;
      ctx.fillRect(px - r, Math.round(vp.py(y)) - r, 2 * r, 2 * r);
    }
  }
}

/** Concentric circles around the origin and rays every 30°, labelled in the angle unit. */
function polarGrid(ctx: Ctx, vp: Viewport, s: Settings) {
  const { step, minor } = polarStep(vp.v);
  const ox = vp.px(0), oy = vp.py(0);
  // the world distance from the origin to the nearest and farthest points of the view
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const rIn = Math.hypot(clamp(0, vp.xmin, vp.xmax), clamp(0, vp.ymin, vp.ymax));
  const rOut = Math.max(...[[vp.xmin, vp.ymin], [vp.xmin, vp.ymax], [vp.xmax, vp.ymin], [vp.xmax, vp.ymax]].map(([x, y]) => Math.hypot(x, y)));
  for (const [st, color] of [[minor, C.gridMinor], [step, C.gridMajor]] as const) {
    const k0 = Math.max(1, Math.floor(rIn / st)), k1 = Math.ceil(rOut / st);
    if (k1 - k0 > 400) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let k = k0; k <= k1; k++) {
      const rx = k * st * vp.v.sx, ry = k * st * vp.v.sy;
      ctx.moveTo(ox + rx, oy);
      ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = C.gridMajor;
  ctx.beginPath();
  for (let a = 0; a < 12; a++) {
    const t = a * POLAR_ANGLE, R = rOut * 1.01;
    ctx.moveTo(ox, oy);
    ctx.lineTo(vp.px(R * Math.cos(t)), vp.py(R * Math.sin(t)));
  }
  ctx.stroke();
  // angle labels where each ray leaves the view (only when the origin is on screen)
  const pad = 26;
  if (ox < pad || ox > vp.W - pad || oy < pad || oy > vp.H - pad) return;
  ctx.font = FONT_MONO;
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let a = 1; a < 12; a++) {
    if (a % 3 === 0) continue; // the axes have their own labels
    const dx = Math.cos(a * POLAR_ANGLE) * vp.v.sx, dy = -Math.sin(a * POLAR_ANGLE) * vp.v.sy;
    const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const t = Math.min(ux > 0 ? (vp.W - pad - ox) / ux : (pad - ox) / ux, uy > 0 ? (vp.H - pad - oy) / uy : (pad - oy) / uy);
    halo(ctx, angleLabel(a, s.angle), ox + ux * t, oy + uy * t);
  }
}

/** a·30° as "30°" or as a multiple of π ("π/6", "5π/6"). */
function angleLabel(a: number, unit: Settings['angle']) {
  if (unit === 'deg') return `${a * 30}°`;
  const gcd = (p: number, q: number): number => (q ? gcd(q, p % q) : p);
  const g = gcd(a, 6), num = a / g, den = 6 / g;
  return `${num === 1 ? '' : num}π${den === 1 ? '' : `/${den}`}`;
}

/** Triangular grid: horizontal lines and lines at 60° and 120° through the isometric lattice. */
function isoGrid(ctx: Ctx, vp: Viewport) {
  const sd = isoSide(vp.v), h = (sd * Math.sqrt(3)) / 2, k = 1 / Math.sqrt(3);
  const { xmin, xmax, ymin, ymax } = vp;
  ctx.strokeStyle = C.gridMajor;
  ctx.beginPath();
  for (let j = Math.ceil(ymin / h); j * h <= ymax; j++) {
    const p = vp.py(j * h); ctx.moveTo(0, p); ctx.lineTo(vp.W, p);
  }
  // a 60° line is x - y/√3 = c and a 120° line is x + y/√3 = c, with c a multiple of the side
  for (const sign of [-1, 1]) {
    const cs = [xmin + sign * ymin * k, xmin + sign * ymax * k, xmax + sign * ymin * k, xmax + sign * ymax * k];
    const c0 = Math.ceil(Math.min(...cs) / sd), c1 = Math.floor(Math.max(...cs) / sd);
    if (c1 - c0 > 2000) continue;
    for (let i = c0; i <= c1; i++) {
      const c = i * sd;
      ctx.moveTo(vp.px(c - sign * ymin * k), vp.py(ymin));
      ctx.lineTo(vp.px(c - sign * ymax * k), vp.py(ymax));
    }
  }
  ctx.stroke();
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

function arrowHead(ctx: Ctx, vp: Viewport, a: Vec2, b: Vec2, size = 12) {
  const x2 = vp.px(b.x), y2 = vp.py(b.y);
  const ang = Math.atan2(y2 - vp.py(a.y), x2 - vp.px(a.x));
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(ang - 0.4), y2 - size * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - size * Math.cos(ang + 0.4), y2 - size * Math.sin(ang + 0.4));
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

function polyline(ctx: Ctx, vp: Viewport, pts: Vec2[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(vp.px(p.x), vp.py(p.y)) : ctx.moveTo(vp.px(p.x), vp.py(p.y))));
  ctx.stroke();
}

function sketch(ctx: Ctx, vp: Viewport, pts: Vec2[], arrow: boolean, width: number) {
  polyline(ctx, vp, pts);
  if (arrow && pts.length >= 2) arrowHead(ctx, vp, pts[pts.length - 2], pts[pts.length - 1], 8 + width * 2);
}

/** Canvas/SVG fallback for a text annotation: LaTeX becomes readable plain text. */
function drawLabel(ctx: Ctx, vp: Viewport, v: Extract<Value, { type: 'label' }>, color: string) {
  const x = v.screen ? v.p.x : vp.px(v.p.x), y = v.screen ? v.p.y : vp.py(v.p.y);
  ctx.font = FONT_TEXT;
  ctx.fillStyle = color;
  ctx.textAlign = isRtl(v.text) ? 'right' : 'left';
  ctx.textBaseline = 'top';
  labelPlain(v.text).split('\n').forEach((line, i) => ctx.fillText(line, x, y + 2 + i * 22));
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
    case 'stroke': sketch(ctx, vp, v.pts, v.arrow, width); return;
    case 'riemann': {
      const h = (v.b - v.a) / v.n;
      const cy = (y: number) => Math.max(-10, Math.min(vp.H + 10, vp.py(y)));
      const y0 = cy(0);
      ctx.beginPath();
      for (let i = 0; i < v.n; i++) {
        const x0 = vp.px(v.a + i * h), x1 = vp.px(v.a + (i + 1) * h);
        if (Math.max(x0, x1) < 0 || Math.min(x0, x1) > vp.W) continue;
        const [ya, yb] = riemannStrip(v.f, v.a, h, i, v.rule);
        if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
        ctx.moveTo(x0, y0); ctx.lineTo(x0, cy(ya)); ctx.lineTo(x1, cy(yb)); ctx.lineTo(x1, y0); ctx.closePath();
      }
      ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = width;
      plotFn(ctx, v.f, vp, vp.px(Math.min(v.a, v.b)), vp.px(Math.max(v.a, v.b)));
      const mx = (v.a + v.b) / 2;
      labels.push({ p: { x: mx, y: v.f(mx) / 2 }, text: `${name} = ${fmt(v.value, 4)}`, color });
      return;
    }
    case 'between': {
      const a = vp.px(Math.min(v.a, v.b)), b = vp.px(Math.max(v.a, v.b));
      const cy = (y: number) => Math.max(-10, Math.min(vp.H + 10, vp.py(y)));
      ctx.globalAlpha = 0.28;
      for (let px = Math.max(0, a); px < Math.min(vp.W, b); px += 1) {
        const x = vp.wx(px + 0.5), y1 = v.f(x), y2 = v.g(x);
        if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
        ctx.fillRect(px, Math.min(cy(y1), cy(y2)), 1, Math.abs(cy(y1) - cy(y2)));
      }
      ctx.globalAlpha = 1;
      plotFn(ctx, v.f, vp, a, b);
      plotFn(ctx, v.g, vp, a, b);
      const mx = (v.a + v.b) / 2;
      labels.push({ p: { x: mx, y: (v.f(mx) + v.g(mx)) / 2 }, text: `${name} = ${fmt(v.value, 3)}`, color });
      return;
    }
    case 'slopefield': {
      const gap = 30, half = 10;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let py = gap / 2; py < vp.H; py += gap) for (let px = gap / 2; px < vp.W; px += gap) {
        const m = v.F(vp.wx(px), vp.wy(py));
        if (Number.isNaN(m)) continue;
        // direction (1, m) in world units, then to screen
        let dx = vp.v.sx, dy = Number.isFinite(m) ? -m * vp.v.sy : -vp.v.sy * 1e9 * Math.sign(m);
        const L = Math.hypot(dx, dy);
        dx = (dx / L) * half; dy = (dy / L) * half;
        ctx.moveTo(px - dx, py - dy); ctx.lineTo(px + dx, py + dy);
      }
      ctx.stroke();
      return;
    }
    case 'bars': {
      const cy = (y: number) => Math.max(-10, Math.min(vp.H + 10, vp.py(y)));
      const y0 = cy(0);
      for (const hi of [false, true]) {
        ctx.beginPath();
        for (const b of v.bars) {
          if (!!b.hi !== hi) continue;
          const x0 = vp.px(b.x0), x1 = vp.px(b.x1);
          ctx.moveTo(x0, y0); ctx.lineTo(x0, cy(b.h)); ctx.lineTo(x1, cy(b.h)); ctx.lineTo(x1, y0); ctx.closePath();
        }
        ctx.globalAlpha = hi ? 0.6 : 0.22; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 1.2; ctx.stroke();
      }
      const top = v.bars.filter((b) => b.hi);
      if (v.value !== undefined && top.length) {
        labels.push({ p: { x: top[0].x0, y: Math.max(...top.map((b) => b.h)) }, text: `${name} = ${fmt(v.value, 4)}`, color });
      }
      return;
    }
    case 'boxplot': {
      const [mn, q1, md, q3, mx] = v.s.map((x) => vp.px(x));
      const yc = vp.py(v.y), hh = Math.min(30, 0.4 * vp.v.sy);
      ctx.beginPath();
      ctx.moveTo(q1, yc - hh); ctx.lineTo(q3, yc - hh); ctx.lineTo(q3, yc + hh); ctx.lineTo(q1, yc + hh); ctx.closePath();
      ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
      ctx.moveTo(md, yc - hh); ctx.lineTo(md, yc + hh);
      ctx.moveTo(mn, yc); ctx.lineTo(q1, yc); ctx.moveTo(q3, yc); ctx.lineTo(mx, yc);
      ctx.moveTo(mn, yc - hh / 2); ctx.lineTo(mn, yc + hh / 2); ctx.moveTo(mx, yc - hh / 2); ctx.lineTo(mx, yc + hh / 2);
      ctx.stroke();
      return;
    }
    case 'polyline': {
      ctx.beginPath();
      let pen = false;
      for (const p of v.pts) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { pen = false; continue; }
        const x = Math.max(-1e4, Math.min(vp.W + 1e4, vp.px(p.x))), y = Math.max(-1e4, Math.min(vp.H + 1e4, vp.py(p.y)));
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
      break;
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
  Object.assign(C, o.light ? LIGHT : DARK);
  const vp = new Viewport(o.view, o.W, o.H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, o.W, o.H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  setFontScale((o.settings.fontSize ?? 14) / 14);
  drawGrid(ctx, vp, o.settings);

  const labels: { p: Vec2; text: string; color: string }[] = [];
  const points: { p: Vec2; color: string; name: string; free: boolean; selected: boolean; hollow?: boolean; label: boolean }[] = [];
  const texts: { v: Extract<Value, { type: 'label' }>; color: string }[] = [];

  for (const r of items) {
    const { obj, value: v } = r;
    if (!v || !obj.visible) continue;
    const selected = o.selectedId === obj.id;
    const width = (obj.lineWidth ?? 2.5) + (selected ? 1 : 0);
    const showLabel = obj.showLabel ?? labelDefault(o.settings, o.mode ?? 'graphing', v.type === 'point');
    if (v.type === 'point') { points.push({ p: v.p, color: obj.color, name: obj.name, free: v.free || !!v.on, selected, label: showLabel }); continue; }
    if (v.type === 'points') { v.pts.forEach((p) => points.push({ p, color: obj.color, name: '', free: false, selected, label: false })); continue; }
    if (v.type === 'text') { v.pts?.forEach((p) => points.push({ p, color: obj.color, name: '', free: false, selected, hollow: true, label: false })); continue; }
    if (v.type === 'label') { if (!o.htmlText) texts.push({ v, color: o.light && obj.color === '#DCDCDC' ? C.text : obj.color }); continue; }
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

  for (const t of texts) drawLabel(ctx, vp, t.v, t.color);

  const ov = o.overlay;
  if (ov) {
    if (ov.sketch && ov.sketch.pts.length > 1) {
      ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent;
      ctx.lineWidth = 2.5;
      sketch(ctx, vp, ov.sketch.pts, ov.sketch.arrow, 2.5);
    }
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
