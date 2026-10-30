import type { Fn1, Vec2 } from './types';

export type FitKind = 'line' | 'poly' | 'exp' | 'log' | 'pow' | 'sin';

export interface Fit {
  kind: FitKind;
  /** line/poly: c0 + c1 x + …; exp: a e^(b x); log: a + b ln x; pow: a x^b; sin: a sin(b x + c) + d */
  params: number[];
  f: Fn1;
  r2: number;
}

const ok = Number.isFinite;

/** Least squares min |A p − y| by Householder QR (stable, unlike the raw normal equations). */
export function leastSquares(A: number[][], y: number[]): number[] {
  const m = A.length, n = A[0]?.length ?? 0;
  if (m < n || !n) throw new Error('Not enough points');
  const R = A.map((r) => r.slice());
  const b = y.slice();
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += R[i][k] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = R[k][k] > 0 ? -norm : norm;
    const v = new Array(m).fill(0);
    for (let i = k; i < m; i++) v[i] = R[i][k];
    v[k] -= alpha;
    const vv = v.reduce((s, x) => s + x * x, 0);
    if (vv === 0) continue;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * R[i][j];
      s = (2 * s) / vv;
      for (let i = k; i < m; i++) R[i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = k; i < m; i++) s += v[i] * b[i];
    s = (2 * s) / vv;
    for (let i = k; i < m; i++) b[i] -= s * v[i];
  }
  const p = new Array(n).fill(0);
  const scale = Math.max(...R.slice(0, n).map((r, i) => Math.abs(r[i])));
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(R[i][i]) <= 1e-12 * scale) throw new Error('Points do not determine this fit');
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= R[i][j] * p[j];
    p[i] = s / R[i][i];
  }
  return p;
}

