import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import type { Resolved } from '../math/types';
import { Icon } from './Icons';

type Ic = () => JSX.Element;
export interface IconOption { id: string; label: string; icon?: Ic; color?: string; selected: boolean }
export type MenuEntry =
  | { kind: 'item'; label: string; icon?: Ic; onSelect(): void; danger?: boolean; disabled?: boolean }
  /** check boxes and icon rows leave the menu open so the change can be seen and repeated */
  | { kind: 'check'; label: string; icon?: Ic; checked: boolean; onToggle(): void }
  | { kind: 'icons'; label: string; options: IconOption[]; onPick(id: string): void }
  | { kind: 'submenu'; label: string; icon?: Ic; items: MenuEntry[] }
  | { kind: 'header'; title: string; subtitle?: string }
  | { kind: 'sep' }
  /** free content (form fields); arrow keys skip it */
  | { kind: 'custom'; render(): ReactNode };

/** Builds the entries from the current state each render, so check marks follow changes made while the menu is open. */
export type MenuBuilder = (ctx: { items: Resolved[] }) => MenuEntry[];
export type Via = 'mouse' | 'touch' | 'key';
interface OpenMenu { x: number; y: number; via: Via; label: string; build: MenuBuilder; returnFocus: HTMLElement | null; at: number }

const useMenu = create<{ menu: OpenMenu | null }>(() => ({ menu: null }));
let last: { via: Via; at: number } = { via: 'mouse', at: 0 };

export function openMenu(req: { x: number; y: number; via: Via; label: string; build: MenuBuilder; returnFocus?: HTMLElement | null }) {
  const now = performance.now();
  // Shift+F10 and the Menu key, and a long press on Android, also send a contextmenu event: keep the first menu
  if (req.via === 'mouse' && last.via !== 'mouse' && now - last.at < 700) return;
  last = { via: req.via, at: now };
  useMenu.setState({ menu: { ...req, returnFocus: req.returnFocus ?? (document.activeElement as HTMLElement | null), at: now } });
}

export function closeMenu(restoreFocus = false) {
  const m = useMenu.getState().menu;
  if (!m) return;
  useMenu.setState({ menu: null });
  if (restoreFocus && m.returnFocus?.isConnected) m.returnFocus.focus();
}

export const isMenuOpen = () => !!useMenu.getState().menu;

const MARGIN = 8;
/**
 * Top-left corner for a menu of size w×h opened at (x, y): it grows towards the reading direction (right in LTR, left in RTL),
 * flips to the other side of `x2` (a submenu's parent row edge; the click point otherwise) when it would leave the screen,
 * and grows upwards from y when there is no room below (or slides up when `flipUp` is false).
 */
export function placeMenu(x: number, y: number, w: number, h: number, vw: number, vh: number, rtl: boolean, x2 = x, flipUp = true) {
  let left = rtl ? x - w : x;
  if (!rtl && left + w > vw - MARGIN) left = x2 - w;
  if (rtl && left < MARGIN) left = x2;
  left = Math.max(MARGIN, Math.min(left, vw - MARGIN - w));
  let top = y;
  if (top + h > vh - MARGIN) top = flipUp && y - h >= MARGIN ? y - h : vh - MARGIN - h;
  top = Math.max(MARGIN, top);
  return { left, top };
}

/** The finger that held a long press lifts with a click; keep it from also activating what is under it. */
function swallowClick() {
  const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
  addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', stop, { capture: true }), 800);
}

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');
const LONG_PRESS_MS = 500, LONG_PRESS_SLOP = 8;

/**
 * Handlers that call `onOpen` on a right click, a long press (touch or pen) and the Menu key or Shift+F10.
 * Events from text fields are left alone so they keep the browser's own menu.
 */
export function useContextTrigger(onOpen: (x: number, y: number, via: Via, target: EventTarget | null) => void) {
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const cancel = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  useEffect(() => cancel, []);
  return {
    onContextMenu(e: React.MouseEvent) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      onOpen(e.clientX, e.clientY, 'mouse', e.target);
    },
    onPointerDown(e: React.PointerEvent) {
      const second = !!press.current; // a second finger is a pinch, not a long press
      cancel();
      if (second || e.pointerType === 'mouse' || isEditable(e.target)) return;
      const { clientX: x, clientY: y, pointerId: id, target } = e;
      press.current = { id, x, y, timer: window.setTimeout(() => { press.current = null; swallowClick(); onOpen(x, y, 'touch', target); }, LONG_PRESS_MS) };
    },
    onPointerMove(e: React.PointerEvent) {
      const p = press.current;
      if (p && (p.id !== e.pointerId || Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onKeyDown(e: React.KeyboardEvent) {
      if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) || isEditable(e.target)) return;
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onOpen(r.left + r.width / 2, r.top + r.height / 2, 'key', e.target);
    },
  };
}

