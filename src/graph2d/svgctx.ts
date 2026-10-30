import type { Ctx } from './renderer';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(2);

interface St { fillStyle: string; strokeStyle: string; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline; globalAlpha: number; dash: number[] }

/** Records the renderer's drawing calls as SVG markup (for vector export). */
export class SvgCtx implements Ctx {
  private parts: string[] = [];
  private d = '';
  private st: St = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, dash: [] };
  private stack: St[] = [];
  lineCap: CanvasLineCap = 'round';
  lineJoin: CanvasLineJoin = 'round';
  constructor(private W: number, private H: number) {}

  get fillStyle() { return this.st.fillStyle; } set fillStyle(v) { this.st.fillStyle = String(v); }
  get strokeStyle() { return this.st.strokeStyle; } set strokeStyle(v) { this.st.strokeStyle = String(v); }
  get lineWidth() { return this.st.lineWidth; } set lineWidth(v) { this.st.lineWidth = v; }
  get font() { return this.st.font; } set font(v) { this.st.font = v; }
  get textAlign() { return this.st.textAlign; } set textAlign(v) { this.st.textAlign = v; }
  get textBaseline() { return this.st.textBaseline; } set textBaseline(v) { this.st.textBaseline = v; }
  get globalAlpha() { return this.st.globalAlpha; } set globalAlpha(v) { this.st.globalAlpha = v; }

  setLineDash(d: number[]) { this.st.dash = d; }
  save() { this.stack.push({ ...this.st }); }
  restore() { const s = this.stack.pop(); if (s) this.st = s; }
  beginPath() { this.d = ''; }
  moveTo(x: number, y: number) { this.d += `M${n(x)} ${n(y)}`; }
  lineTo(x: number, y: number) { this.d += `L${n(x)} ${n(y)}`; }
  closePath() { this.d += 'Z'; }

  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    let sweep = ccw ? a0 - a1 : a1 - a0;
    if (sweep < 0) sweep += Math.PI * 2;
    const full = sweep >= Math.PI * 2 - 1e-9 || Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9;
    const pt = (a: number) => `${n(x + r * Math.cos(a))} ${n(y + r * Math.sin(a))}`;
    this.d += `${this.d ? 'L' : 'M'}${pt(a0)}`;
    if (full) {
      this.d += `A${n(r)} ${n(r)} 0 1 1 ${pt(a0 + Math.PI)}A${n(r)} ${n(r)} 0 1 1 ${pt(a0)}`;
      return;
    }
    const end = ccw ? a0 - sweep : a0 + sweep;
    this.d += `A${n(r)} ${n(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${pt(end)}`;
  }

  ellipse(x: number, y: number, rx: number, ry: number) {
    this.d += `M${n(x + rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 1 1 ${n(x - rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 1 1 ${n(x + rx)} ${n(y)}`;
  }

  private alpha() { return this.st.globalAlpha < 1 ? ` opacity="${n(this.st.globalAlpha)}"` : ''; }

  stroke() {
    if (!this.d) return;
    const dash = this.st.dash.length ? ` stroke-dasharray="${this.st.dash.join(' ')}"` : '';
    this.parts.push(`<path d="${this.d}" fill="none" stroke="${esc(this.st.strokeStyle)}" stroke-width="${n(this.st.lineWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash}${this.alpha()}/>`);
  }

  fill() {
    if (!this.d) return;
    this.parts.push(`<path d="${this.d}" fill="${esc(this.st.fillStyle)}"${this.alpha()}/>`);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(this.st.fillStyle)}"${this.alpha()}/>`);
  }

  fillText(t: string, x: number, y: number) {
    const anchor = this.st.textAlign === 'center' ? 'middle' : this.st.textAlign === 'right' || this.st.textAlign === 'end' ? 'end' : 'start';
    const base = this.st.textBaseline === 'middle' ? 'central' : this.st.textBaseline === 'top' ? 'hanging' : this.st.textBaseline === 'bottom' ? 'text-after-edge' : 'auto';
    this.parts.push(`<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" dominant-baseline="${base}" style="font: ${esc(this.st.font)}" fill="${esc(this.st.fillStyle)}"${this.alpha()}>${esc(t)}</text>`);
  }

  measureText(t: string) {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.st.font)?.[1] ?? '12');
    return { width: t.length * size * 0.6 };
  }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}">${this.parts.join('')}</svg>`;
  }
}
