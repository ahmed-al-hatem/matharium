import { useEffect } from 'react';
import { splitDefinition } from '../math/parser';
import type { AnimMode, MObj, Resolved, Vec3 } from '../math/types';
import { beginLive, useStore } from './project';

/** Seconds for one sweep from min to max at ×1. */
export const SWEEP_S = 4;
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
export const ANIM_MODES: AnimMode[] = ['oscillate', 'increase', 'once'];

type Range = NonNullable<MObj['slider']>;

/** Move an animated value forward by dt seconds. */
export function advance(value: number, dir: number, s: Range, dt: number): { value: number; dir: number; done: boolean } {
  const span = s.max - s.min;
  if (!(span > 0)) return { value: s.min, dir, done: true };
  const mode = s.mode ?? 'oscillate';
  let v = value + dir * ((span * (s.speed ?? 1) * dt) / SWEEP_S);
  if (mode === 'once') return v >= s.max ? { value: s.max, dir: 1, done: true } : { value: v, dir: 1, done: false };
  if (mode === 'increase') {
    if (v > s.max) v = s.min + ((v - s.max) % span);
    return { value: v, dir: 1, done: false };
  }
  // oscillate: reflect off both ends
  while (v > s.max || v < s.min) {
    if (v > s.max) { v = 2 * s.max - v; dir = -1; }
    if (v < s.min) { v = 2 * s.min - v; dir = 1; }
  }
  return { value: v, dir, done: false };
}

/** Seconds until an animation returns to where it started (or ends, for "once"). */
export function cycleSeconds(value: number, s: Range): number {
  const speed = s.speed ?? 1;
  const mode = s.mode ?? 'oscillate';
  if (mode === 'once') return (SWEEP_S * Math.max(0, s.max - value)) / ((s.max - s.min) * speed || 1);
  return (mode === 'oscillate' ? 2 : 1) * SWEEP_S / speed;
}

export const sliderValue = (o: MObj) => {
  const v = parseFloat(splitDefinition(o.input).body);
  return Number.isFinite(v) ? v : o.slider?.min ?? 0;
};

const cur = new Map<string, number>();
const dirs = new Map<string, number>();
let raf = 0;
let last = 0;

const shown = (v: number, s: Range) => +Math.min(s.max, Math.max(s.min, Math.round(v / s.step) * s.step)).toFixed(6);

function start(o: MObj) {
  const s = o.slider!;
  let v = sliderValue(o);
  if ((s.mode ?? 'oscillate') === 'once' && v >= s.max) v = s.min;
  cur.set(o.id, v);
  if ((s.mode ?? 'oscillate') !== 'oscillate' || !dirs.has(o.id)) dirs.set(o.id, 1);
}

function tick(now: number) {
  const st = useStore.getState();
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  // a drag during the animation commits the live snapshot; keep one open until the animation stops
  beginLive();
  const patches: Record<string, Partial<MObj>> = {};
  const finished: string[] = [];
  for (const id of st.playing) {
    const o = st.objects.find((x) => x.id === id);
    if (!o?.slider) { finished.push(id); continue; }
    const s = o.slider;
    let v = cur.get(id);
    // the user moved the slider by hand: continue from there
    if (v === undefined || Math.abs(shown(v, s) - sliderValue(o)) > s.step / 2) { start(o); v = cur.get(id)!; }
    const r = advance(v, dirs.get(id) ?? 1, s, dt);
    cur.set(id, r.value);
    dirs.set(id, r.dir);
    const next = shown(r.value, s);
    if (next !== sliderValue(o)) patches[id] = { input: `${splitDefinition(o.input).name ?? o.name} = ${next}` };
    if (r.done) finished.push(id);
  }
  if (Object.keys(patches).length) st.liveUpdateMany(patches);
  if (finished.length) st.setPlaying(useStore.getState().playing.filter((id) => !finished.includes(id)));
  raf = useStore.getState().playing.length ? requestAnimationFrame(tick) : 0;
}

/** Runs every playing slider from one requestAnimationFrame loop. */
export function startAnimator() {
  useStore.subscribe((s, prev) => {
    if (s.playing === prev.playing) return;
    for (const id of s.playing) {
      const o = s.objects.find((x) => x.id === id);
      if (o?.slider && !prev.playing.includes(id)) start(o);
    }
    if (s.playing.length && !raf) { last = 0; raf = requestAnimationFrame(tick); }
  });
}

/** Seconds of one full cycle of everything that is playing (the longest one), or null if nothing plays. */
export function playingCycle(): number | null {
  const st = useStore.getState();
  let T = 0;
  for (const id of st.playing) {
    const o = st.objects.find((x) => x.id === id);
    if (o?.slider) T = Math.max(T, cycleSeconds(cur.get(id) ?? sliderValue(o), o.slider));
  }
  return T || null;
}

/** Appends the current position of every traced point to its trace. */
export function useTraceRecorder(items: Resolved[]) {
  useEffect(() => {
    const st = useStore.getState();
    const add: Record<string, Vec3> = {};
    for (const r of items) {
      if (!r.obj.trace || !r.value) continue;
      const p = r.value.type === 'point' ? { ...r.value.p, z: 0 } : r.value.type === 'point3d' ? r.value.p : null;
      if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) continue;
      const tr = st.traces[r.obj.id];
      const lastP = tr?.[tr.length - 1];
      if (!lastP || lastP.x !== p.x || lastP.y !== p.y || lastP.z !== p.z) add[r.obj.id] = p;
    }
    if (Object.keys(add).length) st.addTracePoints(add);
  }, [items]);
}
