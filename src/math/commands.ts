import type { Category } from './parser';

/**
 * The one table of commands. The parser's categories, the input autocomplete and the
 * Help dialog are all generated from it, so a new command is added here once.
 */

type L = { en: string; ar: string };

/** Argument placeholders shown in signatures, e.g. Circle( <Center>, <Radius> ). */
const ARG = {
  equation: { en: 'Equation', ar: 'معادلة' },
  equation2: { en: 'Equation 2', ar: 'المعادلة 2' },
  variable: { en: 'Variable', ar: 'المتغير' },
  function: { en: 'Function', ar: 'دالة' },
  function2: { en: 'Function 2', ar: 'الدالة 2' },
  expression: { en: 'Expression', ar: 'تعبير' },
  from: { en: 'Start x', ar: 'بداية x' },
  to: { en: 'End x', ar: 'نهاية x' },
  order: { en: 'Order', ar: 'الرتبة' },
  object: { en: 'Object', ar: 'كائن' },
  object2: { en: 'Object 2', ar: 'الكائن 2' },
  point: { en: 'Point', ar: 'نقطة' },
  point2: { en: 'Point 2', ar: 'النقطة 2' },
  point3: { en: 'Point 3', ar: 'النقطة 3' },
  center: { en: 'Center', ar: 'المركز' },
  radius: { en: 'Radius', ar: 'نصف القطر' },
  line: { en: 'Line', ar: 'مستقيم' },
  segment: { en: 'Segment', ar: 'قطعة' },
  vector: { en: 'Vector', ar: 'متجه' },
  angle: { en: 'Angle', ar: 'زاوية' },
  vertex: { en: 'Vertex', ar: 'الرأس' },
  polygon: { en: 'Polygon', ar: 'مضلع' },
  x: { en: 'x', ar: 'x' },
  xExpr: { en: 'x(t)', ar: 'x(t)' },
  yExpr: { en: 'y(t)', ar: 'y(t)' },
  zExpr: { en: 'z(t)', ar: 'z(t)' },
  param: { en: 'Parameter', ar: 'الوسيط' },
  pStart: { en: 'Start', ar: 'البداية' },
  pEnd: { en: 'End', ar: 'النهاية' },
  n: { en: 'n', ar: 'n' },
  rule: { en: '"left"|"right"|"mid"|"trap"', ar: '"left"|"right"|"mid"|"trap"' },
  fxy: { en: 'f(x, y)', ar: 'f(x, y)' },
  at: { en: 'a', ar: 'a' },
  degree: { en: 'Degree', ar: 'الدرجة' },
  list: { en: 'List', ar: 'قائمة' },
  width: { en: 'Bin width', ar: 'عرض الفئة' },
  yPos: { en: 'y position', ar: 'موضع y' },
  mean: { en: 'μ', ar: 'μ' },
  sd: { en: 'σ', ar: 'σ' },
  low: { en: 'Lower bound', ar: 'الحد الأدنى' },
  high: { en: 'Upper bound', ar: 'الحد الأعلى' },
  trials: { en: 'Trials n', ar: 'عدد المحاولات n' },
  prob: { en: 'Probability p', ar: 'الاحتمال p' },
  locusPoint: { en: 'Locus point', ar: 'النقطة المتتبَّعة' },
  moverPoint: { en: 'Point on object', ar: 'نقطة على كائن' },
} satisfies Record<string, L>;

export type ArgKey = keyof typeof ARG;
export type HelpGroup = 'commands' | 'calculus' | 'geometry' | 'stats' | '3d';

export interface CommandDef {
  name: string;
  /** Category used for auto-naming before evaluation (a function when it depends on the arguments). */
  cat: Category | ((args: string[]) => Category);
  group: HelpGroup;
  /** Alternative argument lists. */
  sigs: ArgKey[][];
  /** Examples shown in the Help dialog (clicking one adds it). */
  examples: { code: string; en: string; ar: string }[];
}

const ex = (code: string, en: string, ar: string) => ({ code, en, ar });

