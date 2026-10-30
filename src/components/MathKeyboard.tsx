import { useState } from 'react';
import { useStore } from '../store/project';
import { useT } from '../i18n/i18n';
import { getTarget } from './MathField';
import { Icon } from './Icons';

interface Key { label: string; ins?: string; back?: number; cls?: string; act?: 'bs' | 'left' | 'right' | 'enter'; span?: number }

const k = (label: string, ins = label, cls = '', back = 0): Key => ({ label, ins, cls, back });
const fn = (name: string, label = name): Key => ({ label, ins: `${name}()`, back: 1, cls: 'fn' });
const cmd = (name: string): Key => ({ label: name, ins: `${name}()`, back: 1, cls: 'fn', span: 1 });
const CTRL: Key[] = [
  { label: '⌫', act: 'bs', cls: 'ctrl' }, { label: '←', act: 'left', cls: 'ctrl' },
  { label: '→', act: 'right', cls: 'ctrl' }, { label: '↵', act: 'enter', cls: 'ctrl enter' },
];

const NUMPAD: Key[] = [
  k('7'), k('8'), k('9'), k('×', '*', 'op'), k('÷', '/', 'op'),
  k('4'), k('5'), k('6'), k('+', '+', 'op'), k('−', '-', 'op'),
  k('1'), k('2'), k('3'), k('=', '=', 'op'), CTRL[0],
  k('0'), k('.'), CTRL[1], CTRL[2], CTRL[3],
];

function layout(tab: string, is3d: boolean): Key[][] {
  switch (tab) {
    case '123': return [[
      k('x', 'x', 'it'), k('y', 'y', 'it'), is3d ? k('z', 'z', 'it') : k('π', 'π'), is3d ? k('π', 'π') : k('e', 'e', 'it'),
      { label: 'x²', ins: '^2', cls: 'it' }, { label: 'xⁿ', ins: '^', cls: 'it' }, fn('sqrt', '√'), fn('abs', '|x|'),
      k('<', '<', 'op'), k('>', '>', 'op'), { label: 'a⁄b', ins: '()/()', back: 4 }, k('°', '°'),
      k('t', 't', 'it'), k(',', ','), k('(', '('), k(')', ')'),
    ], NUMPAD];
    case 'fx': return [[
      fn('sin'), fn('cos'), fn('tan'), fn('ln'),
      fn('asin', 'sin⁻¹'), fn('acos', 'cos⁻¹'), fn('atan', 'tan⁻¹'), fn('log10', 'log'),
      fn('sinh'), fn('cosh'), fn('tanh'), fn('exp', 'eˣ'),
      fn('floor', '⌊x⌋'), fn('ceil', '⌈x⌉'), k('!', '!'), { label: "f′", ins: "'", cls: 'it' },
    ], [
      cmd('Solve'), cmd('Roots'), cmd('Intersect'),
      cmd('Derivative'), cmd('Integral'), cmd('Extremum'),
      cmd('Tangent'), cmd('Curve'), cmd('Simplify'),
      cmd('Factor'), cmd('Expand'), cmd('Angle'),
      cmd('Segment'), cmd('Circle'), cmd('Polygon'),
    ], CTRL];
    case 'abc': {
      const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
      return [[...rows.join('').split('').map((c) => k(c, c, 'it')), k('_', '_'), k(':', ':'), k('θ', 'θ')], CTRL];
    }
    default: return [[
      k('≤', '<='), k('≥', '>='), k('≠', '!='), k('{', '{'), k('}', '}'),
      k('[', '['), k(']', ']'), k(';', ';'), k('%', '%'), k('∞', '∞'),
      k('and', ' and ', 'fn'), k('or', ' or ', 'fn'), k('not', 'not ', 'fn'), k('?', '?'), k(':', ':'),
      k('φ', 'phi'), k('τ', 'tau'), k('i', 'i', 'it'), k('"', '"'), k("'", "'"),
    ], CTRL];
  }
}

export function MathKeyboard() {
  const t = useT();
  const [tab, setTab] = useState('123');
  const is3d = useStore((s) => s.mode === '3d');
  const close = () => useStore.getState().setKeyboard(false);

  const press = (key: Key) => {
    const tg = getTarget();
    if (!tg) return;
    if (key.act === 'bs') tg.backspace();
    else if (key.act === 'left') tg.move(-1);
    else if (key.act === 'right') tg.move(1);
    else if (key.act === 'enter') tg.enter();
    else if (key.ins) tg.insert(key.ins, key.back);
  };

  const blocks = layout(tab, is3d);
  const cols = (i: number) => (tab === 'abc' && i === 0 ? 10 : tab === 'fx' && i === 1 ? 3 : tab === 'sym' && i === 0 ? 5 : i === blocks.length - 1 && blocks.length > 1 && blocks[i] === CTRL ? 1 : i === 0 ? 4 : 5);

  return (
    <div className="keyboard" role="group" aria-label={t('keyboard')}>
      <div className="kb-tabs">
        {(['123', 'fx', 'abc', 'sym'] as const).map((id) => (
          <button key={id} className={tab === id ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(id)}>{t(`kb.${id}`)}</button>
        ))}
      </div>
      <button className="icon-btn kb-close" onMouseDown={(e) => e.preventDefault()} onClick={close} aria-label={t('close')}><Icon.close /></button>
      <div className="kb-body">
        {blocks.map((keys, i) => (
          <div key={i} className="kb-grid" style={{ ['--cols' as string]: cols(i) }}>
            {keys.map((key, j) => (
              <button key={j} className={`key ${key.cls ?? ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => press(key)} aria-label={key.label}>
                {key.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
