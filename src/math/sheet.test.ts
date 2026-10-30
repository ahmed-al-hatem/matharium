import { describe, expect, it } from 'vitest';
import { cellRange, evalSheet, shiftSheet } from './sheet';

describe('sheet rows and columns', () => {
  const sheet = { A1: '1', A2: '2', A3: '=A1+A2', B1: '=sum(A1:A3)', L1: 'last' };

  it('inserts a row and moves cells and references below it', () => {
    const out = shiftSheet(sheet, 'row', 2, 1);
    expect(out).toEqual({ A1: '1', A3: '2', A4: '=A1+A3', B1: '=sum(A1:A4)', L1: 'last' });
    expect(evalSheet(out, {}).A4.v).toBe(3);
  });

  it('deletes a row and marks references to it', () => {
    const out = shiftSheet(sheet, 'row', 1, -1);
    expect(out).toEqual({ A1: '2', A2: '=#REF+A1' });
    expect(evalSheet(out, {}).A2.err).toBe(true);
  });

  it('inserts and deletes columns, dropping cells pushed past the last column', () => {
    const ins = shiftSheet(sheet, 'col', 0, 1);
    expect(ins).toEqual({ B1: '1', B2: '2', B3: '=B1+B2', C1: '=sum(B1:B3)' });
    expect(shiftSheet(ins, 'col', 0, -1)).toEqual({ A1: '1', A2: '2', A3: '=A1+A2', B1: '=sum(A1:A3)' });
  });

  it('spans a range in either direction', () => {
    expect(cellRange('B3', 'A2')).toEqual([['A2', 'B2'], ['A3', 'B3']]);
  });
});
