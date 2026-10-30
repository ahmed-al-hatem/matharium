import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import { useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { useT } from '../i18n/i18n';
import { draw } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import { TextLayer } from '../graph2d/TextLayer';
import { exporters } from '../io/fileio';
import { RichText } from './RichText';
import { Icon } from './Icons';

/** Printed graph width in CSS px (A4 minus margins). */
const PRINT_W = 700;
const MAX_H = 540;

const texHtml = (tex: string) => {
  try { return katex.renderToString(tex, { throwOnError: false, strict: false }); } catch { return tex; }
};

/**
 * A printable worksheet: title, the graph as vector SVG (text annotations as HTML on top, so Arabic
 * and LaTeX print properly), the equations with their values, notes and optional answer space.
 * "Print" opens the browser dialog, where the user picks "Save as PDF".
 */
export function Worksheet({ onClose }: { onClose(): void }) {
  const t = useT();
  const items = useResolved();
  const mode = useStore((s) => s.mode);
  const view = useStore((s) => s.view);
  const settings = useStore((s) => s.settings);
  const fileName = useStore((s) => s.fileName);
  const [answers, setAnswers] = useState(true);
  const figure = useRef<HTMLElement>(null);
  const [fit, setFit] = useState(1);
  const title = fileName === 'Untitled' ? t('untitled') : fileName.replace(/\.(mth|json)$/i, '');

  const graph = useMemo(() => {
    const el = document.querySelector('.canvas-wrap');
    if (mode === '3d' || !el) return { png: exporters.png?.() ?? null };
    // same zoom as on screen, scaled to the paper width; tall views are cropped to fit the page
    const k = PRINT_W / el.clientWidth;
    const full = Math.round(el.clientHeight * k);
    const W = PRINT_W, H = Math.min(full, MAX_H);
    // crop from the bottom so screen-fixed text near the top keeps its place
    const v = { ...view, sx: view.sx * k, sy: view.sy * k, oy: view.oy + (full - H) / 2 / (view.sy * k) };
    const svg = new SvgCtx(W, H);
    draw(svg, items, { W, H, view: v, settings, selectedId: null, htmlText: true, light: true });
    return { svg: svg.toString(), W, H, view: v, k };
  }, [items, mode, view, settings]);

  // pen strokes and arrows are drawings, not equations
  const rows = items.filter((r) => r.obj.visible && r.value?.type !== 'stroke');

  // on narrow screens the preview is scaled down; printing always uses the full paper width
  useEffect(() => {
    const el = figure.current;
    if (!el || !graph.W) return;
    const ro = new ResizeObserver(() => setFit(Math.min(1, el.clientWidth / graph.W!)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [graph.W]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.classList.add('ws-open');
    return () => { window.removeEventListener('keydown', h); document.body.classList.remove('ws-open'); };
  }, [onClose]);

  return createPortal(
    <div className="ws-root" role="dialog" aria-modal="true" aria-label={t('worksheet')} dir={settings.lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="ws-toolbar no-print">
        <strong>{t('worksheet')}</strong>
        <label className="check"><input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} />{t('ws.answers')}</label>
        <span className="spacer" />
        <button className="pill-btn" onClick={() => window.print()}><Icon.download />{t('ws.print')}</button>
        <button className="icon-btn" onClick={onClose} aria-label={t('close')} title={t('close')}><Icon.close /></button>
      </div>
      <article className="worksheet">
        <h1 className="ws-title" contentEditable suppressContentEditableWarning dir="auto" spellCheck={false}>{title}</h1>
        <div className="ws-meta">{t('ws.name')} ______________________ &nbsp; {t('ws.date')} ____________</div>
        <figure className="ws-graph" ref={figure} style={graph.H ? { ['--fit' as string]: fit, ['--h' as string]: `${graph.H}px` } : undefined}>
          {graph.svg ? (
            <div className="ws-graph-box" style={{ width: graph.W, height: graph.H }}>
              <div dangerouslySetInnerHTML={{ __html: graph.svg }} />
              <TextLayer items={items} view={graph.view!} W={graph.W!} H={graph.H!} scale={graph.k} light />
            </div>
          ) : graph.png ? <img src={graph.png} alt="" /> : null}
        </figure>
        {rows.length > 0 && (
          <section>
            <h2>{t('ws.equations')}</h2>
            <ol className="ws-eqs">
              {rows.map((r) => (
                <li key={r.obj.id}>
                  <span className="ws-swatch" style={{ background: r.obj.color }} />
                  {r.value?.type === 'label'
                    ? <RichText className="ws-eq" text={r.value.text} />
                    : <span className="ws-eq" dir="ltr" dangerouslySetInnerHTML={{ __html: texHtml(r.tex) }} />}
                  {r.display && <span className="ws-val" dir="ltr">{r.display}</span>}
                  {r.error && <span className="ws-val err">{r.error}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
        <section>
          <h2>{t('ws.notes')}</h2>
          <div className="ws-notes" contentEditable suppressContentEditableWarning dir="auto" data-placeholder={t('ws.notesHint')} />
        </section>
        {answers && (
          <section className="ws-answers">
            <h2>{t('ws.answerSpace')}</h2>
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="ws-line" />)}
          </section>
        )}
      </article>
    </div>,
    document.body,
  );
}
