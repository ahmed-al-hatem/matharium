import type { Fn1, Fn2, Vec2 } from './types';

const ok = (v: number) => Number.isFinite(v);

function bisect(f: Fn1, a: number, b: number, fa: number): number {
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (!ok(fm)) return NaN;
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

function minimizeAbs(f: Fn1, a: number, b: number): number {
  const g = (x: number) => Math.abs(f(x));
  for (let i = 0; i < 80; i++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
    if (g(m1) < g(m2)) b = m2; else a = m1;
  }
  return (a + b) / 2;
}

function dedupe(xs: number[], tol = 1e-6): number[] {
  const out: number[] = [];
  for (const x of xs.sort((p, q) => p - q)) if (!out.length || Math.abs(x - out[out.length - 1]) > tol) out.push(x);
  return out.map((x) => (Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x));
}

/** All real roots of f on [a, b], including touching (even multiplicity) roots. Samples ~200 points per unit. */
export function roots(f: Fn1, a = -50, b = 50, n = Math.min(40000, Math.max(2000, Math.ceil((b - a) * 200)))): number[] {
  const res: number[] = [];
  const h = (b - a) / n;
  let x0 = a, f0 = f(x0);
  let fPrev = NaN;
  for (let i = 1; i <= n; i++) {
    const x1 = a + i * h, f1 = f(x1);
    if (ok(f0) && ok(f1)) {
      if (f0 === 0) res.push(x0);
      else if (Math.sign(f0) !== Math.sign(f1) && f1 !== 0) {
        const r = bisect(f, x0, x1, f0);
        // reject poles (sign change through infinity)
        if (ok(r) && Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(f0), Math.abs(f1))) res.push(r);
      } else if (ok(fPrev) && Math.abs(f0) <= Math.abs(fPrev) && Math.abs(f0) <= Math.abs(f1)) {
        const r = minimizeAbs(f, x0 - h, x1);
        if (Math.abs(f(r)) < 1e-9) res.push(r);
      }
    }
    fPrev = f0; x0 = x1; f0 = f1;
  }
  if (ok(f0) && f0 === 0) res.push(x0);
  return dedupe(res);
}

export function derivative(f: Fn1, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

export function extrema(f: Fn1, a = -50, b = 50): Vec2[] {
  const d = (x: number) => derivative(f, x);
  return roots(d, a, b, Math.min(8000, Math.max(1000, Math.ceil((b - a) * 80))))
    .filter((x) => {
      const h = 1e-3;
      const l = f(x - h), c = f(x), r = f(x + h);
      return ok(c) && ((c >= l && c >= r) || (c <= l && c <= r));
    })
    .map((x) => ({ x, y: f(x) }));
}

export function integrate(f: Fn1, a: number, b: number, n = 2000): number {
  if (a === b) return 0;
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** Solve a system of two equations F=0, G=0 using multistart Newton. */
export function solveSystem(F: Fn2, G: Fn2, range = 10): Vec2[] {
  const found: Vec2[] = [];
  const step = range / 5;
  for (let sx = -range; sx <= range; sx += step) {
    for (let sy = -range; sy <= range; sy += step) {
      let x = sx + 0.137, y = sy - 0.071;
      for (let it = 0; it < 60; it++) {
        const f = F(x, y), g = G(x, y);
        if (!ok(f) || !ok(g)) break;
        const h = 1e-6;
        const fx = (F(x + h, y) - f) / h, fy = (F(x, y + h) - f) / h;
        const gx = (G(x + h, y) - g) / h, gy = (G(x, y + h) - g) / h;
        const det = fx * gy - fy * gx;
        if (Math.abs(det) < 1e-14) break;
        const dx = (f * gy - fy * g) / det, dy = (fx * g - f * gx) / det;
        x -= dx; y -= dy;
        if (Math.abs(dx) + Math.abs(dy) < 1e-12) break;
      }
      if (ok(x) && ok(y) && Math.abs(F(x, y)) < 1e-8 && Math.abs(G(x, y)) < 1e-8 &&
        !found.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-5)) found.push({ x: clean(x), y: clean(y) });
    }
  }
  return found.sort((p, q) => p.x - q.x || p.y - q.y);
}

export function clean(v: number) {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

export function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'undefined' : v > 0 ? '∞' : '−∞';
  const r = Number(v.toFixed(digits));
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
}

export const fmtPt = (p: Vec2, d = 4) => `(${fmt(p.x, d)}, ${fmt(p.y, d)})`;
