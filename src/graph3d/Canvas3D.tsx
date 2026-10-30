import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { build, clipPlanes, dispose, label } from './meshes';
import { exporters } from '../io/fileio';
import { cam3d } from './handle';


const AXIS_COLORS = ['#E45B45', '#6DC4AA', '#3282F6'];

function buildAxes(R: number, show: boolean, grid: boolean) {
  const g = new THREE.Group();
  if (grid) {
    const n = Math.round(R) * 2;
    const gh = new THREE.GridHelper(2 * R, n, 0x3a3b3a, 0x232423);
    gh.rotation.x = Math.PI / 2;
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.9;
    g.add(gh);
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
    const step = R > 12 ? 5 : R > 6 ? 2 : 1;
    for (let v = -Math.floor(R / step) * step; v <= R; v += step) {
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
  const R = settings.range3d;

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
    controls.addEventListener('change', render);
    ctx.current = { renderer, scene, camera, controls, content, axes, render };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(el);
    cam3d.zoom = (f) => { camera.position.multiplyScalar(1 / f); controls.update(); render(); };
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
    c.camera.position.set(R * 2.1, -R * 2.6, R * 1.7);
    c.controls.target.set(0, 0, 0);
    c.controls.update();
    c.render();
  }, [homeToken, R]);

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
