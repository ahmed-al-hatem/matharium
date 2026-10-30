import { create, all, type MathNode } from 'mathjs';

export const math = create(all, {});
math.import(
  {
    ln: (x: number) => Math.log(x),
    lg: (x: number) => Math.log10(x),
  },
  { override: false },
);

export class UndefinedSymbolError extends Error {
  constructor(public symbol: string, public isFunction = false) {
    super(isFunction ? `Unknown function: ${symbol}` : `Undefined variable: ${symbol}`);
  }
}

/** Values a compiled expression may reference by name. */
export type Scope = Record<string, unknown>;

const BUILTIN_CONST: Record<string, string> = {
  pi: 'Math.PI',
  e: 'Math.E',
  E: 'Math.E',
  PI: 'Math.PI',
  phi: '1.618033988749895',
  tau: '(2*Math.PI)',
  Infinity: 'Infinity',
  infinity: 'Infinity',
  true: '1',
  false: '0',
};

const MATH_FN: Record<string, string> = {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
  asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
  arcsin: 'Math.asin', arccos: 'Math.acos', arctan: 'Math.atan',
  sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
  asinh: 'Math.asinh', acosh: 'Math.acosh', atanh: 'Math.atanh',
  exp: 'Math.exp', ln: 'Math.log', log10: 'Math.log10', lg: 'Math.log10', log2: 'Math.log2',
  sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs', floor: 'Math.floor', ceil: 'Math.ceil',
  round: 'Math.round', sign: 'Math.sign', sgn: 'Math.sign', min: 'Math.min', max: 'Math.max',
  atan2: 'Math.atan2', hypot: 'Math.hypot',
};

function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Real-valued power: (-8)^(1/3) = -2 like a graphing calculator would. */
function pow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  for (let q = 3; q <= 15; q += 2) {
    const p = Math.round(b * q);
    if (Math.abs(p / q - b) < 1e-12) return (p % 2 === 0 ? 1 : -1) * Math.pow(-a, b);
  }
  return NaN;
}

export const H = {
  pow,
  sec: (x: number) => 1 / Math.cos(x),
  csc: (x: number) => 1 / Math.sin(x),
  cot: (x: number) => 1 / Math.tan(x),
  log: (x: number, b?: number) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b)),
  nthRoot: (x: number, n = 2) => pow(x, 1 / n),
  mod: (a: number, b: number) => ((a % b) + b) % b,
  fact: (n: number) => (Number.isInteger(n) && n >= 0 && n < 171 ? gamma(n + 1) : gamma(n + 1)),
  gamma,
};

const HELPER_FN = new Set(['sec', 'csc', 'cot', 'log', 'nthRoot', 'mod', 'gamma']);

class Unsupported extends Error {}

/** Names that are "known" and must not be split into products (xy → x*y). */
export function isKnownName(name: string, scope: Scope) {
  return name in BUILTIN_CONST || name in MATH_FN || HELPER_FN.has(name) || name in scope;
}

