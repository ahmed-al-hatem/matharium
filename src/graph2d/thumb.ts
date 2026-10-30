import { evaluateAll } from '../math/engine';
import type { Fn1, Value, Vec3 } from '../math/types';
import { migrateSettings, type ProjectFile, type Settings } from '../store/project';
import { draw } from './renderer';

/** The width the templates' views were laid out for. */
const DESIGN_W = 900;

/** Small preview of a project for the template picker. */
export function drawThumb(canvas: HTMLCanvasElement, p: ProjectFile) {
  const W = canvas.clientWidth || 200, H = canvas.clientHeight || 120;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const items = evaluateAll(p.objects ?? []);
  const settings: Settings = { ...migrateSettings(p.settings as Record<string, unknown> | undefined), digits: 2, lang: 'en' };
  if (p.mode === '3d') { drawThumb3d(ctx, items.map((r) => (r.obj.visible ? { v: r.value, color: r.obj.color } : null)), W, H, settings.range3d); return; }
  const k = W / DESIGN_W;
  const view = { ...p.view, sx: p.view.sx * k * 1.6, sy: p.view.sy * k * 1.6 };
  draw(ctx, items, { W, H, view, settings: { ...settings, labels: 'none' }, selectedId: null, htmlText: true });
}

/** A cheap isometric wireframe: enough to recognise a surface or a space curve. */
function drawThumb3d(ctx: CanvasRenderingContext2D, values: ({ v?: Value; color: string } | null)[], W: number, H: number, R: number) {
  const s = Math.min(W, H) / (R * 2.6);
  const P = (p: Vec3) => [W / 2 + (p.x - p.y) * 0.87 * s, H / 2 + (p.x + p.y) * 0.45 * s - p.z * s] as const;
  ctx.fillStyle = '#0D0E0D';
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  const path = (pts: Vec3[], color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    pts.forEach((q, i) => { const [x, y] = P(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  };
  for (const [a, b] of [[{ x: R, y: 0, z: 0 }, { x: -R, y: 0, z: 0 }], [{ x: 0, y: R, z: 0 }, { x: 0, y: -R, z: 0 }], [{ x: 0, y: 0, z: R }, { x: 0, y: 0, z: -R }]]) path([a, b], '#555');
  const clip = (z: number) => (Number.isFinite(z) ? Math.max(-R, Math.min(R, z)) : NaN);
  const curve = (fx: Fn1, fy: Fn1, fz: Fn1, t0: number, t1: number, color: string) => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 200; i++) { const t = t0 + ((t1 - t0) * i) / 200; pts.push({ x: fx(t), y: fy(t), z: fz(t) }); }
    path(pts.filter((q) => [q.x, q.y, q.z].every(Number.isFinite)), color);
  };
  values.forEach((it) => {
    const v = it?.v, color = it?.color ?? '#C4C5C4';
    if (!v) return;
    if (v.type === 'surface') {
      const n = 12;
      for (let j = 0; j <= n; j++) {
        const u = -R + (2 * R * j) / n;
        const row: Vec3[] = [], col: Vec3[] = [];
        for (let k = 0; k <= 30; k++) {
          const w = -R + (2 * R * k) / 30;
          row.push({ x: u, y: w, z: clip(v.f(u, w)) });
          col.push({ x: w, y: u, z: clip(v.f(w, u)) });
        }
        path(row.filter((q) => !Number.isNaN(q.z)), color);
        path(col.filter((q) => !Number.isNaN(q.z)), color);
      }
    } else if (v.type === 'curve3d') curve(v.fx, v.fy, v.fz, v.t0, v.t1, color);
    else if (v.type === 'sphere') {
      const [cx, cy] = P(v.c);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(cx, cy, v.r * s, 0, Math.PI * 2); ctx.stroke();
    } else if (v.type === 'point3d') {
      const [x, y] = P(v.p);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  });
}
