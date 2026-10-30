import { useEffect, useRef, useState } from 'react';
import { beginLive, useStore, type ToolId } from '../store/project';
import { useResolved } from '../store/resolved';
import { asCommand, asPolar, asTuple, splitDefinition } from '../math/parser';
import { arrowInput, roundAt, simplify, strokeInput, textInput } from '../math/annotate';
import { useTraceRecorder } from '../store/animate';
import { fmtPt } from '../math/solve';
import { pointCoords } from '../math/polar';
import { canHostPoint, paramOf, pointAt } from '../math/geometry';
import type { MObj, Resolved, Value, Vec2 } from '../math/types';
import { draw, type Overlay } from './renderer';
import { SvgCtx } from './svgctx';
import { Viewport } from './viewport';
import { snapPoint } from './grid';
import { hitTest } from './hit';
import { TextLayer } from './TextLayer';
import { exporters } from '../io/fileio';
import { useT } from '../i18n/i18n';
import { openMenu, useContextTrigger } from '../components/ContextMenu';
import { graph2dMenu, objectMenu } from '../components/contextMenus';

type Need = 'pt' | 'line' | 'fn' | 'obj';
interface ToolSpec { needs: Need[] | 'poly'; make?: (a: string[]) => string; shape?: Overlay['toolShape'] }

const isLine = (v: Value) => ['line', 'segment', 'ray', 'vector'].includes(v.type);
const isCurve = (v: Value) => v.type !== 'point' && v.type !== 'number' && v.type !== 'text' && v.type !== 'points';

export const TOOL_SPECS: Partial<Record<ToolId, ToolSpec>> = {
  point: { needs: ['pt'] },
  pointOn: { needs: ['obj'] },
  segment: { needs: ['pt', 'pt'], make: ([a, b]) => `Segment(${a}, ${b})`, shape: 'segment' },
  line: { needs: ['pt', 'pt'], make: ([a, b]) => `Line(${a}, ${b})`, shape: 'line' },
  ray: { needs: ['pt', 'pt'], make: ([a, b]) => `Ray(${a}, ${b})`, shape: 'ray' },
  vector: { needs: ['pt', 'pt'], make: ([a, b]) => `Vector(${a}, ${b})`, shape: 'vector' },
  polygon: { needs: 'poly', make: (a) => `Polygon(${a.join(', ')})`, shape: 'polygon' },
  circle: { needs: ['pt', 'pt'], make: ([a, b]) => `Circle(${a}, ${b})`, shape: 'circle' },
  circle3: { needs: ['pt', 'pt', 'pt'], make: ([a, b, c]) => `Circle(${a}, ${b}, ${c})`, shape: 'segment' },
  midpoint: { needs: ['pt', 'pt'], make: ([a, b]) => `Midpoint(${a}, ${b})`, shape: 'segment' },
  perpendicular: { needs: ['pt', 'line'], make: ([a, l]) => `Perpendicular(${a}, ${l})` },
  parallel: { needs: ['pt', 'line'], make: ([a, l]) => `Parallel(${a}, ${l})` },
  bisector: { needs: ['pt', 'pt'], make: ([a, b]) => `PerpendicularBisector(${a}, ${b})`, shape: 'segment' },
  intersect: { needs: ['obj', 'obj'], make: ([a, b]) => `Intersect(${a}, ${b})` },
  tangent: { needs: ['pt', 'fn'], make: ([a, f]) => `Tangent(${a}, ${f})` },
  distance: { needs: ['pt', 'pt'], make: ([a, b]) => `Distance(${a}, ${b})`, shape: 'segment' },
  angle: { needs: ['pt', 'pt', 'pt'], make: ([a, b, c]) => `Angle(${a}, ${b}, ${c})`, shape: 'segment' },
};

const nameOf = (r: Resolved) => splitDefinition(r.obj.input).name ?? r.obj.name;
const SKETCH_TOOLS: ToolId[] = ['text', 'pen', 'arrow'];

