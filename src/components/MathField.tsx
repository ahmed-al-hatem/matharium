import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/project';
import { useT } from '../i18n/i18n';
import { nextPlaceholder, suggest, type Suggestion } from '../math/commands';

/** The input the on-screen keyboard currently types into. */
export interface InputTarget {
  insert(text: string, back?: number): void;
  backspace(): void;
  move(d: -1 | 1): void;
  enter(): void;
}

let target: InputTarget | null = null;
export const getTarget = () => target;
export const setTarget = (t: InputTarget | null) => { target = t; };

interface Props {
  value: string;
  onChange(v: string): void;
  onSubmit(v: string): void;
  onCancel?(): void;
  onBlur?(): void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Suggest commands (with their signatures) and object names while typing. */
  complete?: boolean;
}

/** The identifier that ends at the caret (and does not continue after it). */
function wordAt(value: string, caret: number) {
  if (/^\w/.test(value.slice(caret))) return '';
  return /[A-Za-z][A-Za-z0-9_]*$/.exec(value.slice(0, caret))?.[0] ?? '';
}

let listSeq = 0;

export function MathField({ value, onChange, onSubmit, onCancel, onBlur, placeholder, autoFocus, className = 'math-input', ariaLabel, complete }: Props) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange, onSubmit });
  latest.current = { value, onChange, onSubmit };
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const listId = useMemo(() => `ac-list-${++listSeq}`, []);
  const lang = useStore((s) => s.settings.lang);
  const objects = useStore((s) => (complete ? s.objects : null));

  const word = complete ? wordAt(value, caret) : '';
  const items = useMemo(() => (word && objects ? suggest(word, objects, lang) : []), [word, objects, lang]);
  const open = focused && !dismissed && items.length > 0;

  useEffect(() => { setActive(0); setDismissed(false); }, [word]);

  useLayoutEffect(() => {
    if (!open) return;
    const r = ref.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    // keep the list inside the viewport (on phones the input is nearly full width)
    const width = Math.min(Math.max(260, r.width), document.documentElement.clientWidth - 16);
    const left = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - width - 8));
    setPos(below > 260 || below > r.top
      ? { left, top: r.bottom + 4, width }
      : { left, bottom: window.innerHeight - r.top + 4, width });
  }, [open, items.length]);

  // selection to apply once an accepted suggestion has reached the input
  const pendingSel = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const sel = pendingSel.current, el = ref.current;
    if (!sel || !el || el.value !== value) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
    setCaret(sel[1]);
  }, [value]);

  const accept = (s: Suggestion) => {
    const start = caret - word.length;
    pendingSel.current = [start + s.select[0], start + s.select[1]];
    setDismissed(true);
    latest.current.onChange(value.slice(0, start) + s.insert + value.slice(caret));
  };

  const api = useRef<InputTarget>({
    insert(text, back = 0) {
      const el = ref.current!;
      const v = latest.current.value;
      const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
      latest.current.onChange(v.slice(0, s) + text + v.slice(e));
      const p = s + text.length - back;
      setCaret(p);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(p, p); });
    },
    backspace() {
      const el = ref.current!;
      const v = latest.current.value;
      const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
      const from = s === e ? Math.max(0, s - 1) : s;
      latest.current.onChange(v.slice(0, from) + v.slice(e));
      setCaret(from);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, from); });
    },
    move(d) {
      const el = ref.current!;
      const p = Math.max(0, Math.min(latest.current.value.length, (el.selectionStart ?? 0) + d));
      el.focus();
      el.setSelectionRange(p, p);
      setCaret(p);
    },
    enter() { latest.current.onSubmit(latest.current.value); },
  });

  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); setTarget(api.current); }
  }, [autoFocus]);
  useEffect(() => () => { if (target === api.current) setTarget(null); }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); accept(items[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return; }
    }
    if (e.key === 'Tab' && complete && !e.shiftKey) {
      // jump to the next <argument> placeholder of an inserted template
      const el = e.currentTarget;
      const r = nextPlaceholder(value, el.selectionEnd ?? 0);
      if (r) { e.preventDefault(); el.setSelectionRange(r[0], r[1]); setCaret(r[1]); }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); }
    else if (e.key === 'Escape') onCancel?.();
  };

  return (
    <>
      <input
        ref={ref}
        className={className}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        dir="ltr"
        role={complete ? 'combobox' : undefined}
        aria-expanded={complete ? open : undefined}
        aria-controls={complete ? listId : undefined}
        aria-autocomplete={complete ? 'list' : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        inputMode={matchMedia('(pointer: coarse)').matches ? 'none' : undefined}
        onFocus={() => {
          setFocused(true);
          setTarget(api.current);
          if (matchMedia('(pointer: coarse)').matches) useStore.getState().setKeyboard(true);
        }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onChange={(e) => { setCaret(e.target.selectionStart ?? e.target.value.length); onChange(e.target.value); }}
        onSelect={(e) => setCaret(e.currentTarget.selectionEnd ?? 0)}
        onKeyDown={onKeyDown}
      />
      {open && pos && createPortal(
        <div className="ac-list" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}>
          <ul id={listId} role="listbox" aria-label={t('ac.commands')}>
            {items.map((s, i) => (
              <li key={`${s.kind}:${s.label}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onPointerDown={(e) => { e.preventDefault(); accept(s); }}
                onPointerEnter={() => setActive(i)}>
                <code dir="ltr">{s.label}</code>
                {s.kind === 'object' && <span className="muted" dir="ltr">{s.detail}</span>}
              </li>
            ))}
          </ul>
          <div className="ac-hint">{t('ac.hint')}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
