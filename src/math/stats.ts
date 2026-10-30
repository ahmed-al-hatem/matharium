export interface Bar { x0: number; x1: number; h: number; hi?: boolean }

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function mean(xs: number[]) {
  if (!xs.length) throw new Error('Empty list');
  return sum(xs) / xs.length;
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

function medianSorted(s: number[]) {
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function median(xs: number[]) {
  if (!xs.length) throw new Error('Empty list');
  return medianSorted(sorted(xs));
}

/** Population standard deviation (like a calculator's σx). */
export function sd(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
}

/** Min, Q1, median, Q3, max; quartiles are medians of the lower/upper halves (median excluded for odd n). */
export function fiveNumber(xs: number[]): [number, number, number, number, number] {
  if (!xs.length) throw new Error('Empty list');
  const s = sorted(xs);
  const half = s.length >> 1;
  const lower = s.slice(0, half), upper = s.slice(s.length - half);
  return [s[0], lower.length ? medianSorted(lower) : s[0], medianSorted(s), upper.length ? medianSorted(upper) : s[0], s[s.length - 1]];
}

/** Frequency bars of width w starting at a multiple of w; a value on a boundary goes to the bin on its right. */
export function histogram(xs: number[], w: number): Bar[] {
  if (!xs.length) throw new Error('Empty list');
  if (!(w > 0)) throw new Error('Bin width must be positive');
  const lo = Math.floor(Math.min(...xs) / w + 1e-9) * w;
  const n = Math.max(1, Math.floor((Math.max(...xs) - lo) / w + 1e-9) + 1);
  if (n > 2000) throw new Error('Too many bins');
  const counts = new Array<number>(n).fill(0);
  for (const x of xs) counts[Math.min(n - 1, Math.floor((x - lo) / w + 1e-9))]++;
  return counts.map((h, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, h }));
}

/** erfc with fractional error below 1.2e-7 (Numerical Recipes, Chebyshev fit). */
function erfc(x: number) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export const normalPdf = (mu: number, s: number) => (x: number) => Math.exp(-(((x - mu) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI));
export const normalCdf = (mu: number, s: number, x: number) => 0.5 * erfc(-(x - mu) / (s * Math.SQRT2));

export function binomialPmf(n: number, p: number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 5000) throw new Error('n must be a whole number from 0 to 5000');
  if (!(p >= 0 && p <= 1)) throw new Error('p must be between 0 and 1');
  // in log space so large n does not overflow
  const lf = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  return Array.from({ length: n + 1 }, (_, k) => {
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(lf[n] - lf[k] - lf[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
  });
}
