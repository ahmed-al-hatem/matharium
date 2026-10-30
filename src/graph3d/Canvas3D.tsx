import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AnaglyphEffect } from 'three/examples/jsm/effects/AnaglyphEffect.js';
import { labelDefault, useStore, type Projection } from '../store/project';
import { useResolved } from '../store/resolved';
import { shown } from '../math/types';
import { build, clipPlanes, dispose, label, traceLine } from './meshes';
import { useTraceRecorder } from '../store/animate';
import { exporters } from '../io/fileio';
import { cam3d } from './handle';
import { openMenu, useContextTrigger } from '../components/ContextMenu';
import { graph3dMenu } from '../components/contextMenus';
import { useT } from '../i18n/i18n';


const AXIS_COLORS = ['#E45B45', '#6DC4AA', '#3282F6'];
/** Camera offset from the target at "home", in units of the range. */
const HOME = new THREE.Vector3(2.1, -2.6, 1.7);

// AnaglyphEffect keeps its StereoCamera private and fixes the eye separation at 0.064, which is far too small for a camera
// some 30 units away; tie it to the focus distance (set to the orbit distance before each anaglyph render) instead.
const stereoUpdate = THREE.StereoCamera.prototype.update;
THREE.StereoCamera.prototype.update = function (this: THREE.StereoCamera, cam: THREE.PerspectiveCamera) {
  this.eyeSep = cam.focus / 30;
  stereoUpdate.call(this, cam);
};

/** Cabinet projection: depth recedes at 45°, drawn at half length. */
const OBLIQUE = { k: 0.5, angle: Math.PI / 4 };

/**
 * Point the parallel camera along the orbit camera's line of sight with a frustum that shows the target at the same size,
 * and for oblique add a shear so depth (measured from the target) shifts x and y.
 */
function syncParallel(ortho: THREE.OrthographicCamera, cam: THREE.PerspectiveCamera, target: THREE.Vector3, oblique: boolean) {
  const dist = cam.position.distanceTo(target);
  const h = dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), w = h * cam.aspect;
  ortho.position.copy(cam.position);
  ortho.quaternion.copy(cam.quaternion);
  Object.assign(ortho, { left: -w, right: w, top: h, bottom: -h, near: -dist * 20, far: dist * 50 });
  ortho.updateProjectionMatrix();
  if (oblique) {
    // in view space the target is at z = -dist and depth beyond it is z + dist < 0; it recedes up and to the right:
    // x' = x - k cos(a) (z + dist), y' = y - k sin(a) (z + dist)
    const cx = OBLIQUE.k * Math.cos(OBLIQUE.angle), cy = OBLIQUE.k * Math.sin(OBLIQUE.angle);
    const shear = new THREE.Matrix4().set(1, 0, -cx, -cx * dist, 0, 1, -cy, -cy * dist, 0, 0, 1, 0, 0, 0, 0, 1);
    ortho.projectionMatrix.multiply(shear);
    ortho.projectionMatrixInverse.copy(ortho.projectionMatrix).invert();
  }
  ortho.updateMatrixWorld();
}

/** Smallest 1/2/5 × 10^k that is ≥ x. */
function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= x * 0.999)!;
}

