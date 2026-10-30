import type { ReactNode } from 'react';
import { useStore, type ToolId } from '../store/project';
import { useT } from '../i18n/i18n';

const B = '#3282F6', CO = '#E45B45', TE = '#6DC4AA', MU = '#E1B549', G = '#C4C5C4';
const dot = (x: number, y: number, c = B) => <circle cx={x} cy={y} r={2.6} fill={c} stroke="none" />;
const S = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke={G} strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">{children}</svg>
);

const ICONS: Record<ToolId, ReactNode> = {
  move: <S><path d="M10 6v17l4.5-4.5 3 7 3-1.3-3-6.8H24z" fill={G} stroke="none" /></S>,
  point: <S>{dot(16, 16)}<path d="M20 12l4-4" stroke={G} /></S>,
  segment: <S><path d="M7 24 25 8" stroke={CO} />{dot(7, 24)}{dot(25, 8)}</S>,
  line: <S><path d="M3 27 29 5" stroke={CO} />{dot(10, 21)}{dot(22, 11)}</S>,
  ray: <S><path d="M7 24 29 6" stroke={CO} />{dot(7, 24)}{dot(18, 15)}</S>,
  vector: <S><path d="M7 24 24 9" stroke={CO} /><path d="m18 9 6 0 0 6" stroke={CO} />{dot(7, 24)}</S>,
  polygon: <S><path d="M6 24 10 8 25 11 23 25z" stroke={TE} fill="rgba(109,196,170,.2)" />{dot(6, 24)}{dot(10, 8)}{dot(25, 11)}{dot(23, 25)}</S>,
  circle: <S><circle cx={16} cy={16} r={10} stroke={MU} />{dot(16, 16)}{dot(26, 16)}</S>,
  circle3: <S><circle cx={16} cy={16} r={10} stroke={MU} />{dot(8, 10)}{dot(25, 13)}{dot(13, 26)}</S>,
  midpoint: <S><path d="M6 24 26 8" stroke={G} />{dot(6, 24, G)}{dot(26, 8, G)}{dot(16, 16)}</S>,
  perpendicular: <S><path d="M4 22h24" stroke={G} /><path d="M16 4v24" stroke={CO} /><path d="M16 18h3v4" stroke={G} />{dot(16, 9)}</S>,
  parallel: <S><path d="M4 24 26 12" stroke={G} /><path d="M6 16 28 4" stroke={CO} />{dot(13, 12.2)}</S>,
  bisector: <S><path d="M6 22h20" stroke={G} /><path d="M16 4v26" stroke={CO} />{dot(6, 22)}{dot(26, 22)}</S>,
  intersect: <S><path d="M4 26 28 8" stroke={CO} /><path d="M4 8c8 4 16 12 24 18" stroke={TE} />{dot(16, 17)}</S>,
  tangent: <S><path d="M4 26c6-18 18-18 24-4" stroke={TE} /><path d="M2 12h28" stroke={CO} />{dot(16, 12)}</S>,
  distance: <S><path d="M6 20 26 20" stroke={G} />{dot(6, 20)}{dot(26, 20)}<text x="16" y="14" fontSize="9" fill={MU} stroke="none" textAnchor="middle" fontFamily="JetBrains Mono">cm</text></S>,
  angle: <S><path d="M26 24H6l14-16" stroke={G} /><path d="M14 24a8 8 0 0 0-2.8-6.2" stroke={MU} strokeWidth={2.4} /></S>,
  slider: <S><path d="M5 16h22" stroke={G} />{dot(12, 16)}<circle cx={12} cy={16} r={4.5} stroke={B} /></S>,
  delete: <S><path d="M8 10h16M13 10V7h6v3M10 10l1 15h10l1-15" stroke={CO} /></S>,
};

const GROUPS: { key: string; tools: ToolId[] }[] = [
  { key: 'group.basic', tools: ['move', 'point', 'slider', 'delete'] },
  { key: 'group.lines', tools: ['segment', 'line', 'ray', 'vector', 'polygon'] },
  { key: 'group.construct', tools: ['circle', 'circle3', 'midpoint', 'perpendicular', 'parallel', 'bisector', 'intersect', 'tangent'] },
  { key: 'group.measure', tools: ['distance', 'angle'] },
];

const TEMPLATES_3D: { label: string; input: string }[] = [
  { label: 'z = f(x, y)', input: 'z = sin(x) cos(y)' },
  { label: 'Plane', input: 'x + y + z = 2' },
  { label: 'Sphere', input: 'Sphere((0, 0, 0), 3)' },
  { label: 'Point', input: '(1, 2, 3)' },
  { label: 'Vector', input: 'Vector((2, 2, 3))' },
  { label: 'Helix', input: 'Curve(2cos(t), 2sin(t), t/3, t, 0, 6pi)' },
  { label: 'Torus', input: '(sqrt(x^2 + y^2) - 3)^2 + z^2 = 1' },
  { label: 'Surface', input: 'Surface((3 + cos(v)) cos(u), (3 + cos(v)) sin(u), sin(v), u, 0, 2pi, v, 0, 2pi)' },
];

export function ToolsPanel() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const st = useStore.getState();

  if (mode === '3d') {
    return (
      <div className="panel-scroll tools">
        <h4>3D</h4>
        <div className="tool-grid">
          {TEMPLATES_3D.map((x) => (
            <button key={x.label} className="tool-btn" onClick={() => { st.addObject(x.input); st.setPanel('algebra'); }}>
              <Icon3D />{x.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-scroll tools">
      {GROUPS.map((g) => (
        <div key={g.key}>
          <h4>{t(g.key)}</h4>
          <div className="tool-grid">
            {g.tools.map((id) => (
              <button key={id} className={`tool-btn ${tool === id ? 'active' : ''}`} onClick={() => st.setTool(id)} title={t(`toolHelp.${id}`)} aria-pressed={tool === id}>
                {ICONS[id]}
                {t(`tool.${id}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Icon3D = () => (
  <svg viewBox="0 0 32 32" fill="none" strokeWidth={1.6} aria-hidden="true">
    <path d="m16 4 11 6v12l-11 6-11-6V10z" stroke={TE} /><path d="m5 10 11 6 11-6M16 16v12" stroke={G} />
  </svg>
);
