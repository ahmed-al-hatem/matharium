import { shown, type Resolved } from '../math/types';
import type { View } from '../store/project';
import { isRtl } from '../math/annotate';
import { RichText } from '../components/RichText';
import { Viewport } from './viewport';

/**
 * Text annotations as HTML over the graph, so KaTeX and Arabic shaping render properly.
 * World-anchored text follows pan and zoom; screen-anchored text stays put.
 */
export function TextLayer({ items, view, W, H, selectedId, light, scale = 1 }: {
  items: Resolved[]; view: View; W: number; H: number; selectedId?: string | null; light?: boolean;
  /** for screen-anchored text when the graph is drawn at another size (worksheet) */
  scale?: number;
}) {
  const vp = new Viewport(view, W, H);
  return (
    <div className="text-layer">
      {items.map((r) => {
        const { obj, value: v } = r;
        if (v?.type !== 'label' || !shown(r)) return null;
        const x = v.screen ? v.p.x * scale : vp.px(v.p.x), y = v.screen ? v.p.y * scale : vp.py(v.p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const rtl = isRtl(v.text);
        return (
          <RichText
            key={obj.id}
            text={v.text}
            className={`text-label ${selectedId === obj.id ? 'selected' : ''}`}
            style={{
              left: x, top: y, transform: rtl ? 'translateX(-100%)' : undefined,
              color: light && obj.color === '#DCDCDC' ? '#222322' : obj.color,
            }}
          />
        );
      })}
    </div>
  );
}