function buildAxes(R: number, show: boolean, grid: boolean, showPlane: boolean, polar = false) {
  const g = new THREE.Group();
  const step = niceStep(R / 6);
  const ticks: number[] = [];
  for (let i = -Math.floor(R / step); i * step <= R + 1e-9; i++) ticks.push(+(i * step).toPrecision(12));
  if (grid) {
    const major: number[] = [], minor: number[] = [];
    const half = step / 2;
    if (polar) {
      // circles every half step and rays every 15° in the z = 0 plane
      for (let i = 1; i * half <= R + 1e-9; i++) {
        const r = i * half, out = i % 2 ? minor : major;
        for (let k = 0; k < 96; k++) {
          const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
          out.push(r * Math.cos(a0), r * Math.sin(a0), 0, r * Math.cos(a1), r * Math.sin(a1), 0);
        }
      }
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12;
        (k % 2 ? minor : major).push(0, 0, 0, R * Math.cos(a), R * Math.sin(a), 0);
      }
    } else for (let i = -Math.floor(R / half); i * half <= R + 1e-9; i++) {
      const v = i * half;
      (i % 2 ? minor : major).push(v, -R, 0, v, R, 0, -R, v, 0, R, v, 0);
    }
    const lines = (pos: number[], color: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    };
    g.add(lines(minor, 0x1c1d1c), lines(major, 0x3a3b3a));
  }
  if (showPlane) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshBasicMaterial({ color: 0x787978, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    g.add(plane);
  }
  if (!show) return g;
  const L = R * 1.15;
  const dirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  dirs.forEach((d, i) => {
    const color = AXIS_COLORS[i];
    const geo = new THREE.BufferGeometry().setFromPoints([d.clone().multiplyScalar(-L), d.clone().multiplyScalar(L)]);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
    g.add(new THREE.ArrowHelper(d, d.clone().multiplyScalar(L - R * 0.001), R * 0.08, color, R * 0.08, R * 0.035));
    const name = label('xyz'[i], color, R * 0.09);
    name.position.copy(d.clone().multiplyScalar(L + R * 0.1));
    g.add(name);
    for (const v of ticks) {
      if (v === 0) continue;
      const s = label(String(v).replace('-', '−'), '#787978', R * 0.05);
      s.position.copy(d.clone().multiplyScalar(v));
      if (i < 2) s.position.z -= R * 0.05; else s.position.x -= R * 0.06;
      g.add(s);
    }
  });
  return g;
}