/** A Text(…) whose position is a literal pair can be dragged (one anchored to a point follows the point). */
function draggableLabel(o: MObj) {
  if (o.fixed) return false;
  const c = asCommand(splitDefinition(o.input).body);
  const tup = c?.name === 'Text' && c.args[1] ? asTuple(c.args[1]) : null;
  return !!tup && tup.length === 2 && tup.every((s) => /^\s*-?(\d+\.?\d*|\.\d+)(e-?\d+)?\s*$/i.test(s));
}

const draggable = (r: Resolved | null) => !!r && !r.obj.fixed && r.value?.type === 'point' && (r.value.free || !!r.value.on);

export function Canvas2D() {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ W: 800, H: 600 });
  const items = useResolved();
  const view = useStore((s) => s.view);
  const settings = useStore((s) => s.settings);
  const mode = useStore((s) => s.mode);
  const selectedId = useStore((s) => s.selectedId);
  const tool = useStore((s) => s.tool);
  const traces = useStore((s) => s.traces);
  const [hover, setHover] = useState<Overlay['hover']>(null);
  const [mouse, setMouse] = useState<Vec2 | null>(null);
  const [pending, setPending] = useState<{ name: string; p: Vec2 }[]>([]);
  const [fontsReady, setFontsReady] = useState(0);
  const drag = useRef<{ kind: 'pan' | 'point' | 'label'; id?: string; sx: number; sy: number; view: typeof view; moved: boolean; off?: Vec2 } | null>(null);
  const [sketch, setSketch] = useState<{ pts: Vec2[]; arrow: boolean } | null>(null);
  const sketchRef = useRef<{ pts: Vec2[]; arrow: boolean } | null>(null);
  const [textDraft, setTextDraft] = useState<{ px: number; py: number; value: string } | null>(null);
  const draftRef = useRef(textDraft);
  draftRef.current = textDraft;
  const draftInput = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; view: typeof view } | null>(null);

  const vp = new Viewport(view, size.W, size.H);
  const spec = TOOL_SPECS[tool];
  useTraceRecorder(items);

  useEffect(() => { setPending([]); setTextDraft(null); }, [tool]);
  // focus after the click that opened it, so the canvas mousedown does not blur it straight away
  useEffect(() => {
    if (!textDraft) return;
    const id = setTimeout(() => draftInput.current?.focus());
    return () => clearTimeout(id);
  }, [textDraft?.px, textDraft?.py]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady((n) => n + 1)); }, []);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // render
  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.W * dpr);
    c.height = Math.round(size.H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, items, {
      W: size.W, H: size.H, view, settings, selectedId, mode, htmlText: true, traces,
      overlay: { hover, pending: pending.map((p) => p.p), mouse, toolShape: spec?.shape ?? null, sketch },
    });
  }, [items, view, settings, selectedId, hover, pending, mouse, size, spec, fontsReady, mode, sketch, traces]);

  // exporters
  useEffect(() => {
    exporters.png = () => {
      const c = document.createElement('canvas');
      c.width = size.W * 2; c.height = size.H * 2;
      const ctx = c.getContext('2d')!;
      ctx.scale(2, 2);
      draw(ctx, items, { W: size.W, H: size.H, view, settings, selectedId: null, mode, traces });
      return c.toDataURL('image/png');
    };
    exporters.svg = () => {
      const s = new SvgCtx(size.W, size.H);
      draw(s, items, { W: size.W, H: size.H, view, settings, selectedId: null, mode, traces });
      return s.toString();
    };
  }, [items, view, settings, size, mode, traces]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const snapW = (p: Vec2): Vec2 => {
    if (!settings.snap) return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
    return snapPoint(p, view, settings.gridType);
  };

  const store = useStore.getState;

  function acquire(need: Need, px: number, py: number): { name: string; p: Vec2 } | null {
    if (need === 'pt') {
      const hit = hitTest(items, vp, px, py, (v) => v.type === 'point');
      if (hit && hit.value?.type === 'point') return { name: nameOf(hit), p: hit.value.p };
      const p = snapW({ x: vp.wx(px), y: vp.wy(py) });
      const name = store().addObject(`(${p.x}, ${p.y})`);
      return { name, p };
    }
    const accept = need === 'line' ? isLine : need === 'fn' ? (v: Value) => v.type === 'function' : isCurve;
    const hit = hitTest(items, vp, px, py, accept);
    return hit ? { name: nameOf(hit), p: { x: vp.wx(px), y: vp.wy(py) } } : null;
  }

  const roundW = (p: Vec2): Vec2 => ({ x: roundAt(p.x, view.sx), y: roundAt(p.y, view.sy) });

  function commitText() {
    const d = draftRef.current;
    if (!d) return;
    draftRef.current = null;
    setTextDraft(null);
    if (d.value.trim()) store().addObject(textInput(d.value.trim(), roundW({ x: vp.wx(d.px), y: vp.wy(d.py) })));
  }

  function finishSketch() {
    const sk = sketchRef.current;
    sketchRef.current = null;
    setSketch(null);
    if (!sk || sk.pts.length < 2) return;
    const toPx = (p: Vec2) => ({ x: vp.px(p.x), y: vp.py(p.y) });
    const toW = (p: Vec2) => roundW({ x: vp.wx(p.x), y: vp.wy(p.y) });
    if (sk.arrow) {
      const [a, b] = sk.pts.map(toPx);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 6) store().addObject(arrowInput(toW(a), toW(b)));
      return;
    }
    const pts = simplify(sk.pts.map(toPx), 0.8).map(toW);
    if (pts.length >= 2) store().addObject(strokeInput(pts));
  }

  function toolClick(px: number, py: number) {
    const st = store();
    if (tool === 'text') {
      // a click while typing finishes the current text; the next click starts a new one
      if (draftRef.current) commitText(); else setTextDraft({ px, py, value: '' });
      return;
    }
    if (tool === 'delete') {
      const hit = hitTest(items, vp, px, py);
      if (hit) st.removeObject(hit.obj.id);
      return;
    }
    if (tool === 'slider') {
      st.addObject(`${freeSliderName()} = 1`, { slider: { min: -5, max: 5, step: 0.1 } });
      st.setPanel('algebra');
      return;
    }
    if (tool === 'pointOn') {
      const hit = hitTest(items, vp, px, py, canHostPoint);
      if (!hit?.value) { st.notify('pickObject'); return; }
      const t = +paramOf(hit.value, { x: vp.wx(px), y: vp.wy(py) }).toFixed(6);
      const name = st.addObject(`Point(${nameOf(hit)}, ${t})`);
      const created = store().objects.find((o) => o.name === name);
      if (created) st.select(created.id);
      return;
    }
    if (!spec) return;
    if (spec.needs === 'poly') {
      const first = pending[0];
      if (first && pending.length >= 3 && Math.hypot(vp.px(first.p.x) - px, vp.py(first.p.y) - py) < 12) {
        st.addObject(spec.make!(pending.map((p) => p.name)));
        setPending([]);
        return;
      }
      const got = acquire('pt', px, py);
      if (got) setPending([...pending, got]);
      return;
    }
    const need = spec.needs[pending.length];
    const got = acquire(need, px, py);
    if (!got) { st.notify('pickObject'); return; }
    const next = [...pending, got];
    if (next.length === spec.needs.length) {
      if (spec.make) {
        const name = st.addObject(spec.make(next.map((p) => p.name)));
        const created = store().objects.find((o) => o.name === name);
        if (created) st.select(created.id);
      }
      setPending([]);
    } else setPending(next);
  }

  function freeSliderName() {
    const used = new Set(store().objects.map((o) => o.name));
    for (let n = 0; ; n++) for (const b of 'abcdkmn') { const s = n ? `${b}${n}` : b; if (!used.has(s)) return s; }
  }

  // right click, long press or the Menu key: the object under the pointer (or the selected one), else the graph itself
  const menuTrigger = useContextTrigger((x, y, via) => {
    drag.current = null;
    pinch.current = null;
    sketchRef.current = null;
    setSketch(null);
    setHover(null);
    const { px, py } = local({ clientX: x, clientY: y });
    const st = store();
    const id = via === 'key' ? st.selectedId : hitTest(items, vp, px, py)?.obj.id;
    if (id) {
      st.select(id);
      openMenu({ x, y, via, label: t('more'), build: objectMenu(id), returnFocus: canvas.current });
    } else openMenu({ x, y, via, label: t('ctx.graphics'), build: graph2dMenu(size.W, size.H), returnFocus: canvas.current });
  });

  function onPointerDown(e: React.PointerEvent) {
    menuTrigger.onPointerDown(e);
    if (e.button === 2) return; // the context menu
    (e.target as Element).setPointerCapture(e.pointerId);
    const { px, py } = local(e);
    pointers.current.set(e.pointerId, { x: px, y: py });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), view };
      drag.current = null;
      return;
    }
    if (tool === 'pen' || tool === 'arrow') {
      const w = { x: vp.wx(px), y: vp.wy(py) };
      sketchRef.current = { pts: [w, w], arrow: tool === 'arrow' };
      setSketch(sketchRef.current);
      return;
    }
    if (tool !== 'move') { toolClick(px, py); return; }
    const hit = hitTest(items, vp, px, py);
    if (hit?.value?.type === 'label' && draggableLabel(hit.obj)) {
      const v = hit.value;
      beginLive();
      const ax = v.screen ? v.p.x : vp.px(v.p.x), ay = v.screen ? v.p.y : vp.py(v.p.y);
      drag.current = { kind: 'label', id: hit.obj.id, sx: px, sy: py, view, moved: false, off: { x: ax - px, y: ay - py } };
      store().select(hit.obj.id);
      return;
    }
    if (hit && draggable(hit)) {
      beginLive();
      drag.current = { kind: 'point', id: hit.obj.id, sx: px, sy: py, view, moved: false };
      store().select(hit.obj.id);
      return;
    }
    store().select(hit ? hit.obj.id : null);
    drag.current = { kind: 'pan', sx: px, sy: py, view, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    menuTrigger.onPointerMove(e);
    const { px, py } = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: px, y: py });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const f = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d;
      const v0 = pinch.current.view;
      store().setView({ sx: v0.sx * f, sy: v0.sy * f });
      return;
    }
    const w = { x: vp.wx(px), y: vp.wy(py) };
    const sk = sketchRef.current;
    if (sk) {
      const last = sk.pts[sk.pts.length - 1];
      if (sk.arrow) sketchRef.current = { ...sk, pts: [sk.pts[0], w] };
      else if (Math.hypot(vp.px(last.x) - px, vp.py(last.y) - py) >= 1.5) sketchRef.current = { ...sk, pts: [...sk.pts, w] };
      setSketch(sketchRef.current);
      return;
    }
    setMouse(spec ? snapW(w) : w);
    const d = drag.current;
    if (d) {
      if (Math.hypot(px - d.sx, py - d.sy) > 2) d.moved = true;
      if (d.kind === 'pan') {
        store().setView({ ox: d.view.ox - (px - d.sx) / d.view.sx, oy: d.view.oy + (py - d.sy) / d.view.sy });
      } else if (d.kind === 'label' && d.id) {
        const r = items.find((x) => x.obj.id === d.id);
        if (r?.value?.type !== 'label' || !d.moved) return;
        const ax = px + d.off!.x, ay = py + d.off!.y;
        const p = r.value.screen ? { x: Math.round(ax), y: Math.round(ay) } : roundW({ x: vp.wx(ax), y: vp.wy(ay) });
        store().liveUpdate(d.id, { input: textInput(r.value.text, p, r.value.screen, splitDefinition(r.obj.input).name) });
      } else if (d.id) {
        const o = store().objects.find((x) => x.id === d.id);
        if (!o) return;
        const named = splitDefinition(o.input).name;
        const pv = items.find((r) => r.obj.id === o.id)?.value;
        if (pv?.type === 'point' && pv.on) {
          // a point on an object slides along it: keep the object, store the nearest parameter
          const t = +paramOf(pv.on.target, w).toFixed(6);
          const q = pointAt(pv.on.target, t);
          if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
          store().liveUpdate(o.id, { input: `${named ? `${named} = ` : ''}Point(${pv.on.src}, ${t})` });
          setHover({ p: q, color: o.color, text: `${o.name} ${fmtPt(q, 2)}` });
          return;
        }
        const p = snapW(w);
        // a polar point stays polar: (r; θ°)
        const coords = pointCoords(p, !!asPolar(splitDefinition(o.input).body));
        store().liveUpdate(o.id, { input: `${named ? `${named} = ` : ''}${coords}` });
        setHover({ p, color: o.color, text: `${o.name} ${fmtPt(p, 2)}` });
      }
      return;
    }
    // hover trace
    const hit = hitTest(items, vp, px, py, (v) => ['function', 'point', 'points', 'integral'].includes(v.type));
    if (hit?.value) {
      const v = hit.value;
      if (v.type === 'function' || v.type === 'integral') {
        const p = { x: w.x, y: v.f(w.x) };
        setHover({ p, color: hit.obj.color, text: `${hit.obj.name}: ${fmtPt(p, 3)}` });
      } else if (v.type === 'point') setHover({ p: v.p, color: hit.obj.color, text: `${hit.obj.name} ${fmtPt(v.p, 3)}` });
      else if (v.type === 'points') {
        const p = v.pts.reduce((a, b) => (Math.hypot(vp.px(a.x) - px, vp.py(a.y) - py) < Math.hypot(vp.px(b.x) - px, vp.py(b.y) - py) ? a : b));
        setHover({ p, color: hit.obj.color, text: fmtPt(p, 4) });
      }
    } else if (hover) setHover(null);
    canvas.current!.style.cursor = tool !== 'move' ? 'crosshair' : draggable(hit) ? 'grab' : 'default';
  }

  function onPointerUp(e: React.PointerEvent) {
    menuTrigger.onPointerUp();
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (sketchRef.current) finishSketch();
    if (drag.current?.kind === 'point' || drag.current?.kind === 'label') { store().commit(); setHover(null); }
    drag.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const { px, py } = local(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const wx = vp.wx(px), wy = vp.wy(py);
    const sx = Math.min(1e6, Math.max(1e-4, view.sx * f)), sy = Math.min(1e6, Math.max(1e-4, view.sy * f));
    store().setView({ sx, sy, ox: wx - (px - size.W / 2) / sx, oy: wy + (py - size.H / 2) / sy });
  }

  function onDoubleClick(e: React.MouseEvent) {
    const { px, py } = local(e);
    const hit = hitTest(items, vp, px, py);
    if (hit) { store().setPanel('algebra'); store().select(hit.obj.id); store().setEditing(hit.obj.id); }
  }

  useEffect(() => {
    const el = canvas.current!;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    return () => el.removeEventListener('wheel', prevent);
  }, []);

  const hint = spec || SKETCH_TOOLS.includes(tool) ? (pending.length ? 'toolNext' : 'toolStart') : null;

  return (
    <div ref={wrap} className="canvas-wrap">
      <canvas
        ref={canvas}
        style={{ width: size.W, height: size.H, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { setMouse(null); if (!drag.current) setHover(null); }}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={menuTrigger.onContextMenu}
        onKeyDown={menuTrigger.onKeyDown}
        tabIndex={0}
        aria-label="Graph"
      />
      <TextLayer items={items} view={view} W={size.W} H={size.H} selectedId={selectedId} />
      {textDraft && (
        <input
          ref={draftInput}
          className="text-draft"
          style={{ left: textDraft.px, top: textDraft.py }}
          dir="auto"
          value={textDraft.value}
          placeholder={t('textPlaceholder')}
          aria-label={t('tool.text')}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            else if (e.key === 'Escape') { draftRef.current = null; setTextDraft(null); }
          }}
          onBlur={commitText}
        />
      )}
      {hint && <ToolHint tool={tool} step={pending.length} onCancel={() => setPending([])} />}
    </div>
  );
}


function ToolHint({ tool, step, onCancel }: { tool: ToolId; step: number; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="tool-hint">
      <span>{t(`tool.${tool}`)}</span>
      <span className="muted">{t(`toolHelp.${tool}`)}{step ? ` · ${step}` : ''}</span>
      {step > 0 && <button onClick={onCancel}>{t('cancel')}</button>}
    </div>
  );
}
