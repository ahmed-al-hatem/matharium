import { useRef, useState } from 'react';
import { useStore } from '../store/project';
import { useT } from '../i18n/i18n';
import { getTarget } from './MathField';
import { Icon } from './Icons';

type Act = 'bs' | 'left' | 'right' | 'enter' | 'space' | 'shift';
interface Key { label: string; ins?: string; back?: number; cls?: string; act?: Act; span?: number; aria?: string }
/** An empty cell, used to offset the middle letter row like a phone keyboard. */
interface Gap { gap: number }
type Cell = Key | Gap;
interface Block { cols: number; half?: boolean; full?: boolean; cells: Cell[] }

const k = (label: string, ins = label, cls = '', back = 0): Key => ({ label, ins, cls, back });
const fn = (name: string, label = name): Key => ({ label, ins: `${name}()`, back: 1, cls: 'fn' });
const cmd = (name: string): Key => ({ label: name, ins: `${name}()`, back: 1, cls: 'fn' });
const BS: Key = { label: '⌫', act: 'bs', cls: 'ctrl', aria: 'kb.backspace' };
const ENTER: Key = { label: '↵', act: 'enter', cls: 'ctrl enter', aria: 'kb.enter' };
const LEFT: Key = { label: '←', act: 'left', cls: 'ctrl', aria: 'kb.left' };
const RIGHT: Key = { label: '→', act: 'right', cls: 'ctrl', aria: 'kb.right' };
const space = (span = 1): Key => ({ label: '␣', act: 'space', cls: 'ctrl space', span, aria: 'kb.space' });

const NUMPAD: Key[] = [
  k('7'), k('8'), k('9'), k('×', '*', 'op'), k('÷', '/', 'op'),
  k('4'), k('5'), k('6'), k('+', '+', 'op'), k('−', '-', 'op'),
  k('1'), k('2'), k('3'), k('=', '=', 'op'), BS,
  k('0'), k('.'), LEFT, RIGHT, ENTER,
];

function layout(tab: string, is3d: boolean, upper: boolean): Block[] {
  switch (tab) {
    case '123': return [{
      cols: 4,
      cells: [
        k('x', 'x', 'it'), k('y', 'y', 'it'), is3d ? k('z', 'z', 'it') : k('π', 'π'), is3d ? k('π', 'π') : k('e', 'e', 'it'),
        { label: 'x²', ins: '^2', cls: 'it' }, { label: 'xⁿ', ins: '^', cls: 'it' }, fn('sqrt', '√'), fn('abs', '|x|'),
        k('<', '<', 'op'), k('>', '>', 'op'), { label: 'a⁄b', ins: '()/()', back: 4 }, k('°', '°'),
        k('t', 't', 'it'), k(',', ','), k('(', '('), k(')', ')'),
      ],
    }, { cols: 5, cells: NUMPAD }, { cols: 1, full: true, cells: [space()] }];
    case 'fx': return [{
      cols: 4,
      cells: [
        fn('sin'), fn('cos'), fn('tan'), fn('ln'),
        fn('asin', 'sin⁻¹'), fn('acos', 'cos⁻¹'), fn('atan', 'tan⁻¹'), fn('log10', 'log'),
        fn('sinh'), fn('cosh'), fn('tanh'), fn('exp', 'eˣ'),
        fn('floor', '⌊x⌋'), fn('ceil', '⌈x⌉'), k('!', '!'), { label: 'f′', ins: "'", cls: 'it' },
      ],
    }, {
      cols: 3,
      cells: [
        cmd('Solve'), cmd('Roots'), cmd('Intersect'),
        cmd('Derivative'), cmd('Integral'), cmd('Extremum'),
        cmd('Tangent'), cmd('Curve'), cmd('Simplify'),
        cmd('Factor'), cmd('Expand'), cmd('Angle'),
        cmd('Segment'), cmd('Circle'), cmd('Polygon'),
        BS, space(), ENTER,
      ],
    }];
    case 'abc': {
      // phone-style layout on a grid of half-key columns: a normal key spans 2
      const letter = (c: string): Key => { const ch = upper ? c.toUpperCase() : c; return { label: ch, ins: ch, cls: 'it', span: 2 }; };
      const shift: Key = { label: '⇧', act: 'shift', cls: `ctrl shift${upper ? ' on' : ''}`, span: 3, aria: 'kb.shift' };
      return [{
        cols: 20,
        half: true,
        cells: [
          ...'qwertyuiop'.split('').map(letter),
          { gap: 1 }, ...'asdfghjkl'.split('').map(letter), { gap: 1 },
          shift, ...'zxcvbnm'.split('').map(letter), { ...BS, span: 3 },
          { ...k('θ', 'θ'), span: 2 }, { ...k('_', '_'), span: 2 }, space(12), { ...k(':', ':'), span: 2 }, { ...ENTER, span: 2 },
        ],
      }];
    }
    default: return [{
      cols: 5,
      cells: [
        k('≤', '<='), k('≥', '>='), k('≠', '!='), k('{', '{'), k('}', '}'),
        k('[', '['), k(']', ']'), k(';', ';'), k('%', '%'), k('∞', '∞'),
        k('and', ' and ', 'fn'), k('or', ' or ', 'fn'), k('not', 'not ', 'fn'), k('?', '?'), k(':', ':'),
        k('φ', 'phi'), k('τ', 'tau'), k('i', 'i', 'it'), k('"', '"'), k("'", "'"),
        space(3), BS, ENTER,
      ],
    }];
  }
}

