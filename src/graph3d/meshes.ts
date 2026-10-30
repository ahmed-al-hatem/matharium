import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { labelText, shown, type Fn1, type Fn2, type Fn3, type MObj, type Resolved, type Vec2, type Vec3 } from '../math/types';
import { march } from '../graph2d/march';

export function clipPlanes(R: number) {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), R), new THREE.Plane(new THREE.Vector3(-1, 0, 0), R),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), R), new THREE.Plane(new THREE.Vector3(0, -1, 0), R),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), R), new THREE.Plane(new THREE.Vector3(0, 0, -1), R),
  ];
}

export function label(text: string, color: string, size: number): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = "italic 64px 'STIX Two Text', serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w; c.height = 84;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((size * w) / 84, size, 1);
  return s;
}

function phong(color: string, planes: THREE.Plane[], opacity = 0.85, vertexColors = false) {
  return new THREE.MeshPhongMaterial({
    color: vertexColors ? 0xffffff : color, vertexColors, side: THREE.DoubleSide, shininess: 50, specular: 0x222222,
    transparent: opacity < 1, opacity, clippingPlanes: planes, depthWrite: opacity >= 0.95,
  });
}

/** Grid mesh over a parameter rectangle; skips quads with invalid vertices. */
function gridMesh(N: number, at: (i: number, j: number) => [number, number, number] | null, color: string, planes: THREE.Plane[], zSpan: number, opacity = 0.88) {
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 3);
  const valid = new Uint8Array((N + 1) * (N + 1));
  const base = new THREE.Color(color);
  const lo = base.clone().multiplyScalar(0.55), hi = base.clone().lerp(new THREE.Color('#ffffff'), 0.35);
  const tmp = new THREE.Color();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * (N + 1) + i;
    const p = at(i, j);
    if (p && p.every(Number.isFinite)) {
      pos.set(p, k * 3);
      valid[k] = 1;
      tmp.copy(lo).lerp(hi, Math.min(1, Math.max(0, (p[2] / zSpan + 1) / 2)));
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    if (valid[a] && valid[b] && valid[c] && valid[d]) idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, phong(color, planes, opacity, true));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.35), transparent: true, opacity: 0.25, clippingPlanes: planes }));
  const grp = new THREE.Group();
  grp.add(mesh);
  if (N <= 60) grp.add(wire);
  return grp;
}

export function surface(f: Fn2, R: number, color: string, planes: THREE.Plane[], opacity?: number) {
  const N = 90;
  const lim = R * 4;
  return gridMesh(N, (i, j) => {
    const x = -R + (2 * R * i) / N, y = -R + (2 * R * j) / N;
    const z = f(x, y);
    return Number.isFinite(z) && Math.abs(z) < lim ? [x, y, z] : null;
  }, color, planes, R, opacity);
}

export function psurface(fx: Fn2, fy: Fn2, fz: Fn2, u0: number, u1: number, v0: number, v1: number, R: number, color: string, planes: THREE.Plane[], opacity?: number) {
  const N = 60;
  return gridMesh(N, (i, j) => {
    const u = u0 + ((u1 - u0) * i) / N, v = v0 + ((v1 - v0) * j) / N;
    return [fx(u, v), fy(u, v), fz(u, v)];
  }, color, planes, R, opacity);
}

export function implicit3d(F: Fn3, R: number, color: string, planes: THREE.Plane[], opacity = 0.85) {
  const res = 56;
  const mc = new MarchingCubes(res, phong(color, planes, opacity), false, false, 160000);
  mc.isolation = 0;
  const half = res / 2;
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const v = F(((x - half) / half) * R, ((y - half) / half) * R, ((z - half) / half) * R);
    mc.field[x + y * res + z * res * res] = Number.isFinite(v) ? Math.max(-1e4, Math.min(1e4, v)) : 1e4;
  }
  mc.update();
  mc.scale.set(R, R, R);
  return mc;
}

function tube(points: THREE.Vector3[], color: string, radius: number, planes: THREE.Plane[]) {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(points.length * 2, 1200), radius, 8, false), phong(color, planes, 1));
}

