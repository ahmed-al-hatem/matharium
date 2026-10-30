export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export type Fn1 = (x: number) => number;
export type Fn2 = (x: number, y: number) => number;
export type Fn3 = (x: number, y: number, z: number) => number;
export type RelOp = '=' | '<' | '>' | '<=' | '>=';

/** A user object as stored in the project file. Everything is derived from `input`. */
export interface MObj {
  id: string;
  name: string;
  input: string;
  color: string;
  visible: boolean;
  showLabel?: boolean;
  lineWidth?: number;
  slider?: { min: number; max: number; step: number; speed?: number; mode?: AnimMode };
  /** leave a trace of the point's positions while it moves */
  trace?: boolean;
}

/** How an animated slider moves: back and forth, increasing and wrapping around, or once up to max. */
export type AnimMode = 'oscillate' | 'increase' | 'once';

export type Value =
  | { type: 'function'; f: Fn1; param: string; tex: string; node?: unknown; ineq?: RelOp }
  | { type: 'implicit'; F: Fn2; op: RelOp }
  /** `on`: a point constrained to an object at parameter t (see geometry.pointAt); `src` is the object's input text. */
  | { type: 'point'; p: Vec2; free: boolean; on?: { src: string; target: Value; t: number } }
  | { type: 'points'; pts: Vec2[] }
  | { type: 'segment'; a: Vec2; b: Vec2 }
  | { type: 'line'; a: Vec2; b: Vec2 }
  | { type: 'ray'; a: Vec2; b: Vec2 }
  | { type: 'vector'; a: Vec2; b: Vec2 }
  | { type: 'circle'; c: Vec2; r: number }
  | { type: 'polygon'; pts: Vec2[] }
  | { type: 'angle'; a: Vec2; b: Vec2; c: Vec2; value: number }
  | { type: 'number'; value: number; slider?: boolean }
  | { type: 'curve'; fx: Fn1; fy: Fn1; t0: number; t1: number }
  | { type: 'integral'; f: Fn1; a: number; b: number; value: number }
  | { type: 'text'; text: string; pts?: Vec2[] }
  | { type: 'numbers'; values: number[] }
  | { type: 'riemann'; f: Fn1; a: number; b: number; n: number; rule: 'left' | 'right' | 'mid' | 'trap'; value: number }
  | { type: 'between'; f: Fn1; g: Fn1; a: number; b: number; value: number }
  | { type: 'slopefield'; F: Fn2 }
  | { type: 'bars'; bars: { x0: number; x1: number; h: number; hi?: boolean }[]; value?: number }
  | { type: 'boxplot'; s: [number, number, number, number, number]; y: number }
  /** a path through sample points; non-finite points break it */
  | { type: 'polyline'; pts: Vec2[] }
  | { type: 'surface'; f: Fn2 }
  | { type: 'implicit3d'; F: Fn3 }
  | { type: 'point3d'; p: Vec3 }
  | { type: 'points3d'; pts: Vec3[] }
  | { type: 'curve3d'; fx: Fn1; fy: Fn1; fz: Fn1; t0: number; t1: number }
  | { type: 'psurface'; fx: Fn2; fy: Fn2; fz: Fn2; u0: number; u1: number; v0: number; v1: number }
  | { type: 'sphere'; c: Vec3; r: number }
  | { type: 'vector3d'; a: Vec3; b: Vec3 };

export interface Resolved {
  obj: MObj;
  value?: Value;
  error?: string;
  /** LaTeX for the definition row */
  tex: string;
  /** Human readable value line (e.g. "= 2.83", "x = ±2") */
  display?: string;
  /** symbols that were undefined (used to auto-create sliders) */
  missing?: string[];
}

export const is3DOnly = (v?: Value) =>
  !!v && ['surface', 'implicit3d', 'point3d', 'points3d', 'curve3d', 'psurface', 'sphere', 'vector3d'].includes(v.type);