/** Parse with calculator-friendly tweaks: xy → x*y, f'(x) → f_d1(x). */
export function parseExpr(src: string, scope: Scope = {}, vars: string[] = ['x', 'y', 'z', 't']): MathNode {
  const pre = src.replace(/([A-Za-z]\w*)('+)\s*\(/g, (_m, n: string, q: string) => `${n}_d${q.length}(`);
  const node = math.parse(pre);
  return node.transform((n: MathNode, path: string) => {
    if (path === 'fn') return n;
    if ((n as any).isSymbolNode) {
      const name = (n as any).name as string;
      if (!isKnownName(name, scope) && name.length > 1 && [...name].every((ch) => vars.includes(ch))) {
        return [...name].map((ch) => new math.SymbolNode(ch) as MathNode)
          .reduce((a, b) => new math.OperatorNode('*', 'multiply', [a, b]) as MathNode);
      }
    }
    return n;
  });
}

function gen(node: any, params: string[], scope: Scope): string {
  if (node.isParenthesisNode) return `(${gen(node.content, params, scope)})`;
  if (node.isConstantNode) {
    if (typeof node.value === 'number') return `(${node.value})`;
    if (typeof node.value === 'boolean') return node.value ? '1' : '0';
    throw new Unsupported();
  }
  if (node.isSymbolNode) {
    const n = node.name as string;
    if (params.includes(n)) return `p_${n}`;
    if (n in scope) {
      const v = scope[n];
      if (typeof v === 'number') return `(${v})`;
      throw new Unsupported();
    }
    if (n in BUILTIN_CONST) return BUILTIN_CONST[n];
    throw new UndefinedSymbolError(n);
  }
  if (node.isOperatorNode) {
    const a = node.args.map((x: any) => gen(x, params, scope));
    if (a.length === 1) {
      if (node.op === '-') return `(-${a[0]})`;
      if (node.op === '+') return `(+${a[0]})`;
      if (node.op === '!') return `H.fact(${a[0]})`;
      if (node.op === 'not') return `(${a[0]}?0:1)`;
      throw new Unsupported();
    }
    switch (node.op) {
      case '+': case '-': case '*': case '/': return `(${a[0]}${node.op}${a[1]})`;
      case '^': case '.^': return `H.pow(${a[0]},${a[1]})`;
      case '%': case 'mod': return `H.mod(${a[0]},${a[1]})`;
      case '<': case '>': case '<=': case '>=': return `((${a[0]}${node.op}${a[1]})?1:0)`;
      case '==': return `((${a[0]}===${a[1]})?1:0)`;
      case '!=': return `((${a[0]}!==${a[1]})?1:0)`;
      case 'and': return `((${a[0]}&&${a[1]})?1:0)`;
      case 'or': return `((${a[0]}||${a[1]})?1:0)`;
      case '.*': return `(${a[0]}*${a[1]})`;
      case './': return `(${a[0]}/${a[1]})`;
    }
    throw new Unsupported();
  }
  if (node.isRelationalNode) {
    const p = node.params.map((x: any) => gen(x, params, scope));
    const parts = node.conditionals.map((op: string, i: number) => {
      const o = op === 'smaller' ? '<' : op === 'larger' ? '>' : op === 'smallerEq' ? '<=' : op === 'largerEq' ? '>=' : op === 'equal' ? '===' : '!==';
      return `(${p[i]}${o}${p[i + 1]})`;
    });
    return `((${parts.join('&&')})?1:0)`;
  }
  if (node.isConditionalNode) {
    return `((${gen(node.condition, params, scope)})?(${gen(node.trueExpr, params, scope)}):(${gen(node.falseExpr, params, scope)}))`;
  }
  if (node.isAccessorNode) {
    const obj = node.object;
    if (obj.isSymbolNode && node.index?.dimensions?.length === 1) {
      const target = scope[obj.name] as any;
      const key = node.index.dimensions[0].value;
      if (target && typeof target === 'object' && typeof target[key] === 'number') return `(${target[key]})`;
    }
    throw new Unsupported();
  }
  if (node.isFunctionNode) {
    const name = node.fn.name as string;
    const args = node.args.map((x: any) => gen(x, params, scope)).join(',');
    if (name in scope && typeof scope[name] === 'function') return `S[${JSON.stringify(name)}](${args})`;
    if (name in MATH_FN) return `${MATH_FN[name]}(${args})`;
    if (HELPER_FN.has(name)) return `H.${name}(${args})`;
    if (name === 'factorial') return `H.fact(${args})`;
    if (name === 'pow') return `H.pow(${args})`;
    const m = /^(\w+)_d(\d)$/.exec(name);
    if (m) throw new UndefinedSymbolError(m[1], true);
    throw new UndefinedSymbolError(name, true);
  }
  throw new Unsupported();
}

/** Compile an expression into a fast JS function of `params`. Falls back to mathjs evaluate. */
export function compileFn(node: MathNode, params: string[], scope: Scope): (...a: number[]) => number {
  try {
    const body = gen(node, params, scope);
    const fn = new Function('H', 'S', `return function(${params.map((p) => 'p_' + p).join(',')}){return ${body};}`)(H, scope);
    return fn as (...a: number[]) => number;
  } catch (e) {
    if (!(e instanceof Unsupported)) throw e;
    const code = node.compile();
    return (...a: number[]) => {
      const local: Record<string, unknown> = { ...scope };
      params.forEach((p, i) => (local[p] = a[i]));
      try {
        const v = code.evaluate(local);
        return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : NaN;
      } catch {
        return NaN;
      }
    };
  }
}

/** Free symbols of a node (excluding function names and built-ins). */
export function freeSymbols(node: MathNode): Set<string> {
  const out = new Set<string>();
  node.traverse((n: any, path: string) => {
    if (n.isSymbolNode && path !== 'fn' && !(n.name in BUILTIN_CONST)) out.add(n.name);
  });
  return out;
}

const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'Infinity', 'infinity', 'e', 'E']);

/** LaTeX for a user object name: A, P₁, a_1, eq1 (upright-italic word). */
export function texName(name: string): string {
  const m = /^([A-Za-z])_?(\d+)$/.exec(name);
  if (m) return `${m[1]}_{${m[2]}}`;
  if (/^[A-Za-z]$/.test(name)) return name;
  const sub = /^([A-Za-z])_([A-Za-z0-9]+)$/.exec(name);
  if (sub) return `${sub[1]}_{${sub[2]}}`;
  return `\\mathit{${name.replace(/_/g, '\\_')}}`;
}

const nameHandler = (node: any) => {
  if (node.isSymbolNode && !GREEK.has(node.name) && /^[A-Za-z]\w*$/.test(node.name)) return texName(node.name);
  return undefined;
};

export function toTex(node: MathNode): string {
  try {
    return node.toTex({ parenthesis: 'auto', implicit: 'hide', handler: nameHandler });
  } catch {
    return node.toString();
  }
}