/** Sample a 3D curve, splitting into tubes at discontinuities. */
export function curve(fx: Fn1, fy: Fn1, fz: Fn1, t0: number, t1: number, R: number, color: string, planes: THREE.Plane[], n = 500, width = 2.5) {
  const grp = new THREE.Group();
  let run: THREE.Vector3[] = [];
  const lim = R * 3;
  const flush = () => { const m = tube(run, color, R * 0.012 * (width / 2.5), planes); if (m) grp.add(m); run = []; };
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p = new THREE.Vector3(fx(t), fy(t), fz(t));
    const okp = [p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) < lim);
    if (!okp || (run.length && p.distanceTo(run[run.length - 1]) > R)) flush();
    if (okp) run.push(p);
  }
  flush();
  return grp;
}

/** Line segments in the z = 0 plane; `dash` is [dash, gap] in world units for dashed and dotted styles. */
export function lines(segs: [Vec2, Vec2][], color: string, planes: THREE.Plane[], dash?: [number, number]) {
  const pos = new Float32Array(segs.length * 6);
  segs.forEach(([a, b], i) => pos.set([a.x, a.y, 0, b.x, b.y, 0], i * 6));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (!dash) return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, clippingPlanes: planes }));
  const l = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color, clippingPlanes: planes, dashSize: dash[0], gapSize: dash[1] }));
  l.computeLineDistances();
  return l;
}

function dash3d(style: MObj['lineStyle'], R: number): [number, number] | undefined {
  if (style === 'dashed') return [R * 0.05, R * 0.03];
  if (style === 'dotted') return [R * 0.008, R * 0.025];
  return undefined;
}

/** Positions left behind by a traced point. */
export function traceLine(pts: Vec3[], color: string, planes: THREE.Plane[]) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, clippingPlanes: planes }));
}

export function pointMesh(x: number, y: number, z: number, color: string, R: number, size = 5) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(R * 0.028 * (size / 5), 20, 14), new THREE.MeshPhongMaterial({ color, shininess: 80 }));
  m.position.set(x, y, z);
  return m;
}

