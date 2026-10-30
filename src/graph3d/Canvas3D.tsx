import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { build, clipPlanes, dispose, label } from './meshes';
import { exporters } from '../io/fileio';
import { cam3d } from './handle';


const AXIS_COLORS = ['#E45B45', '#6DC4AA', '#3282F6'];
/** Camera offset from the target at "home", in units of the range. */
const HOME = new THREE.Vector3(2.1, -2.6, 1.7);

/** Smallest 1/2/5 × 10^k that is ≥ x. */
function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= x * 0.999)!;
}

function buildAxes(R: number, show: boolean, grid: boolean) {
  const g = new THREE.Group();
  const step = niceStep(R / 6);
  const ticks: number[] = [];
  for (let i = -Math.floor(R / step); i * step <= R + 1e-9; i++) ticks.push(+(i * step).toPrecision(12));
  if (grid) {
    const major: number[] = [], minor: number[] = [];
    const half = step / 2;
    for (let i = -Math.floor(R / half); i * half <= R + 1e-9; i++) {
      const v = i * half;
      (i % 2 ? minor : major).push(v, -R, 0, v, R, 0, -R, v, 0, R, v, 0);
    }
    const lines = (pos: number[], color: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    };
    g.add(lines(minor, 0x1c1d1c), lines(major, 0x3a3b3a));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshBasicMaterial({ color: 0x787978, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
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
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; content: THREE.Group; axes: THREE.Group; render: () => void } | null>(null);
  const items = useResolved();
  const settings = useStore((s) => s.settings);
  const homeToken = useStore((s) => s.homeToken);
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
    const controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', () => {
      const dist = camera.position.distanceTo(controls.target);
      camera.near = dist / 1000;
      camera.far = dist * 50;
      camera.updateProjectionMatrix();
      const lv = Math.round(Math.log2(dist / (HOME.length() * baseRef.current)));
      setLevel(Math.max(-8, Math.min(12, lv)));
      render();
    });
    ctx.current = { renderer, scene, camera, controls, content, axes, render };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
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
      dispose(scene);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
      cam3d.zoom = undefined;
    };
  }, []);

  // camera home
  useEffect(() => {
    const c = ctx.current!;
    c.camera.position.copy(HOME).multiplyScalar(base);
    c.controls.target.set(0, 0, 0);
    c.controls.update();
    c.render();
  }, [homeToken, base]);

  // axes + grid
  useEffect(() => {
    const c = ctx.current!;
    c.axes.children.forEach(dispose);
    c.axes.clear();
    c.axes.add(buildAxes(R, settings.axes, settings.grid));
    c.render();
  }, [R, settings.axes, settings.grid]);

  // objects
  useEffect(() => {
    const c = ctx.current!;
    c.content.children.forEach(dispose);
    c.content.clear();
    const planes = clipPlanes(R * 1.0001);
    for (const r of items) {
      try {
        const o = build(r, R, planes, settings.labels);
        if (o) c.content.add(o);
      } catch (e) {
        console.warn('3D build failed', r.obj.name, e);
      }
    }
    c.render();
  }, [items, R, settings.labels]);

  return <div ref={wrap} className="canvas-wrap canvas-3d" aria-label="3D graph" />;
}