const FOCUSABLE = '[role=menuitem]:not([aria-disabled=true]), [role=menuitemcheckbox], [role=menuitemradio]';

/** Arrow-key movement inside one menu level: ↑/↓ between rows, ←/→ inside an icon row, Home/End. */
function moveFocus(menu: HTMLElement, key: string, rtl: boolean): boolean {
  const all = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (!all.length) return false;
  const cur = all.indexOf(document.activeElement as HTMLElement);
  const row = (el: HTMLElement) => el.dataset.row!;
  const rows = [...new Set(all.map(row))];
  const firstOf = (r: string) => { const inRow = all.filter((el) => row(el) === r); return inRow.find((el) => el.getAttribute('aria-checked') === 'true') ?? inRow[0]; };
  if (key === 'Home') { firstOf(rows[0]).focus(); return true; }
  if (key === 'End') { firstOf(rows[rows.length - 1]).focus(); return true; }
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const ri = cur < 0 ? -1 : rows.indexOf(row(all[cur]));
    const next = key === 'ArrowDown' ? (ri + 1) % rows.length : (ri <= 0 ? rows.length - 1 : ri - 1);
    firstOf(rows[next]).focus();
    return true;
  }
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && cur >= 0) {
    const inRow = all.filter((el) => row(el) === row(all[cur]));
    if (inRow.length < 2) return false;
    const fwd = (key === 'ArrowRight') !== rtl;
    const i = inRow.indexOf(all[cur]);
    inRow[(i + (fwd ? 1 : inRow.length - 1)) % inRow.length].focus();
    return true;
  }
  return false;
}