export const COMMAND_TABLE: CommandDef[] = [
  // ---- algebra ----
  { name: 'Solve', cat: 'text', group: 'commands', sigs: [['equation'], ['equation', 'variable'], ['equation', 'equation2']], examples: [
    ex('Solve(x^2 - 2x = 3)', 'solve equation', 'حل معادلة'), ex('Solve(x + y = 3, x - y = 1)', 'solve system', 'حل نظام معادلات'),
    ex('Solve(2x^2 - 3x - 1 = 0)', 'exact roots (≈ for decimals)', 'جذور دقيقة (≈ للقيم العشرية)')] },
  { name: 'NSolve', cat: 'text', group: 'commands', sigs: [['equation'], ['equation', 'variable']], examples: [] },
  { name: 'Roots', cat: 'list', group: 'commands', sigs: [['function'], ['function', 'from', 'to']], examples: [ex('Roots(f)', 'zeros', 'الأصفار')] },
  { name: 'Extremum', cat: 'list', group: 'commands', sigs: [['function'], ['function', 'from', 'to']], examples: [ex('Extremum(f)', 'max / min', 'القيم العظمى والصغرى')] },
  { name: 'Intersect', cat: 'list', group: 'commands', sigs: [['object', 'object2']], examples: [ex('Intersect(f, g)', 'intersection points', 'نقاط التقاطع')] },
  { name: 'Simplify', cat: 'function', group: 'commands', sigs: [['expression']], examples: [ex('Simplify(x(x+1) - x)', 'simplify', 'تبسيط')] },
  { name: 'Expand', cat: 'function', group: 'commands', sigs: [['expression']], examples: [ex('Expand((x+1)^3)', 'expand', 'فك الأقواس')] },
  { name: 'Factor', cat: 'function', group: 'commands', sigs: [['expression']], examples: [
    ex('Factor(x^3 - 6x^2 + 11x - 6)', 'factor a polynomial', 'تحليل كثيرة حدود'),
    ex('Factor(2x^2 - 8)', 'common factor & difference of squares', 'عامل مشترك وفرق بين مربعين')] },
  { name: 'Steps', cat: 'text', group: 'commands', sigs: [['equation'], ['equation', 'equation2'], ['expression']], examples: [
    ex('Steps(3(x - 2) = x + 4)', 'step-by-step solution', 'حل خطوة بخطوة'),
    ex('Steps(Derivative(sin(x^2)))', 'derivative with named rules', 'مشتقة مع ذكر القواعد'),
    ex('Steps(Factor(x^3 - 6x^2 + 11x - 6))', 'factoring steps', 'خطوات التحليل'),
    ex('Steps(x + y = 3, x - y = 1)', 'system by elimination', 'نظام بالحذف')] },

  // ---- calculus ----
  { name: 'Derivative', cat: 'function', group: 'calculus', sigs: [['function'], ['function', 'order']], examples: [ex('Derivative(f)', 'symbolic derivative', 'المشتقة الرمزية')] },
  { name: 'Integral', cat: (a) => (a.length >= 3 ? 'number' : 'function'), group: 'calculus', sigs: [['function'], ['function', 'from', 'to']], examples: [
    ex('Integral(f, 0, 2)', 'definite integral (shaded)', 'تكامل محدد (مظلل)')] },
  { name: 'IntegralBetween', cat: 'number', group: 'calculus', sigs: [['function', 'function2', 'from', 'to']], examples: [
    ex('IntegralBetween(x, x^2, 0, 1)', 'area between two curves', 'المساحة بين منحنيين')] },
  { name: 'RiemannSum', cat: 'number', group: 'calculus', sigs: [['function', 'from', 'to', 'n', 'rule']], examples: [
    ex('RiemannSum(x^2, 0, 2, 8, "mid")', 'Riemann sum with rectangles', 'مجموع ريمان بالمستطيلات')] },
  { name: 'Tangent', cat: 'path', group: 'calculus', sigs: [['x', 'function'], ['point', 'function']], examples: [ex('Tangent(1, f)', 'tangent line at x = 1', 'المماس عند x = 1')] },
  { name: 'TaylorPolynomial', cat: 'function', group: 'calculus', sigs: [['function', 'at', 'degree']], examples: [
    ex('TaylorPolynomial(sin(x), 0, 5)', 'Taylor polynomial', 'كثيرة حدود تايلور')] },
  { name: 'SlopeField', cat: 'path', group: 'calculus', sigs: [['fxy']], examples: [ex('SlopeField(x - y)', "slope field of y' = f(x, y)", "حقل الميل للمعادلة y' = f(x, y)")] },
  { name: 'SolveODE', cat: 'function', group: 'calculus', sigs: [['fxy', 'point']], examples: [
    ex('SolveODE(x - y, (0, 1))', "solution of y' = f(x, y) through a point", "حل y' = f(x, y) المار بنقطة")] },

  // ---- statistics ----
  { name: 'Mean', cat: 'number', group: 'stats', sigs: [['list']], examples: [ex('Mean({2, 4, 4, 5, 7})', 'mean (also A1:A20)', 'المتوسط (أو A1:A20)')] },
  { name: 'Median', cat: 'number', group: 'stats', sigs: [['list']], examples: [ex('Median({2, 4, 4, 5, 7})', 'median', 'الوسيط')] },
  { name: 'SD', cat: 'number', group: 'stats', sigs: [['list']], examples: [ex('SD({2, 4, 4, 5, 7})', 'standard deviation (population)', 'الانحراف المعياري (للمجتمع)')] },
  { name: 'Histogram', cat: 'list', group: 'stats', sigs: [['list', 'width']], examples: [ex('Histogram({1, 2, 2, 3, 3, 3, 4}, 1)', 'histogram', 'مدرج تكراري')] },
  { name: 'BoxPlot', cat: 'list', group: 'stats', sigs: [['list'], ['list', 'yPos']], examples: [ex('BoxPlot({1, 3, 4, 6, 9, 12})', 'box plot', 'مخطط الصندوق')] },
  { name: 'Normal', cat: (a) => (a.length === 3 && a[2].trim() === 'x' ? 'function' : a.length >= 3 ? 'number' : 'function'), group: 'stats', sigs: [['mean', 'sd'], ['mean', 'sd', 'x'], ['mean', 'sd', 'low', 'high']], examples: [
    ex('Normal(0, 1)', 'normal density', 'التوزيع الطبيعي'), ex('Normal(0, 1, -1, 1)', 'P(a ≤ X ≤ b), shaded', 'P(a ≤ X ≤ b) مظللة')] },
  { name: 'Binomial', cat: (a) => (a.length >= 4 ? 'number' : 'list'), group: 'stats', sigs: [['trials', 'prob'], ['trials', 'prob', 'low', 'high']], examples: [
    ex('Binomial(10, 0.5, 3, 6)', 'binomial P(a ≤ X ≤ b)', 'ذات الحدين P(a ≤ X ≤ b)')] },

  // ---- geometry ----
  { name: 'Point', cat: 'point', group: 'geometry', sigs: [['object'], ['object', 'param']], examples: [
    ex('Point(Circle((0, 0), 2))', 'point on an object (drag it)', 'نقطة على كائن (اسحبها)')] },
  { name: 'Segment', cat: 'path', group: 'geometry', sigs: [['point', 'point2']], examples: [ex('Segment(A, B)', 'segment', 'قطعة مستقيمة')] },
  { name: 'Line', cat: 'path', group: 'geometry', sigs: [['point', 'point2'], ['point', 'line']], examples: [] },
  { name: 'Ray', cat: 'path', group: 'geometry', sigs: [['point', 'point2']], examples: [] },
  { name: 'Vector', cat: 'path', group: 'geometry', sigs: [['point'], ['point', 'point2']], examples: [] },
  { name: 'Circle', cat: 'path', group: 'geometry', sigs: [['center', 'radius'], ['center', 'point'], ['point', 'point2', 'point3']], examples: [ex('Circle(A, 3)', 'circle', 'دائرة')] },
  { name: 'Polygon', cat: 'path', group: 'geometry', sigs: [['point', 'point2', 'point3']], examples: [ex('Polygon(A, B, C)', 'polygon & area', 'مضلع ومساحته')] },
  { name: 'Midpoint', cat: 'point', group: 'geometry', sigs: [['point', 'point2'], ['segment']], examples: [ex('Midpoint(A, B)', 'midpoint', 'منتصف')] },
  { name: 'Reflect', cat: 'point', group: 'geometry', sigs: [['point', 'line'], ['point', 'point2']], examples: [] },
  { name: 'Rotate', cat: 'point', group: 'geometry', sigs: [['point', 'angle'], ['point', 'angle', 'center']], examples: [ex('Rotate(A, 90°, B)', 'rotation', 'دوران')] },
  { name: 'Translate', cat: 'point', group: 'geometry', sigs: [['point', 'vector']], examples: [] },
  { name: 'Perpendicular', cat: 'path', group: 'geometry', sigs: [['point', 'line']], examples: [ex('Perpendicular(A, l)', 'perpendicular line', 'مستقيم عمودي')] },
  { name: 'Parallel', cat: 'path', group: 'geometry', sigs: [['point', 'line']], examples: [] },
  { name: 'PerpendicularBisector', cat: 'path', group: 'geometry', sigs: [['point', 'point2']], examples: [] },
  { name: 'Distance', cat: 'number', group: 'geometry', sigs: [['point', 'point2'], ['point', 'line']], examples: [] },
  { name: 'Angle', cat: 'number', group: 'geometry', sigs: [['point', 'vertex', 'point3']], examples: [ex('Angle(A, B, C)', 'angle at B', 'الزاوية عند B')] },
  { name: 'Area', cat: 'number', group: 'geometry', sigs: [['polygon'], ['object']], examples: [] },
  { name: 'Length', cat: 'number', group: 'geometry', sigs: [['object']], examples: [] },
  { name: 'Slope', cat: 'number', group: 'geometry', sigs: [['line']], examples: [] },
  { name: 'Locus', cat: 'path', group: 'geometry', sigs: [['locusPoint', 'moverPoint']], examples: [ex('Locus(Q, P)', 'path of Q while P moves', 'مسار Q أثناء حركة P')] },

  // ---- 3D ----
  { name: 'Curve', cat: 'path', group: '3d', sigs: [['xExpr', 'yExpr', 'param', 'pStart', 'pEnd'], ['xExpr', 'yExpr', 'zExpr', 'param', 'pStart', 'pEnd']], examples: [
    ex('Curve(cos(t), sin(t), t/4, t, 0, 4pi)', 'space curve', 'منحنى فراغي')] },
  { name: 'Surface', cat: 'surface', group: '3d', sigs: [['xExpr', 'yExpr', 'zExpr', 'param', 'pStart', 'pEnd', 'param', 'pStart', 'pEnd']], examples: [
    ex('Surface(u, v, u v, u, -2, 2, v, -2, 2)', 'parametric surface', 'سطح وسيطي')] },
  { name: 'Sphere', cat: 'surface', group: '3d', sigs: [['center', 'radius']], examples: [ex('Sphere((0,0,0), 2)', 'sphere', 'كرة')] },
];