/** Build a scene object for one resolved item (2D objects are placed in the z = 0 plane). */
export function build(r: Resolved, R: number, planes: THREE.Plane[], labels: boolean): THREE.Object3D | null {
  const v = r.value;
  if (!v || !shown(r)) return null;
  const { obj } = r;
  const color = obj.color;
  const grp = new THREE.Group();
  const op = obj.opacity, w = obj.lineWidth ?? 2.5, ps = obj.pointSize;
  const dash = dash3d(obj.lineStyle, R);
  const addLabel = (x: number, y: number, z: number) => {
    if (!(obj.showLabel ?? labels)) return;
    const s = label(labelText(r), color, R * 0.07);
    s.position.set(x + R * 0.06, y, z + R * 0.06);
    grp.add(s);
  };
  const zero = () => 0;
  switch (v.type) {
    case 'surface': grp.add(surface(v.f, R, color, planes, op)); break;
    case 'psurface': grp.add(psurface(v.fx, v.fy, v.fz, v.u0, v.u1, v.v0, v.v1, R, color, planes, op)); break;
    case 'implicit3d': grp.add(implicit3d(v.F, R, color, planes, op)); break;
    case 'sphere': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(v.r, 48, 32), phong(color, planes, op ?? 0.6));
      m.position.set(v.c.x, v.c.y, v.c.z);
      grp.add(m);
      break;
    }
    case 'point3d': grp.add(pointMesh(v.p.x, v.p.y, v.p.z, color, R, ps)); addLabel(v.p.x, v.p.y, v.p.z); break;
    case 'points3d': v.pts.forEach((p) => grp.add(pointMesh(p.x, p.y, p.z, color, R, ps))); break;
    case 'point': grp.add(pointMesh(v.p.x, v.p.y, 0, color, R, ps)); addLabel(v.p.x, v.p.y, 0); break;
    case 'points': v.pts.forEach((p) => grp.add(pointMesh(p.x, p.y, 0, color, R, ps))); break;
    case 'text': v.pts?.forEach((p) => grp.add(pointMesh(p.x, p.y, 0, color, R))); break;
    case 'curve3d': grp.add(curve(v.fx, v.fy, v.fz, v.t0, v.t1, R, color, planes, 500, w)); break;
    case 'curve': grp.add(curve(v.fx, v.fy, zero, v.t0, v.t1, R, color, planes, 500, w)); break;
    case 'function': grp.add(curve((t) => t, v.f, zero, -R, R, R, color, planes, 600, w)); break;
    case 'integral': case 'riemann': grp.add(curve((t) => t, v.f, zero, v.a, v.b, R, color, planes, 300, w)); break;
    case 'between': grp.add(curve((t) => t, v.f, zero, v.a, v.b, R, color, planes, 300, w), curve((t) => t, v.g, zero, v.a, v.b, R, color, planes, 300, w)); break;
    case 'polyline': {
      const segs: [Vec2, Vec2][] = [];
      for (let i = 1; i < v.pts.length; i++) {
        const a = v.pts[i - 1], b = v.pts[i];
        if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) segs.push([a, b]);
      }
      grp.add(lines(segs, color, planes, dash));
      break;
    }
    case 'bars': grp.add(lines(v.bars.flatMap((b) => [
      [{ x: b.x0, y: 0 }, { x: b.x0, y: b.h }], [{ x: b.x0, y: b.h }, { x: b.x1, y: b.h }], [{ x: b.x1, y: b.h }, { x: b.x1, y: 0 }],
    ] as [Vec2, Vec2][]), color, planes, dash)); break;
    case 'vector3d': {
      const a = new THREE.Vector3(v.a.x, v.a.y, v.a.z), b = new THREE.Vector3(v.b.x, v.b.y, v.b.z);
      const d = b.clone().sub(a);
      const len = d.length();
      if (len > 0) grp.add(new THREE.ArrowHelper(d.normalize(), a, len, color, Math.min(len * 0.25, R * 0.12), Math.min(len * 0.12, R * 0.06)));
      break;
    }
    case 'vector': {
      const d = new THREE.Vector3(v.b.x - v.a.x, v.b.y - v.a.y, 0);
      const len = d.length();
      if (len > 0) grp.add(new THREE.ArrowHelper(d.normalize(), new THREE.Vector3(v.a.x, v.a.y, 0), len, color, Math.min(len * 0.25, R * 0.12), Math.min(len * 0.12, R * 0.06)));
      break;
    }
    case 'segment': grp.add(lines([[v.a, v.b]], color, planes, dash)); break;
    case 'line': case 'ray': {
      const d = { x: v.b.x - v.a.x, y: v.b.y - v.a.y };
      const L = (R * 4) / (Math.hypot(d.x, d.y) || 1);
      const start = v.type === 'ray' ? v.a : { x: v.a.x - d.x * L, y: v.a.y - d.y * L };
      grp.add(lines([[start, { x: v.a.x + d.x * L, y: v.a.y + d.y * L }]], color, planes, dash));
      break;
    }
    case 'circle': {
      const segs: [Vec2, Vec2][] = [];
      for (let i = 0; i < 128; i++) {
        const t0 = (i / 128) * Math.PI * 2, t1 = ((i + 1) / 128) * Math.PI * 2;
        segs.push([{ x: v.c.x + v.r * Math.cos(t0), y: v.c.y + v.r * Math.sin(t0) }, { x: v.c.x + v.r * Math.cos(t1), y: v.c.y + v.r * Math.sin(t1) }]);
      }
      grp.add(lines(segs, color, planes, dash));
      break;
    }
    case 'polygon': grp.add(lines(v.pts.map((p, i) => [p, v.pts[(i + 1) % v.pts.length]] as [Vec2, Vec2]), color, planes, dash)); break;
    case 'implicit': {
      const segs = march(v.F, -R, R, -R, R, 160, 160).map((s) => [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }] as [Vec2, Vec2]);
      grp.add(lines(segs, color, planes, dash));
      break;
    }
    default: return null;
  }
  // higher layers are drawn later (renderOrder is per mesh, not inherited from the group)
  if (obj.layer) grp.traverse((c) => { c.renderOrder = obj.layer!; });
  return grp;
}

export function dispose(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
      (x as THREE.SpriteMaterial).map?.dispose();
      x.dispose();
    });
  });
}
