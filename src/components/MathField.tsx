import { useEffect, useRef } from 'react';
import { useStore } from '../store/project';

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
}

export function MathField({ value, onChange, onSubmit, onCancel, onBlur, placeholder, autoFocus, className = 'math-input', ariaLabel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange, onSubmit });
  latest.current = { value, onChange, onSubmit };

  const api = useRef<InputTarget>({
    insert(text, back = 0) {
      const el = ref.current!;
      const v = latest.current.value;
      const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
      latest.current.onChange(v.slice(0, s) + text + v.slice(e));
      const pos = s + text.length - back;
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
    },
    backspace() {
      const el = ref.current!;
      const v = latest.current.value;
      const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
      const from = s === e ? Math.max(0, s - 1) : s;
      latest.current.onChange(v.slice(0, from) + v.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, from); });
    },
    move(d) {
      const el = ref.current!;
      const p = Math.max(0, Math.min(latest.current.value.length, (el.selectionStart ?? 0) + d));
      el.focus();
      el.setSelectionRange(p, p);
    },
    enter() { latest.current.onSubmit(latest.current.value); },
  });

  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); setTarget(api.current); }
  }, [autoFocus]);
  useEffect(() => () => { if (target === api.current) setTarget(null); }, []);

  return (
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
      inputMode={matchMedia('(pointer: coarse)').matches ? 'none' : undefined}
      onFocus={() => {
        setTarget(api.current);
        if (matchMedia('(pointer: coarse)').matches) useStore.getState().setKeyboard(true);
      }}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); }
        else if (e.key === 'Escape') onCancel?.();
      }}
    />
  );
}
