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
  pointOn: <S><circle cx={16} cy={18} r={9} stroke={MU} />{dot(22.4, 11.6)}</S>,
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
  { key: 'group.basic', tools: ['move', 'point', 'pointOn', 'slider', 'delete'] },
  { key: 'group.lines', tools: ['segment', 'line', 'ray', 'vector', 'polygon'] },
  { key: 'group.construct', tools: ['circle', 'circle3', 'midpoint', 'perpendicular', 'parallel', 'bisector', 'intersect', 'tangent'] },
  { key: 'group.measure', tools: ['distance', 'angle'] },
];

/** Faint x/y/z axes in a 3D-ish projection, shared by the 3D template icons. */
const axes3 = <path d="M16 18v-13M16 18l-10 6M16 18l11 5" stroke="#5a5b5a" strokeWidth={1.2} />;

const TEMPLATES_3D: { label: string; input: string; icon: ReactNode }[] = [
  {
    label: 'z = f(x, y)', input: 'z = sin(x) cos(y)',
    icon: <S><path d="M4 18c4-6 8 2 12-4s8 2 12-2M4 18l8 7M28 12l-8 9M12 25c4-5 6 2 8-4" stroke={TE} fill="rgba(109,196,170,.2)" /></S>,
  },
  { label: 'Plane', input: 'x + y + z = 2', icon: <S>{axes3}<path d="M4 14 18 8l10 8-14 7z" stroke={B} fill="rgba(50,130,246,.25)" /></S> },
  {
    label: 'Sphere', input: 'Sphere((0, 0, 0), 3)',
    icon: <S><circle cx={16} cy={16} r={11} stroke={MU} fill="rgba(225,181,73,.15)" /><ellipse cx={16} cy={16} rx={11} ry={3.5} stroke={MU} /><path d="M16 5a4 11 0 0 0 0 22" stroke={MU} opacity={0.6} /></S>,
  },
  { label: 'Point', input: '(1, 2, 3)', icon: <S>{axes3}<path d="M16 18l6-3v-6" stroke={G} strokeDasharray="2 2" />{dot(22, 9)}</S> },
  { label: 'Vector', input: 'Vector((2, 2, 3))', icon: <S>{axes3}<path d="M16 18 25 7" stroke={CO} strokeWidth={2} /><path d="m19 7.5 6-.5-.5 6" stroke={CO} strokeWidth={2} /></S> },
  {
    label: 'Helix', input: 'Curve(2cos(t), 2sin(t), t/3, t, 0, 6pi)',
    icon: <S><path d="M7 27c0-3 18-1 18-4s-18-1-18-4 18-1 18-4-18-1-18-4 18-1 18-4" stroke={B} strokeWidth={1.8} /></S>,
  },
  {
    label: 'Torus', input: '(sqrt(x^2 + y^2) - 3)^2 + z^2 = 1',
    icon: <S><ellipse cx={16} cy={16} rx={13} ry={8} stroke={MU} fill="rgba(225,181,73,.2)" /><path d="M9 15c3 4 11 4 14 0M11 16.5c3-2.5 7-2.5 10 0" stroke={MU} /></S>,
  },
  {
    label: 'Surface', input: 'Surface((3 + cos(v)) cos(u), (3 + cos(v)) sin(u), sin(v), u, 0, 2pi, v, 0, 2pi)',
    icon: <S><path d="M4 12c6-6 18-6 24 0v10c-6-6-18-6-24 0z" stroke={CO} fill="rgba(228,91,69,.15)" /><path d="M10 9.2v10M16 8v10M22 9.2v10M4 17c6-6 18-6 24 0" stroke={CO} opacity={0.6} /></S>,
  },
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
              {x.icon}{x.label}
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
