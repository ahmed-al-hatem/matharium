import { describe, expect, it } from 'vitest';
import { binomialPmf, fiveNumber, histogram, mean, median, normalCdf, normalPdf, sd } from './stats';
import { evaluateAll } from './engine';
import type { MObj } from './types';

let id = 0;
const o = (input: string, name = `o${id}`): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
const data = [2, 4, 4, 4, 5, 5, 7, 9];

describe('descriptive statistics', () => {
  it('mean, median, population SD', () => {
    expect(mean(data)).toBe(5);
    expect(median(data)).toBe(4.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(sd(data)).toBe(2);
    expect(() => mean([])).toThrow();
  });
  it('five-number summary uses the halves', () => {
    expect(fiveNumber([1, 3, 4, 6, 9, 12])).toEqual([1, 3, 5, 9, 12]);
    expect(fiveNumber([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 4, 6, 7]);
    expect(fiveNumber([5])).toEqual([5, 5, 5, 5, 5]);
  });
  it('histogram bins start at a multiple of the width', () => {
    const h = histogram([1, 2, 2, 3, 3, 3, 4], 1);
    expect(h.map((b) => [b.x0, b.h])).toEqual([[1, 1], [2, 2], [3, 3], [4, 1]]);
    expect(histogram([0.5, 1.5, 2.49], 2).map((b) => b.h)).toEqual([2, 1]);
    expect(() => histogram([1], 0)).toThrow();
  });
});

describe('distributions', () => {
  it('normal density and CDF', () => {
    expect(normalPdf(0, 1)(0)).toBeCloseTo(0.3989423, 7);
    expect(normalCdf(0, 1, 0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(0, 1, 1) - normalCdf(0, 1, -1)).toBeCloseTo(0.6826895, 6);
    expect(normalCdf(100, 15, 130)).toBeCloseTo(0.9772499, 6);
  });
  it('binomial pmf sums to 1 and matches known values', () => {
    const p = binomialPmf(10, 0.5);
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
    expect(p[5]).toBeCloseTo(252 / 1024, 12);
    expect(binomialPmf(2000, 0.3).reduce((a, b) => a + b)).toBeCloseTo(1, 9);
    expect(binomialPmf(3, 0)).toEqual([1, 0, 0, 0]);
    expect(() => binomialPmf(2.5, 0.5)).toThrow();
  });
});

describe('statistics commands', () => {
  it('work on list literals, list objects and spreadsheet ranges', () => {
    const sheet = { A1: '2', A2: '4', A3: '=A1+A2', A4: 'text', B1: '100' };
    const r = evaluateAll([o('l = {2, 4, 4, 4, 5, 5, 7, 9}', 'l'), o('Mean(l)', 'a'), o('SD(l)', 'b'), o('Median(A1:A4)', 'c'), o('Mean(1, 2, 6)', 'd')], 4, sheet);
    expect(r[0].value).toEqual({ type: 'numbers', values: data });
    expect(r.slice(1).map((x) => x.display)).toEqual(['= 5', '= 2', '= 4', '= 3']);
    expect(evaluateAll([o('Mean(C1:C3)')], 4, sheet)[0].error).toMatch(/No numbers/);
  });
  it('Histogram, BoxPlot', () => {
    const r = evaluateAll([o('Histogram({1, 2, 2, 3, 3, 3, 4}, 1)'), o('BoxPlot({1, 3, 4, 6, 9, 12}, 2)')]);
    expect(r[0].value).toMatchObject({ type: 'bars' });
    expect(r[1].value).toEqual({ type: 'boxplot', s: [1, 3, 5, 9, 12], y: 2 });
  });
  it('Normal and Binomial probabilities', () => {
    const r = evaluateAll([o('Normal(0, 1)', 'f'), o('Normal(0, 1, -1, 1)', 'a'), o('Normal(0, 1, 0)', 'b'), o('Binomial(10, 0.5, 3, 6)', 'c'), o('Normal(0, -1)', 'g')]);
    expect(r[0].value?.type).toBe('function');
    expect(r[1].value).toMatchObject({ type: 'integral', a: -1, b: 1 });
    expect(r[1].display).toBe('P(−1 ≤ X ≤ 1) = 0.6827');
    expect(r[2].display).toBe('P(X ≤ 0) = 0.5');
    expect((r[3].value as { value: number }).value).toBeCloseTo(792 / 1024, 12);
    expect((r[3].value as { bars: { hi?: boolean }[] }).bars.filter((b) => b.hi)).toHaveLength(4);
    expect(r[4].error).toMatch(/σ/);
  });
});