export const COMMAND_BY_NAME = new Map(COMMAND_TABLE.map((c) => [c.name, c]));

export function commandCategory(name: string, args: string[]): Category | undefined {
  const c = COMMAND_BY_NAME.get(name)?.cat;
  return typeof c === 'function' ? c(args) : c;
}

/**
 * "<Center>"; Arabic placeholders are wrapped in Unicode isolates (FSI…PDI) so they keep their
 * place inside left-to-right math. normalize() strips the isolates again.
 */
const placeholder = (k: ArgKey, lang: 'en' | 'ar') => (lang === 'ar' ? `⁨<${ARG[k].ar}>⁩` : `<${ARG[k].en}>`);

/** "Circle( <Center>, <Radius> )" */
export function signature(name: string, sig: ArgKey[], lang: 'en' | 'ar' = 'en') {
  return `${name}( ${sig.map((k) => placeholder(k, lang)).join(', ')} )`;
}

/** Text to insert for a signature, and where its first placeholder sits. */
export function template(name: string, sig: ArgKey[], lang: 'en' | 'ar' = 'en') {
  const args = sig.map((k) => placeholder(k, lang));
  const text = `${name}(${args.join(', ')})`;
  const start = name.length + 1;
  return { text, select: args.length ? [start, start + args[0].length] as [number, number] : [start, start] as [number, number] };
}

