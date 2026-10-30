import type { MathNode } from 'mathjs';
import { compileFn, freeSymbols, isKnownName, math, parseExpr, texName, toTex, UndefinedSymbolError, type Scope } from './compile';
import { asCommand, asList, asPolar, asPolarCurve, asTuple, normalize, splitDefinition, splitRelation } from './parser';
import { clean, extrema, fmt, fmtPt, integrate, derivative as numDeriv, roots, solveSystem } from './solve';
import { angle, asLine, circleThrough, dist, implicitOf, intersectGeom, mid, polygonArea, projectOnLine, sub } from './geometry';
import { FITS, fitExpr } from './fit';
import { polarRange, polarXY } from './polar';
import type { Fn1, Fn2, MObj, Resolved, Value, Vec2, Vec3 } from './types';

const VARS = ['x', 'y', 'z', 't'];
const NUM_LITERAL = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;
/** A number, optionally in degrees (normalize turns ° into *(pi/180)). */
const ANGLE_LITERAL = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*(\*\(pi\/180\))?\s*$/i;
const DEG_SUFFIX = /^([\s\S]*)\*\(pi\/180\)\s*$/;

interface Out { value: Value; display?: string; tex?: string }

class EvalError extends Error {}

const texEscape = (s: string) => s.replace(/([#$%&_{}])/g, '\\$1').replace(/\^/g, '\\hat{}');

function tryTex(src: string): string {
  const rel = splitRelation(src);
  if (rel) return `${tryTex(rel.lhs)} ${({ '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' })[rel.op]} ${tryTex(rel.rhs)}`;
  const tup = asTuple(src);
  if (tup) return `\\left(${tup.map(tryTex).join(', ')}\\right)`;
  const pol = asPolar(src);
  if (pol) return `\\left(${tryTex(pol[0])};\\ ${angleTex(pol[1])}\\right)`;
  const list = asList(src);
  if (list) return `\\left\\{${list.map(tryTex).join(', ')}\\right\\}`;
  const cmd = asCommand(src);
  if (cmd) return `\\mathrm{${cmd.name}}\\left(${cmd.args.map(tryTex).join(', ')}\\right)`;
  try {
    return toTex(parseExpr(src));
  } catch {
    return `\\text{${texEscape(src)}}`;
  }
}

function angleTex(src: string): string {
  const m = DEG_SUFFIX.exec(src.trim());
  return m ? `${tryTex(m[1])}^\\circ` : tryTex(src);
}

/** R² rounded down, so a good fit never shows as a perfect 1. */
function r2Text(r2: number, digits: number) {
  if (r2 >= 1 - 1e-12) return '1';
  const p = 10 ** digits;
  return fmt(Math.floor(r2 * p) / p, digits);
}

/** "6π", "2π", "π" for a θ bound. */
function piText(v: number) {
  const k = v / Math.PI;
  if (Math.abs(k - Math.round(k)) < 1e-9) return Math.round(k) === 1 ? 'π' : `${Math.round(k)}π`;
  return fmt(v, 4);
}

export class Engine {
  scope: Scope = {};
  values = new Map<string, Value>();
  nodes = new Map<string, { node: MathNode; param: string }>();
  constructor(public digits = 4) {}

  private f(v: number) { return fmt(v, this.digits); }

  register(name: string, v: Value) {
    this.values.set(name, v);
    const s = this.scope;
    switch (v.type) {
      case 'number': s[name] = v.value; break;
      case 'integral': s[name] = v.value; break;
      case 'angle': s[name] = v.value; break;
      case 'function': {
        s[name] = v.f;
        // f' and f'' are built on first use: symbolic derivatives are slow and rarely needed
        const n = this.nodes.get(name);
        const deriv = (order: 1 | 2, fallback: () => Fn1): Fn1 => {
          if (n) {
            try {
              let d = math.derivative(n.node, n.param);
              if (order === 2) d = math.derivative(d, n.param);
              return compileFn(d, [n.param], s) as Fn1;
            } catch { /* numeric fallback */ }
          }
          return fallback();
        };
        const lazy = (key: string, make: () => Fn1) => {
          let cached: Fn1 | undefined;
          Object.defineProperty(s, key, { configurable: true, enumerable: true, get: () => (cached ??= make()) });
        };
        lazy(`${name}_d1`, () => deriv(1, () => (x) => numDeriv(v.f, x)));
        lazy(`${name}_d2`, () => deriv(2, () => { const d1 = s[`${name}_d1`] as Fn1; return (x) => numDeriv(d1, x); }));
        break;
      }
      case 'surface': s[name] = v.f; break;
      case 'point': s[name] = { x: v.p.x, y: v.p.y }; break;
      case 'point3d': s[name] = { ...v.p }; break;
      case 'segment': case 'vector': s[name] = dist(v.a, v.b); break;
      case 'polygon': s[name] = polygonArea(v.pts); break;
      case 'circle': s[name] = 2 * Math.PI * v.r; break;
    }
  }

  // ---------- argument helpers ----------
  node(src: string) { return parseExpr(normalize(src), this.scope); }

  num(src: string): number {
    const n = this.node(src);
    const v = compileFn(n, [], this.scope)();
    if (!Number.isFinite(v)) throw new EvalError(`Not a number: ${src}`);
    return v;
  }

  obj(src: string): Value | undefined {
    const name = src.trim();
    if (this.values.has(name)) return this.values.get(name);
    // unknown bare name: let evaluateAll retry once it is defined (or auto-create a slider)
    if (/^[A-Za-z]\w*$/.test(name) && !VARS.includes(name) && !(name in this.scope) && !isKnownName(name, this.scope)) {
      throw new UndefinedSymbolError(name);
    }
    const tup = asTuple(src);
    if (tup) return this.evalTuple(tup).value;
    const pol = asPolar(src);
    if (pol) return this.evalPolar(pol).value;
    const list = asList(src);
    if (list) return this.evalList(list);
    const cmd = asCommand(src);
    if (cmd) return this.command(cmd.name, cmd.args, 'tmp').value;
    return undefined;
  }

  /** Points of a list literal or a named list / polygon. */
  ptList(src: string): Vec2[] {
    const v = this.obj(src);
    if (v?.type === 'points' || v?.type === 'polygon') return v.pts;
    throw new EvalError(`Expected a list of points: ${src}`);
  }

  pt(src: string): Vec2 {
    const v = this.obj(src);
    if (v?.type === 'point') return v.p;
    if (v?.type === 'point3d') return { x: v.p.x, y: v.p.y };
    throw new EvalError(`Expected a point: ${src}`);
  }

  pt3(src: string): Vec3 {
    const v = this.obj(src);
    if (v?.type === 'point3d') return v.p;
    if (v?.type === 'point') return { ...v.p, z: 0 };
    throw new EvalError(`Expected a point: ${src}`);
  }

  /** A function of x: either a function object or an expression in x. */
  fn(src: string): { f: Fn1; node?: MathNode; param: string } {
    const name = src.trim();
    const v = this.values.get(name);
    if (v?.type === 'function') return { f: v.f, node: this.nodes.get(name)?.node, param: v.param };
    if (v) throw new EvalError(`${name} is not a function`);
    // a bare unknown name here is a missing function, not a number to turn into a slider
    if (/^[A-Za-z]\w*$/.test(name) && !VARS.includes(name) && !(name in this.scope)) throw new UndefinedSymbolError(name, true);
    const n = this.node(src);
    const syms = [...freeSymbols(n)].filter((s) => !(s in this.scope));
    const param = syms.find((s) => VARS.includes(s)) ?? 'x';
    return { f: compileFn(n, [param], this.scope) as Fn1, node: n, param };
  }

  /** Equation (or expression = 0) as difference node. */
  eqNode(src: string): MathNode {
    const rel = splitRelation(normalize(src));
    if (!rel) return this.node(src);
    return new math.OperatorNode('-', 'subtract', [this.node(rel.lhs), new math.ParenthesisNode(this.node(rel.rhs))]) as MathNode;
  }

  unknowns(n: MathNode) { return [...freeSymbols(n)].filter((s) => !(s in this.scope)); }

  evalTuple(parts: string[]): Out {
    const free = parts.every((p) => NUM_LITERAL.test(p));
    const c = parts.map((p) => clean(this.num(p)));
    if (c.length === 3) return { value: { type: 'point3d', p: { x: c[0], y: c[1], z: c[2] } }, display: `(${c.map((v) => this.f(v)).join(', ')})` };
    return { value: { type: 'point', p: { x: c[0], y: c[1] }, free }, display: free ? undefined : fmtPt({ x: c[0], y: c[1] }, this.digits) };
  }

  /** "(r; θ)": a point given by its distance from the origin and its angle. */
  evalPolar([rs, ts]: [string, string]): Out {
    const free = NUM_LITERAL.test(rs) && ANGLE_LITERAL.test(ts);
    const r = this.num(rs), th = this.num(ts);
    const p = { x: clean(r * Math.cos(th)), y: clean(r * Math.sin(th)) };
    return { value: { type: 'point', p, free }, display: fmtPt(p, this.digits) };
  }

  evalList(list: string[]): Value {
    const items = list.map((s) => { const pol = asPolar(s); return pol ? this.evalPolar(pol).value : this.evalTuple(asTuple(s) ?? [s]).value; });
    if (items.every((v) => v.type === 'point')) return { type: 'points', pts: items.map((v) => (v as { p: Vec2 }).p) };
    if (items.every((v) => v.type === 'point3d')) return { type: 'points3d', pts: items.map((v) => (v as { p: Vec3 }).p) };
    throw new EvalError('Lists may contain points only');
  }

  ptsDisplay(pts: Vec2[]) {
    return pts.length ? pts.map((p) => fmtPt(p, this.digits)).join(', ') : 'none';
  }

  // ---------- commands ----------
  command(name: string, args: string[], selfName: string): Out {
    const A = args;
    const need = (n: number) => { if (A.length < n) throw new EvalError(`${name} needs ${n} argument${n > 1 ? 's' : ''}`); };
    const lineOf = (s: string) => {
      const v = this.obj(s);
      const l = v && asLine(v);
      if (!l) throw new EvalError(`Expected a line: ${s}`);
      return l;
    };
    switch (name) {
      case 'Solve': case 'NSolve': {
        need(1);
        const eqs = A.filter((a) => !/^[a-z]$/.test(a));
        if (eqs.length >= 2) {
          const F = compileFn(this.eqNode(eqs[0]), ['x', 'y'], this.scope) as Fn2;
          const G = compileFn(this.eqNode(eqs[1]), ['x', 'y'], this.scope) as Fn2;
          const sol = solveSystem(F, G, 20);
          return {
            value: { type: 'text', text: '', pts: sol },
            display: sol.length ? sol.map((p) => `{x = ${this.f(p.x)}, y = ${this.f(p.y)}}`).join(', ') : 'no real solution',
          };
        }
        const n = this.eqNode(eqs[0]);
        const unk = this.unknowns(n);
        const v = A.find((a) => /^[a-z]$/.test(a)) ?? (unk.includes('x') ? 'x' : unk[0] ?? 'x');
        if (unk.filter((u) => u !== v).length) throw new EvalError(`Unknown: ${unk.filter((u) => u !== v).join(', ')}`);
        const f = compileFn(n, [v], this.scope) as Fn1;
        const r = roots(f, -100, 100);
        return {
          value: { type: 'text', text: '', pts: v === 'x' ? r.map((x) => ({ x, y: 0 })) : undefined },
          display: r.length ? r.map((x) => `${v} = ${this.f(x)}`).join(', ') : 'no real solution',
        };
      }
      case 'Roots': {
        need(1);
        const { f } = this.fn(A[0]);
        const [a, b] = A.length >= 3 ? [this.num(A[1]), this.num(A[2])] : [-100, 100];
        const pts = roots(f, a, b).map((x) => ({ x, y: 0 }));
        return { value: { type: 'points', pts }, display: this.ptsDisplay(pts) };
      }
      case 'Extremum': {
        need(1);
        const { f } = this.fn(A[0]);
        const [a, b] = A.length >= 3 ? [this.num(A[1]), this.num(A[2])] : [-50, 50];
        const pts = extrema(f, a, b).map((p) => ({ x: clean(p.x), y: clean(p.y) }));
        return { value: { type: 'points', pts }, display: this.ptsDisplay(pts) };
      }
      case 'Intersect': {
        need(2);
        const va = this.obj(A[0]), vb = this.obj(A[1]);
        const isFn = (v: Value | undefined, s: string) => v?.type === 'function' || (!v && !splitRelation(s) && !asTuple(s));
        let pts: Vec2[] | null = null;
        if (va && vb) pts = intersectGeom(va, vb);
        if (!pts && isFn(va, A[0]) && isFn(vb, A[1])) {
          const f = this.fn(A[0]).f, g = this.fn(A[1]).f;
          pts = roots((x) => f(x) - g(x), -100, 100).map((x) => ({ x, y: clean(f(x)) }));
        }
        if (!pts) {
          const ga = va ? implicitOf(va) : compileFn(this.eqNode(A[0]), ['x', 'y'], this.scope) as Fn2;
          const gb = vb ? implicitOf(vb) : compileFn(this.eqNode(A[1]), ['x', 'y'], this.scope) as Fn2;
          if (isFn(va, A[0]) && gb) { const f = this.fn(A[0]).f; pts = roots((x) => gb(x, f(x))).map((x) => ({ x, y: clean(f(x)) })); }
          else if (isFn(vb, A[1]) && ga) { const f = this.fn(A[1]).f; pts = roots((x) => ga(x, f(x))).map((x) => ({ x, y: clean(f(x)) })); }
          else if (ga && gb) pts = solveSystem(ga, gb, 20);
        }
        if (!pts) throw new EvalError('Cannot intersect these objects');
        return { value: { type: 'points', pts }, display: this.ptsDisplay(pts) };
      }
      case 'Derivative': {
        need(1);
        const { f, node, param } = this.fn(A[0]);
        const order = A.length > 1 ? Math.round(this.num(A[1])) : 1;
        if (node) {
          try {
            let d = node;
            for (let i = 0; i < order; i++) d = math.simplify(math.derivative(d, param));
            this.nodes.set(selfName, { node: d, param });
            return { value: { type: 'function', f: compileFn(d, [param], this.scope) as Fn1, param, tex: toTex(d) }, display: undefined, tex: `${texName(selfName)}(${param}) = ${toTex(d)}` };
          } catch { /* fall back to numeric */ }
        }
        let g = f;
        for (let i = 0; i < order; i++) { const h = g; g = (x) => numDeriv(h, x); }
        return { value: { type: 'function', f: g, param, tex: '' } };
      }
      case 'Integral': {
        need(1);
        const { f, param } = this.fn(A[0]);
        if (A.length >= 3) {
          const a = this.num(A[1]), b = this.num(A[2]);
          const value = integrate(f, a, b);
          return { value: { type: 'integral', f, a, b, value }, display: `= ${this.f(value)}` };
        }
        const F: Fn1 = (x) => integrate(f, 0, x, 200);
        return { value: { type: 'function', f: F, param, tex: '' }, display: 'numeric antiderivative, F(0) = 0' };
      }
      case 'Simplify': case 'Expand': {
        need(1);
        const n = this.node(A[0]);
        let r: MathNode;
        try { r = name === 'Expand' ? math.rationalize(n) as MathNode : math.simplify(n); } catch { r = math.simplify(n); }
        const unk = this.unknowns(r);
        const param = unk.find((u) => VARS.includes(u)) ?? 'x';
        this.nodes.set(selfName, { node: r, param });
        if (!unk.length) { const value = compileFn(r, [], this.scope)(); return { value: { type: 'number', value }, display: `= ${this.f(value)}` }; }
        return { value: { type: 'function', f: compileFn(r, [param], this.scope) as Fn1, param, tex: toTex(r) }, display: `= ${r.toString()}` };
      }
      case 'Tangent': {
        need(2);
        const { f } = this.fn(A[1]);
        const pv = this.values.get(A[0].trim());
        const x0 = pv?.type === 'point' ? pv.p.x : this.num(A[0]);
        const y0 = f(x0), m = numDeriv(f, x0);
        const v: Value = { type: 'line', a: { x: x0, y: y0 }, b: { x: x0 + 1, y: y0 + m } };
        return { value: v, display: `y = ${this.f(m)}x ${y0 - m * x0 < 0 ? '−' : '+'} ${this.f(Math.abs(y0 - m * x0))}` };
      }
      case 'Segment': { need(2); const a = this.pt(A[0]), b = this.pt(A[1]); return { value: { type: 'segment', a, b }, display: `= ${this.f(dist(a, b))}` }; }
      case 'Line': { need(2); const a = this.pt(A[0]); const bv = this.obj(A[1]); const l = bv && asLine(bv);
        const b = l ? { x: a.x + l.d.x, y: a.y + l.d.y } : this.pt(A[1]);
        return { value: { type: 'line', a, b }, display: this.lineEq(a, b) }; }
      case 'Ray': { need(2); return { value: { type: 'ray', a: this.pt(A[0]), b: this.pt(A[1]) } }; }
      case 'Vector': {
        need(1);
        if (A.length === 1) {
          const v = this.obj(A[0]);
          if (v?.type === 'point3d') return { value: { type: 'vector3d', a: { x: 0, y: 0, z: 0 }, b: v.p } };
          const b = this.pt(A[0]);
          return { value: { type: 'vector', a: { x: 0, y: 0 }, b }, display: fmtPt(b, this.digits) };
        }
        const va = this.obj(A[0]), vb = this.obj(A[1]);
        if (va?.type === 'point3d' || vb?.type === 'point3d') return { value: { type: 'vector3d', a: this.pt3(A[0]), b: this.pt3(A[1]) } };
        const a = this.pt(A[0]), b = this.pt(A[1]);
        return { value: { type: 'vector', a, b }, display: fmtPt(sub(b, a), this.digits) };
      }
      case 'Circle': {
        need(2);
        if (A.length >= 3) {
          const c = circleThrough(this.pt(A[0]), this.pt(A[1]), this.pt(A[2]));
          if (!c) throw new EvalError('Points are collinear');
          return { value: { type: 'circle', ...c }, display: this.circleEq(c.c, c.r) };
        }
        const c = this.pt(A[0]);
        const second = this.obj(A[1]);
        // a slider radius may pass through negative values while animating
        const r = second?.type === 'point' ? dist(c, second.p) : Math.abs(this.num(A[1]));
        return { value: { type: 'circle', c, r }, display: this.circleEq(c, r) };
      }
      case 'Polygon': {
        need(3);
        const pts = A.map((a) => this.pt(a));
        return { value: { type: 'polygon', pts }, display: `area = ${this.f(polygonArea(pts))}` };
      }
      case 'Midpoint': {
        need(1);
        let p: Vec2;
        if (A.length === 1) { const v = this.obj(A[0]); if (v?.type !== 'segment') throw new EvalError('Expected a segment'); p = mid(v.a, v.b); }
        else p = mid(this.pt(A[0]), this.pt(A[1]));
        return { value: { type: 'point', p, free: false }, display: fmtPt(p, this.digits) };
      }
      case 'Perpendicular': case 'Parallel': {
        need(2);
        const p = this.pt(A[0]); const l = lineOf(A[1]);
        const d = name === 'Parallel' ? l.d : { x: -l.d.y, y: l.d.x };
        const b = { x: p.x + d.x, y: p.y + d.y };
        return { value: { type: 'line', a: p, b }, display: this.lineEq(p, b) };
      }
      case 'PerpendicularBisector': {
        need(2);
        const a = this.pt(A[0]), b = this.pt(A[1]); const m = mid(a, b); const d = sub(b, a);
        const e = { x: m.x - d.y, y: m.y + d.x };
        return { value: { type: 'line', a: m, b: e }, display: this.lineEq(m, e) };
      }
      case 'Distance': {
        need(2);
        const a = this.pt(A[0]); const bv = this.obj(A[1]);
        const l = bv && asLine(bv);
        const value = l ? dist(a, projectOnLine(a, l)) : dist(a, this.pt(A[1]));
        return { value: { type: 'number', value }, display: `= ${this.f(value)}` };
      }
      case 'Angle': {
        need(3);
        const a = this.pt(A[0]), b = this.pt(A[1]), c = this.pt(A[2]);
        const value = angle(a, b, c);
        return { value: { type: 'angle', a, b, c, value }, display: `= ${this.f((value * 180) / Math.PI)}°` };
      }
      case 'Area': {
        need(1);
        const v = this.obj(A[0]);
        let value: number;
        if (v?.type === 'polygon') value = polygonArea(v.pts);
        else if (v?.type === 'circle') value = Math.PI * v.r ** 2;
        else if (A.length >= 3) value = polygonArea(A.map((a) => this.pt(a)));
        else throw new EvalError('Area needs a polygon or circle');
        return { value: { type: 'number', value }, display: `= ${this.f(value)}` };
      }
      case 'Length': {
        need(1);
        const v = this.obj(A[0]);
        let value: number;
        if (v && (v.type === 'segment' || v.type === 'vector')) value = dist(v.a, v.b);
        else if (v?.type === 'circle') value = 2 * Math.PI * v.r;
        else if (v?.type === 'point') value = Math.hypot(v.p.x, v.p.y);
        else throw new EvalError('Length needs a segment, vector or circle');
        return { value: { type: 'number', value }, display: `= ${this.f(value)}` };
      }
      case 'Slope': {
        need(1);
        const l = lineOf(A[0]);
        const value = l.d.y / l.d.x;
        return { value: { type: 'number', value }, display: `= ${this.f(value)}` };
      }
      case 'Reflect': {
        need(2);
        const p = this.pt(A[0]); const m = this.obj(A[1]);
        const l = m && asLine(m);
        const q = l ? projectOnLine(p, l) : this.pt(A[1]);
        const r = { x: 2 * q.x - p.x, y: 2 * q.y - p.y };
        return { value: { type: 'point', p: r, free: false }, display: fmtPt(r, this.digits) };
      }
      case 'Rotate': {
        need(2);
        const p = this.pt(A[0]); const th = this.num(A[1]);
        const c = A[2] ? this.pt(A[2]) : { x: 0, y: 0 };
        const dx = p.x - c.x, dy = p.y - c.y;
        const r = { x: clean(c.x + dx * Math.cos(th) - dy * Math.sin(th)), y: clean(c.y + dx * Math.sin(th) + dy * Math.cos(th)) };
        return { value: { type: 'point', p: r, free: false }, display: fmtPt(r, this.digits) };
      }
      case 'Translate': {
        need(2);
        const p = this.pt(A[0]); const v = this.obj(A[1]);
        const d = v?.type === 'vector' ? sub(v.b, v.a) : this.pt(A[1]);
        const r = { x: p.x + d.x, y: p.y + d.y };
        return { value: { type: 'point', p: r, free: false }, display: fmtPt(r, this.digits) };
      }
      case 'Curve': {
        need(5);
        const is3 = A.length >= 6;
        const t = A[is3 ? 3 : 2].trim();
        const t0 = this.num(A[is3 ? 4 : 3]), t1 = this.num(A[is3 ? 5 : 4]);
        const c = (i: number) => compileFn(this.node(A[i]), [t], this.scope) as Fn1;
        if (is3) return { value: { type: 'curve3d', fx: c(0), fy: c(1), fz: c(2), t0, t1 } };
        return { value: { type: 'curve', fx: c(0), fy: c(1), t0, t1 } };
      }
      case 'Surface': {
        need(9);
        const u = A[3].trim(), v = A[6].trim();
        const c = (i: number) => compileFn(this.node(A[i]), [u, v], this.scope) as Fn2;
        return { value: { type: 'psurface', fx: c(0), fy: c(1), fz: c(2), u0: this.num(A[4]), u1: this.num(A[5]), v0: this.num(A[7]), v1: this.num(A[8]) } };
      }
      case 'FitLine': case 'FitPoly': case 'FitExp': case 'FitLog': case 'FitPow': case 'FitSin': {
        need(name === 'FitPoly' ? 2 : 1);
        const fit = FITS[name](this.ptList(A[0]), name === 'FitPoly' ? this.num(A[1]) : undefined);
        // full precision for f' and Derivative, rounded coefficients for display
        this.nodes.set(selfName, { node: this.node(fitExpr(fit)), param: 'x' });
        const tex = toTex(this.node(fitExpr(fit, this.digits)));
        return {
          value: { type: 'function', f: fit.f, param: 'x', tex },
          tex: `${texName(selfName)}(x) = ${tex}`,
          display: `R² = ${r2Text(fit.r2, Math.max(4, this.digits))}`,
        };
      }
      case 'Sphere': {
        need(2);
        const c = this.pt3(A[0]); const r = this.num(A[1]);
        return { value: { type: 'sphere', c, r }, display: `r = ${this.f(r)}` };
      }
    }
    throw new EvalError(`Unknown command: ${name}`);
  }

  lineEq(a: Vec2, b: Vec2) {
    const A = b.y - a.y, B = a.x - b.x, C = A * a.x + B * a.y;
    if (Math.abs(B) < 1e-12) return `x = ${this.f(a.x)}`;
    const m = -A / B, c = C / B;
    return `y = ${this.f(m)}x ${c < 0 ? '−' : '+'} ${this.f(Math.abs(c))}`;
  }

  circleEq(c: Vec2, r: number) {
    const t = (v: number, n: string) => (Math.abs(v) < 1e-12 ? `${n}²` : `(${n} ${v > 0 ? '−' : '+'} ${this.f(Math.abs(v))})²`);
    return `${t(c.x, 'x')} + ${t(c.y, 'y')} = ${this.f(r * r)}`;
  }

  // ---------- main evaluation ----------
  evalObject(obj: MObj): Out {
    const def = splitDefinition(obj.input);
    const name = def.name ?? obj.name;
    const body = def.body;
    if (!body) throw new EvalError('Empty input');

    if (def.params) {
      const cmd = asCommand(body);
      if (cmd) {
        const out = this.command(cmd.name, cmd.args, name);
        return { ...out, tex: out.tex ?? `${texName(name)}(${def.params.join(', ')}) = ${tryTex(body)}` };
      }
      const n = this.node(body);
      const p = def.params;
      const extra = this.unknowns(n).filter((s) => !p.includes(s));
      if (extra.length) throw new UndefinedSymbolError(extra[0]);
      const tex = `${texName(name)}(${p.join(', ')}) = ${toTex(n)}`;
      if (p.length === 1) {
        this.nodes.set(name, { node: n, param: p[0] });
        return { value: { type: 'function', f: compileFn(n, p, this.scope) as Fn1, param: p[0], tex: toTex(n) }, tex };
      }
      if (p.length === 2) return { value: { type: 'surface', f: compileFn(n, p, this.scope) as Fn2 }, tex };
      throw new EvalError('Functions of up to two variables are supported');
    }

      const cmd = asCommand(body);
    if (cmd) {
      const out = this.command(cmd.name, cmd.args, name);
      const isFn = out.value.type === 'function';
      return { ...out, tex: out.tex ?? (isFn ? `${texName(name)}(${(out.value as { param: string }).param}) = ${tryTex(body)}` : `${texName(name)} = ${tryTex(body)}`) };
    }

    const list = asList(body);
    if (list) return { value: this.evalList(list), tex: `${texName(name)} = ${tryTex(body)}` };

    const tup = asTuple(body);
    if (tup) {
      const out = this.evalTuple(tup);
      return { ...out, tex: `${texName(name)} = ${tryTex(body)}` };
    }

    const pol = asPolar(body);
    if (pol) return { ...this.evalPolar(pol), tex: `${texName(name)} = ${tryTex(body)}` };

    const polar = asPolarCurve(body);
    if (polar) {
      const n = this.node(polar);
      const bad = this.unknowns(n).filter((s) => s !== 'theta');
      if (bad.length) throw new UndefinedSymbolError(bad[0]);
      const r = compileFn(n, ['theta'], this.scope) as Fn1;
      const t1 = polarRange(r);
      return { value: { type: 'curve', ...polarXY(r), t0: 0, t1 }, tex: `r = ${toTex(n)}`, display: `0 ≤ θ ≤ ${piText(t1)}` };
    }

    const rel = splitRelation(body);
    if (rel) {
      const ln = this.node(rel.lhs), rn = this.node(rel.rhs);
      const rhsSyms = this.unknowns(rn);
      const all = new Set([...this.unknowns(ln), ...rhsSyms]);
      const bad = [...all].filter((s) => !VARS.includes(s));
      if (bad.length) throw new UndefinedSymbolError(bad[0]);
      const relTex = `${toTex(ln)} ${({ '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' })[rel.op]} ${toTex(rn)}`;
      const tex = def.name ? `${texName(name)}: ${relTex}` : relTex;
      if (rel.lhs === 'y' && !rhsSyms.includes('y') && !rhsSyms.includes('z')) {
        this.nodes.set(name, { node: rn, param: 'x' });
        return { value: { type: 'function', f: compileFn(rn, ['x'], this.scope) as Fn1, param: 'x', tex: toTex(rn), ineq: rel.op === '=' ? undefined : rel.op }, tex };
      }
      if (rel.lhs === 'z' && !rhsSyms.includes('z') && rel.op === '=') {
        return { value: { type: 'surface', f: compileFn(rn, ['x', 'y'], this.scope) as Fn2 }, tex };
      }
      const diff = new math.OperatorNode('-', 'subtract', [ln, new math.ParenthesisNode(rn)]) as MathNode;
      if (all.has('z')) {
        if (rel.op !== '=') throw new EvalError('3D inequalities are not supported');
        return { value: { type: 'implicit3d', F: compileFn(diff, ['x', 'y', 'z'], this.scope) as (x: number, y: number, z: number) => number }, tex };
      }
      return { value: { type: 'implicit', F: compileFn(diff, ['x', 'y'], this.scope) as Fn2, op: rel.op }, tex };
    }

    // plain expression
    const n = this.node(body);
    const unk = this.unknowns(n);
    const bad = unk.filter((s) => !VARS.includes(s));
    if (bad.length) throw new UndefinedSymbolError(bad[0]);
    if (unk.length === 0) {
      const value = compileFn(n, [], this.scope)();
      const isSlider = !!obj.slider && NUM_LITERAL.test(body);
      return {
        value: { type: 'number', value, slider: isSlider },
        tex: `${texName(name)} = ${toTex(n)}`,
        display: isSlider || NUM_LITERAL.test(body) ? undefined : `= ${this.f(value)}`,
      };
    }
    if (unk.includes('z')) throw new EvalError('Use an equation, e.g. z = …');
    if (unk.includes('x') && unk.includes('y')) {
      return { value: { type: 'surface', f: compileFn(n, ['x', 'y'], this.scope) as Fn2 }, tex: `${texName(name)}(x, y) = ${toTex(n)}` };
    }
    if (unk.includes('y')) {
      return { value: { type: 'implicit', F: compileFn(n, ['x', 'y'], this.scope) as Fn2, op: '=' }, tex: `${toTex(n)} = 0` };
    }
    const param = unk[0];
    this.nodes.set(name, { node: n, param });
    return { value: { type: 'function', f: compileFn(n, [param], this.scope) as Fn1, param, tex: toTex(n) }, tex: `${texName(name)}(${param}) = ${toTex(n)}` };
  }
}

/** Evaluate all objects, resolving dependencies regardless of order. */
export function evaluateAll(objs: MObj[], digits = 4): Resolved[] {
  return run(objs, digits).results;
}

/** Names → numbers / functions / points, for evaluating spreadsheet formulas. */
export function evaluateScope(objs: MObj[]): Scope {
  return run(objs, 4).eng.scope;
}

function run(objs: MObj[], digits: number): { results: Resolved[]; eng: Engine } {
  const eng = new Engine(digits);
  const res = new Map<string, Resolved>();
  const nameOf = (o: MObj) => splitDefinition(o.input).name ?? o.name;
  const names = new Set(objs.map(nameOf));
  let pending = objs.slice();
  for (let pass = 0; pass <= objs.length && pending.length; pass++) {
    const next: MObj[] = [];
    for (const o of pending) {
      try {
        const out = eng.evalObject(o);
        eng.register(nameOf(o), out.value);
        res.set(o.id, { obj: o, value: out.value, display: out.display, tex: out.tex ?? tryTex(o.input) });
      } catch (e) {
        if (e instanceof UndefinedSymbolError && names.has(e.symbol) && !eng.values.has(e.symbol) && e.symbol !== nameOf(o)) {
          next.push(o);
          continue;
        }
        const missing = e instanceof UndefinedSymbolError && !e.isFunction && !names.has(e.symbol) ? [e.symbol] : undefined;
        res.set(o.id, { obj: o, error: (e as Error).message || 'Invalid input', tex: tryTex(o.input), missing });
      }
    }
    if (next.length === pending.length) {
      for (const o of next) res.set(o.id, { obj: o, error: 'Circular or missing dependency', tex: tryTex(o.input) });
      break;
    }
    pending = next;
  }
  return { results: objs.map((o) => res.get(o.id)!), eng };
}

/** Collect every undefined single-letter symbol in an input (for auto sliders). */
export function missingSymbols(input: string, objs: MObj[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const trial = [...objs, ...out.map((s, k) => ({ id: `__s${k}`, name: s, input: `${s} = 1`, color: '', visible: false })),
      { id: '__probe', name: '__probe', input, color: '', visible: false }];
    const r = evaluateAll(trial).find((x) => x.obj.id === '__probe');
    const m = r?.missing?.[0];
    if (!m || out.includes(m) || !/^[a-wA-W]$|^[a-z]_?\d$/.test(m)) break;
    out.push(m);
  }
  return out;
}