export function Canvas3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; content: THREE.Group; axes: THREE.Group; trails: THREE.Group; render: () => void } | null>(null);
  const items = useResolved();
  const settings = useStore((s) => s.settings);
  const homeToken = useStore((s) => s.homeToken);
  const autoRotate = useStore((s) => s.autoRotate);
  const t = useT();
  const traces = useStore((s) => s.traces);
  useTraceRecorder(items);
  const projRef = useRef<Projection>(settings.projection);
  // the visible range follows the camera: zooming out doubles it, zooming in halves it, so the grid never runs out
  const [level, setLevel] = useState(0);
  const base = settings.range3d;
  const baseRef = useRef(base);
  baseRef.current = base;
  const R = base * 2 ** level;

  // setup
  useEffect(() => {
    const el = wrap.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0D0E0D');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.1); d1.position.set(5, -8, 12); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xbfd4ff, 0.45); d2.position.set(-8, 6, -4); scene.add(d2);
    const content = new THREE.Group(); scene.add(content);
    const axes = new THREE.Group(); scene.add(axes);
    const trails = new THREE.Group(); scene.add(trails);
    const controls = new OrbitControls(camera, renderer.domElement);
    // the orbit controls always drive the perspective camera; the other projections follow its pose, so switching keeps the angle
    const ortho = new THREE.OrthographicCamera();
    let anaglyph: AnaglyphEffect | null = null;
    const render = () => {
      const p = projRef.current;
      if (p !== 'anaglyph' && anaglyph) { anaglyph.dispose(); anaglyph = null; }
      if (p === 'anaglyph') {
        if (!anaglyph) { anaglyph = new AnaglyphEffect(renderer); anaglyph.setSize(el.clientWidth, el.clientHeight); }
        camera.focus = camera.position.distanceTo(controls.target);
        anaglyph.render(scene, camera);
      } else if (p === 'orthographic' || p === 'oblique') {
        syncParallel(ortho, camera, controls.target, p === 'oblique');
        renderer.render(scene, ortho);
      } else renderer.render(scene, camera);
    };
    controls.addEventListener('change', () => {
      const dist = camera.position.distanceTo(controls.target);
      camera.near = dist / 1000;
      camera.far = dist * 50;
      camera.updateProjectionMatrix();
      const lv = Math.round(Math.log2(dist / (HOME.length() * baseRef.current)));
      setLevel(Math.max(-8, Math.min(12, lv)));
      render();
    });
    ctx.current = { renderer, scene, camera, controls, content, axes, trails, render };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      anaglyph?.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(el);
    cam3d.zoom = (f) => {
      camera.position.sub(controls.target).multiplyScalar(1 / f).add(controls.target);
      controls.update();
    };
    exporters.png = () => { render(); return renderer.domElement.toDataURL('image/png'); };
    exporters.svg = () => null;
    return () => {
      ro.disconnect();
      controls.dispose();
      anaglyph?.dispose();
      dispose(scene);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
      cam3d.zoom = undefined;
    };
  }, []);

  // auto-rotate: the controls turn the camera a little on every update while it is on
  useEffect(() => {
    const c = ctx.current!;
    c.controls.autoRotate = autoRotate;
    if (!autoRotate) return;
    let id = requestAnimationFrame(function tick() { c.controls.update(); id = requestAnimationFrame(tick); });
    return () => { cancelAnimationFrame(id); c.controls.autoRotate = false; };
  }, [autoRotate]);

  // camera home
  useEffect(() => {
    const c = ctx.current!;
    c.camera.position.copy(HOME).multiplyScalar(base);
    c.controls.target.set(0, 0, 0);
    c.controls.update();
    c.render();
  }, [homeToken, base]);

  // projection
  useEffect(() => {
    projRef.current = settings.projection;
    ctx.current!.render();
  }, [settings.projection]);

  // axes + grid
  useEffect(() => {
    const c = ctx.current!;
    c.axes.children.forEach(dispose);
    c.axes.clear();
    c.axes.add(buildAxes(R, settings.axes3d, settings.grid3d, settings.plane3d, settings.gridType === 'polar'));
    c.render();
  }, [R, settings.axes3d, settings.grid3d, settings.plane3d, settings.gridType]);

  // objects
  useEffect(() => {
    const c = ctx.current!;
    c.content.children.forEach(dispose);
    c.content.clear();
    const planes = clipPlanes(R * 1.0001);
    for (const r of items) {
      try {
        const o = build(r, R, planes, labelDefault(settings, '3d', r.value?.type === 'point' || r.value?.type === 'point3d'));
        if (o) c.content.add(o);
      } catch (e) {
        console.warn('3D build failed', r.obj.name, e);
      }
    }
    c.render();
  }, [items, R, settings.labels]);

  // traces of moving points
  useEffect(() => {
    const c = ctx.current!;
    c.trails.children.forEach(dispose);
    c.trails.clear();
    const planes = clipPlanes(R * 1.0001);
    for (const r of items) {
      const tr = r.obj.trace && shown(r) ? traces[r.obj.id] : undefined;
      if (tr && tr.length > 1) c.trails.add(traceLine(tr, r.obj.color, planes));
    }
    c.render();
  }, [items, R, traces]);

  // a right-button drag pans; only a right click without moving opens the menu
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const trigger = useContextTrigger((x, y, via) => {
    const d = rightDown.current;
    rightDown.current = null;
    if (via === 'mouse' && d && Math.hypot(x - d.x, y - d.y) > 5) return;
    openMenu({ x, y, via, label: t('ctx.graphics3d'), build: graph3dMenu, returnFocus: wrap.current });
  });

  return (
    <div ref={wrap} className="canvas-wrap canvas-3d" aria-label="3D graph" tabIndex={0}
      onContextMenu={trigger.onContextMenu} onKeyDown={trigger.onKeyDown}
      onPointerDown={(e) => { if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY }; trigger.onPointerDown(e); }}
      onPointerMove={trigger.onPointerMove} onPointerUp={trigger.onPointerUp} onPointerCancel={trigger.onPointerCancel} />
  );
}