function MenuLevel({ entries, label, x, y, x2, flipUp, rtl, onClose, isSub, onBack, guard, autoFocus = true }: {
  entries: MenuEntry[]; label: string; x: number; y: number; x2?: number; flipUp: boolean; rtl: boolean;
  onClose(restore: boolean): void; isSub?: boolean; onBack?(): void; guard(): boolean; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<{ i: number; rect: DOMRect; focus: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    setPos(placeMenu(x, y, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight, rtl, x2, flipUp));
  }, [x, y, x2, rtl, flipUp]);
  useEffect(() => {
    if (!pos || !autoFocus) return;
    const el = ref.current!;
    if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });
  }, [pos]);

  const openSub = (i: number, row: HTMLElement, focus: boolean) => setSub({ i, rect: row.getBoundingClientRect(), focus });
  const fwdKey = rtl ? 'ArrowLeft' : 'ArrowRight', backKey = rtl ? 'ArrowRight' : 'ArrowLeft';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.ctx-custom')) { if (e.key === 'Escape') { e.stopPropagation(); onClose(true); } return; }
    const el = ref.current!;
    const active = document.activeElement as HTMLElement | null;
    if (!el.contains(active) || active?.closest('[role=menu]') !== el) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (isSub) onBack!(); else onClose(true); return; }
    if (e.key === 'Tab') { e.preventDefault(); moveFocus(el, e.shiftKey ? 'ArrowUp' : 'ArrowDown', rtl); return; }
    if (e.key === fwdKey && active?.dataset.sub) { e.preventDefault(); openSub(+active.dataset.sub, active, true); return; }
    if (e.key === backKey && isSub && !(active?.parentElement?.classList.contains('ctx-icons'))) { e.preventDefault(); onBack!(); return; }
    if (moveFocus(el, e.key, rtl)) e.preventDefault();
  };

  let row = 0;
  const subEntry = sub && entries[sub.i];
  return (
    <>
      <div ref={ref} role="menu" aria-label={label} tabIndex={-1} className={`menu ctx-menu ${isSub ? 'ctx-sub' : ''}`}
        style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
        {entries.map((it, i) => {
          const r = String(row);
          if (it.kind !== 'sep' && it.kind !== 'header' && it.kind !== 'custom') row++;
          switch (it.kind) {
            case 'sep': return <hr key={i} role="separator" />;
            case 'header':
              return <div key={i} className="ctx-header" role="presentation"><b dir="auto">{it.title}</b>{it.subtitle && <span className="muted">{it.subtitle}</span>}</div>;
            case 'custom': return <div key={i} className="ctx-custom" role="presentation">{it.render()}</div>;
            case 'item':
              return (
                <button key={i} role="menuitem" tabIndex={-1} data-row={r} aria-disabled={it.disabled || undefined} className={it.danger ? 'danger' : ''}
                  onMouseEnter={() => setSub(null)}
                  onClick={() => { if (it.disabled || guard()) return; onClose(true); it.onSelect(); }}>
                  {it.icon ? <it.icon /> : <span className="icon" />}<span>{it.label}</span>
                </button>
              );
            case 'check':
              return (
                <button key={i} role="menuitemcheckbox" tabIndex={-1} data-row={r} aria-checked={it.checked} className="ctx-check"
                  onMouseEnter={() => setSub(null)}
                  onClick={() => { if (!guard()) it.onToggle(); }}>
                  <span className="ctx-box" aria-hidden="true">{it.checked && <Icon.check />}</span><span>{it.label}</span>
                </button>
              );
            case 'icons':
              return (
                <div key={i} className="ctx-row" role="group" aria-label={it.label}>
                  <div className="ctx-row-label" aria-hidden="true">{it.label}</div>
                  <div className="ctx-icons">
                    {it.options.map((o) => (
                      <button key={o.id} role="menuitemradio" tabIndex={-1} data-row={r} aria-checked={o.selected} aria-label={o.label} title={o.label}
                        className={`${o.selected ? 'on' : ''} ${o.color ? 'swatch' : ''}`} style={o.color ? { background: o.color } : undefined}
                        onMouseEnter={() => setSub(null)}
                        onClick={() => { if (!guard()) it.onPick(o.id); }}>
                        {o.icon && <o.icon />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            case 'submenu':
              return (
                <button key={i} role="menuitem" tabIndex={-1} data-row={r} data-sub={i} aria-haspopup="menu" aria-expanded={sub?.i === i}
                  onMouseEnter={(e) => openSub(i, e.currentTarget, false)}
                  onClick={(e) => openSub(i, e.currentTarget, true)}>
                  {it.icon ? <it.icon /> : <span className="icon" />}<span>{it.label}</span><span className="ctx-arrow"><Icon.chevron /></span>
                </button>
              );
          }
        })}
      </div>
      {sub && subEntry?.kind === 'submenu' && (
        <MenuLevel key={sub.i} autoFocus={sub.focus} entries={subEntry.items} label={subEntry.label} rtl={rtl} isSub flipUp={false} guard={guard} onClose={onClose}
          x={rtl ? sub.rect.left : sub.rect.right} x2={rtl ? sub.rect.right : sub.rect.left} y={sub.rect.top - 6}
          onBack={() => { const i = sub.i; setSub(null); ref.current?.querySelector<HTMLElement>(`[data-sub="${i}"]`)?.focus(); }} />
      )}
    </>
  );
}

function OpenMenuView({ menu }: { menu: OpenMenu }) {
  useStore(); // rebuild on any change, so checks and colours stay current
  const items = useResolved();
  const rtl = useStore((s) => s.settings.lang === 'ar');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: Event) => { if (!root.current?.contains(e.target as Node)) closeMenu(); };
    const scroll = (e: Event) => { if (!root.current?.contains(e.target as Node)) closeMenu(); };
    const resize = () => closeMenu();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    addEventListener('resize', resize);
    addEventListener('blur', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      removeEventListener('resize', resize);
      removeEventListener('blur', resize);
    };
  }, []);

  // the touch that opened the menu ends with a click under the finger; ignore it
  const guard = () => menu.via === 'touch' && performance.now() - menu.at < 450;
  return (
    <div ref={root} className="ctx-root" dir={rtl ? 'rtl' : 'ltr'}>
      <MenuLevel entries={menu.build({ items })} label={menu.label} x={menu.x} y={menu.y} rtl={rtl} flipUp guard={guard} onClose={closeMenu} />
    </div>
  );
}

/** Renders the open context menu; mounted once in App. */
export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu);
  return menu ? <OpenMenuView key={menu.at} menu={menu} /> : null;
}
