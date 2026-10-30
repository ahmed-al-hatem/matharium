import type { Fn1, Fn2 } from './types';

export type RiemannRule = 'left' | 'right' | 'mid' | 'trap';
export const RIEMANN_RULES: RiemannRule[] = ['left', 'right', 'mid', 'trap'];

/** Riemann sum of f on [a, b] with n strips. */
export function riemannSum(f: Fn1, a: number, b: number, n: number, rule: RiemannRule): number {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * h, x1 = x0 + h;
    s += rule === 'left' ? f(x0) : rule === 'right' ? f(x1) : rule === 'mid' ? f((x0 + x1) / 2) : (f(x0) + f(x1)) / 2;
  }
  return s * h;
}

/** Height of strip i (for drawing); for the trapezoid rule both ends are returned. */
export function riemannStrip(f: Fn1, a: number, h: number, i: number, rule: RiemannRule): [number, number] {
  const x0 = a + i * h, x1 = x0 + h;
  if (rule === 'trap') return [f(x0), f(x1)];
  const y = rule === 'left' ? f(x0) : rule === 'right' ? f(x1) : f((x0 + x1) / 2);
  return [y, y];
}

function rk4Step(F: Fn2, x: number, y: number, h: number) {
  const k1 = F(x, y);
  const k2 = F(x + h / 2, y + (h / 2) * k1);
  const k3 = F(x + h / 2, y + (h / 2) * k2);
  const k4 = F(x + h, y + h * k3);
  return y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/**
 * Classic RK4 for y' = F(x, y), from (x0, y0) for `steps` steps of size h (h may be negative).
 * Stops where the solution leaves the plane or breaks down (a step disagrees with two half steps,
 * e.g. where the slope becomes vertical).
 */
export function rk4(F: Fn2, x0: number, y0: number, h: number, steps: number, limit = 1e6): { xs: number[]; ys: number[] } {
  const xs = [x0], ys = [y0];
  let x = x0, y = y0;
  for (let i = 0; i < steps; i++) {
    const yn = rk4Step(F, x, y, h);
    const half = rk4Step(F, x + h / 2, rk4Step(F, x, y, h / 2), h / 2);
    if (!Number.isFinite(yn) || Math.abs(yn) > limit || Math.abs(yn - half) > 1e-6 * (1 + Math.abs(yn))) break;
    x = x0 + (i + 1) * h; y = yn;
    xs.push(x); ys.push(y);
  }
  return { xs, ys };
}

/**
 * Solution of y' = F(x, y) through (x0, y0) as a function of x, integrated both ways over
 * [x0 - span, x0 + span]. Between grid points it uses cubic Hermite interpolation (slopes from F),
 * so it stays as accurate as RK4 itself. Outside the solved interval it is NaN.
 */
export function solveODE(F: Fn2, x0: number, y0: number, span = 50, h = 0.01): Fn1 {
  const steps = Math.round(span / h);
  const fwd = rk4(F, x0, y0, h, steps), back = rk4(F, x0, y0, -h, steps);
  const xs = [...back.xs.slice(1).reverse(), ...fwd.xs];
  const ys = [...back.ys.slice(1).reverse(), ...fwd.ys];
  const ds = xs.map((x, i) => F(x, ys[i]));
  const lo = xs[0], hi = xs[xs.length - 1], i0 = back.xs.length - 1;
  return (x) => {
    if (!(x >= lo && x <= hi)) return NaN;
    const k = Math.min(xs.length - 2, Math.max(0, i0 + Math.floor((x - x0) / h)));
    const xa = xs[k], dx = xs[k + 1] - xa, t = (x - xa) / dx;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * dx * ds[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * dx * ds[k + 1];
  };
}

const FACT = [1];
for (let i = 1; i <= 30; i++) FACT[i] = FACT[i - 1] * i;

/** Taylor coefficients c_k = f⁽ᵏ⁾(a) / k! from derivative values f⁽ᵏ⁾(a). */
export const taylorCoeffs = (derivs: number[]) => derivs.map((d, k) => d / FACT[k]);

export function polyAt(c: number[], a: number): Fn1 {
  return (x) => {
    let s = 0;
    for (let k = c.length - 1; k >= 0; k--) s = s * (x - a) + c[k];
    return s;
  };
}

/** "1 + x - x^3/6"-style text for Σ c_k (x − a)^k (coefficients rounded for display). */
export function polyText(c: number[], a: number, digits = 6): string {
  const base = a === 0 ? 'x' : `(x ${a < 0 ? '+' : '-'} ${Math.abs(a)})`;
  const terms: string[] = [];
  c.forEach((v, k) => {
    const r = +v.toFixed(digits);
    if (r === 0) return;
    const mag = Math.abs(r);
    const pow = k === 0 ? '' : k === 1 ? base : `${base}^${k}`;
    const coef = k === 0 ? `${mag}` : mag === 1 ? '' : `${mag} `;
    terms.push(`${r < 0 ? '-' : '+'} ${coef}${pow}`);
  });
  if (!terms.length) return '0';
  const s = terms.join(' ');
  return s.startsWith('+ ') ? s.slice(2) : `-${s.slice(2)}`;
}
