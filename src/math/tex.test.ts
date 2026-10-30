import { describe, expect, it } from 'vitest';
import { evaluateAll } from './engine';
import { parseExpr, texName, toTex } from './compile';

describe('LaTeX names', () => {
  it('formats object names consistently', () => {
    expect(['A', 'D', 'P1', 'a_1', 'eq1', 'f_d'].map(texName)).toEqual(['A', 'D', 'P_{1}', 'a_{1}', '\\mathit{eq1}', 'f_{d}']);
  });
  it('does not render single capitals as units', () => {
    expect(toTex(parseExpr('A + B + D'))).toBe('A+B+D');
    expect(toTex(parseExpr('2 pi'))).toContain('\\pi');
  });
  it('uses the formatter in algebra rows', () => {
    const mk = (input: string, name: string) => ({ id: name, name, input, color: '', visible: true });
    const r = evaluateAll([mk('(0,0)', 'P1'), mk('(1,0)', 'B'), mk('(0,1)', 'C'), mk('Polygon(P1, B, C)', 'eq1')]);
    expect(r[0].tex).toBe('P_{1} = \\left(0, 0\\right)');
    expect(r[3].tex).toBe('\\mathit{eq1} = \\mathrm{Polygon}\\left(P_{1}, B, C\\right)');
  });
});
