import { describe, expect, it } from 'vitest';
import { advance, cycleSeconds, SWEEP_S } from './animate';
import { useStore } from './project';

const S = { min: 0, max: 10, step: 0.1 };

describe('advance', () => {
  it('moves span/SWEEP_S per second at ×1 and twice that at ×2', () => {
    expect(advance(0, 1, S, 1).value).toBeCloseTo(10 / SWEEP_S);
    expect(advance(0, 1, { ...S, speed: 2 }, 1).value).toBeCloseTo(20 / SWEEP_S);
    expect(advance(0, 1, { ...S, speed: 0.25 }, 1).value).toBeCloseTo(2.5 / SWEEP_S);
  });
  it('oscillates between min and max', () => {
    const r = advance(9, 1, S, 1); // 9 + 2.5 → reflects to 8.5
    expect(r.value).toBeCloseTo(8.5);
    expect(r.dir).toBe(-1);
    const back = advance(1, -1, S, 1);
    expect(back.value).toBeCloseTo(1.5);
    expect(back.dir).toBe(1);
  });
  it('increasing mode wraps around to min', () => {
    const r = advance(9, 1, { ...S, mode: 'increase' }, 1);
    expect(r.value).toBeCloseTo(1.5);
    expect(r.done).toBe(false);
  });
  it('once mode stops at max', () => {
    expect(advance(5, 1, { ...S, mode: 'once' }, 1)).toEqual({ value: 7.5, dir: 1, done: false });
    expect(advance(9, 1, { ...S, mode: 'once' }, 1)).toEqual({ value: 10, dir: 1, done: true });
  });
  it('one cycle length per mode', () => {
    expect(cycleSeconds(0, S)).toBe(2 * SWEEP_S);
    expect(cycleSeconds(0, { ...S, speed: 2, mode: 'increase' })).toBe(SWEEP_S / 2);
    expect(cycleSeconds(5, { ...S, mode: 'once' })).toBe(SWEEP_S / 2);
  });
});

describe('playing sliders', () => {
  it('the whole animation is one undo step', () => {
    const st = useStore.getState();
    st.reset();
    st.addObject('a = 1', { slider: { min: -5, max: 5, step: 0.1 } });
    const id = useStore.getState().objects[0].id;
    const before = useStore.getState().past.length;
    st.setPlaying([id]);
    for (let i = 2; i < 6; i++) useStore.getState().liveUpdateMany({ [id]: { input: `a = ${i}` } });
    expect(useStore.getState().past.length).toBe(before);
    st.stopAll();
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect(useStore.getState().objects[0].input).toBe('a = 1');
  });
  it('only sliders can play, and switching mode stops them', () => {
    const st = useStore.getState();
    st.reset();
    st.addObject('a = 1', { slider: { min: -5, max: 5, step: 0.1 } });
    st.addObject('f(x) = a x');
    st.playAll();
    expect(useStore.getState().playing).toHaveLength(1);
    st.setMode('3d');
    expect(useStore.getState().playing).toEqual([]);
    st.setMode('graphing');
  });
});