/** The next "<…>" placeholder at or after `from`, wrapping to the start. */
export function nextPlaceholder(s: string, from: number): [number, number] | null {
  const re = /⁨?<[^<>]*>⁩?/g;
  let first: [number, number] | null = null;
  for (const m of s.matchAll(re)) {
    const r: [number, number] = [m.index!, m.index! + m[0].length];
    first ??= r;
    if (r[0] >= from) return r;
  }
  return first;
}

export interface Suggestion { kind: 'command' | 'object'; label: string; insert: string; select: [number, number]; detail?: string }

/** Suggestions for the word that ends at the caret. Commands match case-insensitively from two letters (or an initial capital). */
export function suggest(word: string, objects: { name: string; input: string }[], lang: 'en' | 'ar' = 'en', limit = 8): Suggestion[] {
  if (!word) return [];
  const w = word.toLowerCase();
  const out: Suggestion[] = [];
  if (/^[A-Z]/.test(word) || word.length >= 2) {
    for (const c of COMMAND_TABLE) {
      if (!c.name.toLowerCase().startsWith(w)) continue;
      for (const sig of c.sigs) {
        const t = template(c.name, sig, lang);
        out.push({ kind: 'command', label: signature(c.name, sig, lang), insert: t.text, select: t.select });
      }
    }
  }
  for (const o of objects) {
    if (o.name.toLowerCase().startsWith(w) && o.name !== word) {
      out.push({ kind: 'object', label: o.name, insert: o.name, select: [o.name.length, o.name.length], detail: o.input });
    }
  }
  return out.slice(0, limit);
}

/** Help dialog groups, generated from the table. */
export function helpRows(group: HelpGroup, lang: 'en' | 'ar') {
  return COMMAND_TABLE.filter((c) => c.group === group).flatMap((c) =>
    c.examples.map((e) => ({ code: e.code, desc: e[lang], sig: c.sigs.map((s) => signature(c.name, s, lang)).join('\n') })));
}