/** Solve a small symmetric positive definite system by Cholesky; null if not positive definite. */
function cholesky(M: number[][], r: number[]): number[] | null {
  const n = r.length;
  const L = M.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = M[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  const z = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = r[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

const sse = (g: (p: number[], x: number) => number, p: number[], pts: Vec2[]) => {
  let s = 0;
  for (const q of pts) s += (q.y - g(p, q.x)) ** 2;
  return ok(s) ? s : Infinity;
};

/** Damped Gauss–Newton (Levenberg–Marquardt) with a numeric Jacobian. */
export function gaussNewton(g: (p: number[], x: number) => number, p0: number[], pts: Vec2[], iters = 100): number[] {
  let p = p0.slice();
  let cost = sse(g, p, pts);
  let lambda = 1e-3;
  const n = p.length;
  for (let it = 0; it < iters; it++) {
    const J: number[][] = [], r: number[] = [];
    for (const q of pts) {
      const base = g(p, q.x);
      r.push(q.y - base);
      J.push(p.map((v, k) => {
        const h = 1e-7 * Math.max(1, Math.abs(v));
        const pk = p.slice(); pk[k] = v + h;
        return (g(pk, q.x) - base) / h;
      }));
    }
    const JtJ = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J.reduce((s, row) => s + row[i] * row[j], 0)));
    const Jtr = Array.from({ length: n }, (_, i) => J.reduce((s, row, k) => s + row[i] * r[k], 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const M = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const d = cholesky(M, Jtr);
      if (d) {
        const next = p.map((v, i) => v + d[i]);
        const c = sse(g, next, pts);
        if (c < cost) {
          const rel = (cost - c) / Math.max(cost, 1e-300);
          p = next; cost = c; lambda = Math.max(lambda / 3, 1e-12); improved = true;
          if (rel < 1e-14) return p;
          break;
        }
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  return p;
}

export function rSquared(f: Fn1, pts: Vec2[]): number {
  const mean = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let res = 0, tot = 0;
  for (const p of pts) { res += (p.y - f(p.x)) ** 2; tot += (p.y - mean) ** 2; }
  if (tot === 0) return res === 0 ? 1 : 0;
  return 1 - res / tot;
}

const MODELS: Record<Exclude<FitKind, 'line' | 'poly'>, (p: number[], x: number) => number> = {
  exp: (p, x) => p[0] * Math.exp(p[1] * x),
  log: (p, x) => p[0] + p[1] * Math.log(x),
  pow: (p, x) => p[0] * Math.pow(x, p[1]),
  sin: (p, x) => p[0] * Math.sin(p[1] * x + p[2]) + p[3],
};

const polyEval = (c: number[]) => (x: number) => { let s = 0; for (let i = c.length - 1; i >= 0; i--) s = s * x + c[i]; return s; };

function finish(kind: FitKind, params: number[], f: Fn1, pts: Vec2[]): Fit {
  if (!params.every(ok)) throw new Error('Fit did not converge');
  return { kind, params, f, r2: rSquared(f, pts) };
}

function usable(pts: Vec2[], min: number) {
  const good = pts.filter((p) => ok(p.x) && ok(p.y));
  if (good.length < min) throw new Error(`Needs at least ${min} points`);
  return good;
}

export function fitPoly(pts: Vec2[], degree: number): Fit {
  const n = Math.round(degree);
  if (n < 0 || n > 10) throw new Error('Degree must be between 0 and 10');
  pts = usable(pts, n + 1);
  const c = leastSquares(pts.map((p) => Array.from({ length: n + 1 }, (_, k) => p.x ** k)), pts.map((p) => p.y));
  return finish(n === 1 ? 'line' : 'poly', c, polyEval(c), pts);
}

export const fitLine = (pts: Vec2[]) => fitPoly(pts, 1);

export function fitExp(pts: Vec2[]): Fit {
  pts = usable(pts, 2);
  // ln|y| = ln|a| + b x when every y has the same sign; otherwise start from a flat guess
  const sign = pts.every((p) => p.y > 0) ? 1 : pts.every((p) => p.y < 0) ? -1 : 0;
  let p0 = [pts.reduce((s, p) => s + p.y, 0) / pts.length, 0];
  if (sign) {
    const [la, b] = leastSquares(pts.map((p) => [1, p.x]), pts.map((p) => Math.log(sign * p.y)));
    p0 = [sign * Math.exp(la), b];
  }
  const p = gaussNewton(MODELS.exp, p0, pts);
  return finish('exp', p, (x) => MODELS.exp(p, x), pts);
}

export function fitLog(pts: Vec2[]): Fit {
  pts = usable(pts, 2);
  if (pts.some((p) => p.x <= 0)) throw new Error('FitLog needs x > 0');
  // linear in its parameters: the least-squares solution is exact, Gauss–Newton only polishes rounding
  const p = gaussNewton(MODELS.log, leastSquares(pts.map((q) => [1, Math.log(q.x)]), pts.map((q) => q.y)), pts, 5);
  return finish('log', p, (x) => MODELS.log(p, x), pts);
}

export function fitPow(pts: Vec2[]): Fit {
  pts = usable(pts, 2);
  if (pts.some((p) => p.x <= 0)) throw new Error('FitPow needs x > 0');
  const sign = pts.every((p) => p.y > 0) ? 1 : pts.every((p) => p.y < 0) ? -1 : 0;
  let p0 = [1, 1];
  if (sign) {
    const [la, b] = leastSquares(pts.map((p) => [1, Math.log(p.x)]), pts.map((p) => Math.log(sign * p.y)));
    p0 = [sign * Math.exp(la), b];
  }
  const p = gaussNewton(MODELS.pow, p0, pts);
  return finish('pow', p, (x) => MODELS.pow(p, x), pts);
}

/** Best a sin(b x) + c cos(b x) + d for a fixed b, by linear least squares. */
function sinAt(pts: Vec2[], b: number): { p: number[]; cost: number } | null {
  try {
    const [s, c, d] = leastSquares(pts.map((q) => [Math.sin(b * q.x), Math.cos(b * q.x), 1]), pts.map((q) => q.y));
    const p = [Math.hypot(s, c), b, Math.atan2(c, s), d];
    return { p, cost: sse(MODELS.sin, p, pts) };
  } catch {
    return null;
  }
}

export function fitSin(pts: Vec2[]): Fit {
  pts = usable(pts, 4).slice().sort((p, q) => p.x - q.x);
  const span = pts[pts.length - 1].x - pts[0].x;
  if (!(span > 0)) throw new Error('Points need different x values');
  const mean = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  // initial frequency from zero crossings of y − mean (two crossings per period) …
  const cross: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].y - mean, b = pts[i].y - mean;
    if (a === 0 || a * b < 0) cross.push(pts[i - 1].x + (a / (a - b || 1)) * (pts[i].x - pts[i - 1].x));
  }
  const candidates: number[] = [];
  if (cross.length >= 2) candidates.push((Math.PI * (cross.length - 1)) / (cross[cross.length - 1] - cross[0]));
  // … checked against a scan of frequencies up to the sampling limit (handles noise and uneven spacing)
  const minDx = Math.max(span / 1e4, Math.min(...pts.slice(1).map((p, i) => p.x - pts[i].x).filter((d) => d > 0)));
  const bMax = Math.PI / minDx, bMin = Math.PI / span;
  for (let i = 0; i <= 400; i++) candidates.push(bMin * (bMax / bMin) ** (i / 400));
  let best: { p: number[]; cost: number } | null = null;
  for (const b of candidates) {
    const s = ok(b) && b > 0 ? sinAt(pts, b) : null;
    if (s && (!best || s.cost < best.cost)) best = s;
  }
  if (!best) throw new Error('Fit did not converge');
  let p = gaussNewton(MODELS.sin, best.p, pts);
  // canonical form: a > 0, b > 0, c in (−π, π]
  if (p[1] < 0) p = [-p[0], -p[1], -p[2], p[3]];
  if (p[0] < 0) p = [-p[0], p[1], p[2] + Math.PI, p[3]];
  p[2] = Math.atan2(Math.sin(p[2]), Math.cos(p[2]));
  const q = p;
  return finish('sin', q, (x) => MODELS.sin(q, x), pts);
}

const n = (v: number, digits: number) => {
  const r = Number(v.toPrecision(Math.max(digits, 1) + 2));
  return Math.abs(r) < 1e-12 ? 0 : r;
};

/** The fitted formula as an expression in x; `digits` rounds for display, Infinity keeps full precision. */
export function fitExpr(fit: Fit, digits = Infinity): string {
  const v = (x: number) => (digits === Infinity ? x : n(x, digits));
  const sum = (terms: string[]) => terms.join(' + ').replace(/\+ -/g, '- ') || '0';
  const p = fit.params.map(v);
  switch (fit.kind) {
    case 'line': case 'poly': {
      const coef = (c: number) => (c === 1 ? '' : c === -1 ? '-' : `${c} `);
      const terms = p.map((c, k) => (c === 0 && p.length > 1 ? '' : k === 0 ? `${c}` : k === 1 ? `${coef(c)}x` : `${coef(c)}x^${k}`)).filter(Boolean).reverse();
      return sum(terms);
    }
    case 'exp': return `${p[0]} e^(${p[1]} x)`;
    case 'log': return sum([`${p[0]}`, `${p[1]} ln(x)`]);
    case 'pow': return `${p[0]} x^(${p[1]})`;
    case 'sin': return sum([`${p[0]} sin(${sum([`${p[1]} x`, `${p[2]}`])})`, `${p[3]}`]);
  }
}

export const FITS: Record<string, (pts: Vec2[], arg?: number) => Fit> = {
  FitLine: fitLine,
  FitPoly: (pts, deg = 2) => fitPoly(pts, deg),
  FitExp: fitExp,
  FitLog: fitLog,
  FitPow: fitPow,
  FitSin: fitSin,
};
