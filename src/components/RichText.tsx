import { useMemo, type CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { isRtl, splitMath } from '../math/annotate';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text with `$…$` LaTeX: math through KaTeX (always left-to-right), the rest as plain text. */
export function richHtml(text: string) {
  return splitMath(text).map((p) => {
    if (!p.math) return esc(p.s);
    try { return `<span class="rt-math" dir="ltr">${katex.renderToString(p.s, { throwOnError: false, strict: false })}</span>`; } catch { return esc(p.s); }
  }).join('');
}

export function RichText({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const html = useMemo(() => richHtml(text), [text]);
  return <div className={className} style={style} dir={isRtl(text) ? 'rtl' : 'ltr'} dangerouslySetInnerHTML={{ __html: html }} />;
}