export function MathKeyboard() {
  const t = useT();
  const [tab, setTab] = useState('123');
  // shift: one letter, or caps lock after a double tap (like phone keyboards)
  const [shift, setShift] = useState<'off' | 'once' | 'lock'>('off');
  const lastShift = useRef(0);
  const is3d = useStore((s) => s.mode === '3d');
  const close = () => useStore.getState().setKeyboard(false);

  const pressShift = () => {
    const now = Date.now();
    if (shift === 'once' && now - lastShift.current < 350) setShift('lock');
    else setShift(shift === 'off' ? 'once' : 'off');
    lastShift.current = now;
  };

  const press = (key: Key) => {
    if (key.act === 'shift') { pressShift(); return; }
    const tg = getTarget();
    if (!tg) return;
    if (key.act === 'bs') tg.backspace();
    else if (key.act === 'left') tg.move(-1);
    else if (key.act === 'right') tg.move(1);
    else if (key.act === 'enter') tg.enter();
    else if (key.act === 'space') tg.insert(' ');
    else if (key.ins) {
      tg.insert(key.ins, key.back);
      if (tab === 'abc' && shift === 'once') setShift('off');
    }
  };

  const blocks = layout(tab, is3d, shift !== 'off');

  return (
    <div className="keyboard" role="group" aria-label={t('keyboard')}>
      <div className="kb-tabs">
        {(['123', 'fx', 'abc', 'sym'] as const).map((id) => (
          <button key={id} className={tab === id ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(id)}>{t(`kb.${id}`)}</button>
        ))}
      </div>
      <button className="icon-btn kb-close" onMouseDown={(e) => e.preventDefault()} onClick={close} aria-label={t('close')}><Icon.close /></button>
      <div className={`kb-body kb-${tab}`}>
        {blocks.map((b, i) => (
          <div key={i} className={`kb-grid${b.half ? ' half' : ''}${b.full ? ' full' : ''}`} style={{ ['--cols' as string]: b.cols }}>
            {b.cells.map((c, j) => ('gap' in c ? (
              <span key={j} aria-hidden="true" style={{ gridColumn: `span ${c.gap}` }} />
            ) : (
              <button
                key={j}
                className={`key ${c.cls ?? ''}${c.act === 'shift' && shift === 'lock' ? ' lock' : ''}`}
                style={c.span && c.span > 1 ? { gridColumn: `span ${c.span}` } : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => press(c)}
                aria-label={c.aria ? t(c.aria) : c.label}
                aria-pressed={c.act === 'shift' ? shift !== 'off' : undefined}
              >
                {c.label}
              </button>
            )))}
          </div>
        ))}
      </div>
    </div>
  );
}
