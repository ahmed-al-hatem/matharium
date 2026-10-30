import { describe, expect, it } from 'vitest';
import { placeMenu } from './ContextMenu';

describe('placeMenu', () => {
  const W = 1000, H = 700;
  it('opens towards the reading direction', () => {
    expect(placeMenu(300, 200, 240, 300, W, H, false)).toEqual({ left: 300, top: 200 });
    expect(placeMenu(300, 200, 240, 300, W, H, true)).toEqual({ left: 60, top: 200 });
  });
  it('flips at the screen edges and stays inside', () => {
    expect(placeMenu(900, 600, 240, 300, W, H, false)).toEqual({ left: 660, top: 300 });
    expect(placeMenu(100, 200, 240, 300, W, H, true)).toEqual({ left: 100, top: 200 });
    expect(placeMenu(20, 650, 240, 900, W, H, true).top).toBe(8);
  });
  it('puts a submenu beside its row, on the other side when there is no room', () => {
    expect(placeMenu(500, 100, 200, 150, W, H, false, 260)).toEqual({ left: 500, top: 100 });
    expect(placeMenu(900, 100, 200, 150, W, H, false, 660)).toEqual({ left: 460, top: 100 });
    expect(placeMenu(150, 100, 200, 150, W, H, true, 390)).toEqual({ left: 390, top: 100 });
    expect(placeMenu(500, 650, 200, 150, W, H, false, 260, false).top).toBe(542);
  });
});
