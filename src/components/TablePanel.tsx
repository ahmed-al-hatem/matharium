import { useMemo } from 'react';
import { useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { useT } from '../i18n/i18n';
import { exportCSV } from '../io/fileio';
import { fmt } from '../math/solve';
import { Icon } from './Icons';

export function TablePanel() {
  const t = useT();
  const items = useResolved();
  const table = useStore((s) => s.table);
  const digits = useStore((s) => s.settings.digits);
  const setTable = useStore((s) => s.setTable);
  const fns = items.filter((r) => r.value?.type === 'function');
  const chosen = fns.filter((r) => table.ids.includes(r.obj.id));
  const active = chosen.length ? chosen : fns.slice(0, 1);

  const xs = useMemo(() => {
    const out: number[] = [];
    if (table.step > 0) for (let x = table.start, i = 0; x <= table.end + 1e-9 && i < 1000; x += table.step, i++) out.push(+x.toFixed(10));
    return out;
  }, [table]);

  if (!fns.length) return <div className="empty-hint">{t('table.empty')}</div>;

  const toggle = (id: string) => {
    const ids = active.map((r) => r.obj.id);
    setTable({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };

  return (
    <>
      <div className="chips">
        {fns.map((r) => (
          <button key={r.obj.id} className={`chip ${active.includes(r) ? 'on' : ''}`} style={{ ['--c' as string]: r.obj.color }} onClick={() => toggle(r.obj.id)}>
            <i />{r.obj.name}
          </button>
        ))}
      </div>
      <div className="table-cfg">
        {(['start', 'end', 'step'] as const).map((k) => (
          <label key={k}>{t(`table.${k}`)}
            <input className="field" type="number" step="any" value={table[k]} onChange={(e) => setTable({ [k]: +e.target.value })} />
          </label>
        ))}
      </div>
      <div className="panel-scroll">
        <table className="values">
          <thead><tr><th>x</th>{active.map((r) => <th key={r.obj.id} style={{ color: r.obj.color }}>{r.obj.name}(x)</th>)}</tr></thead>
          <tbody>
            {xs.map((x) => (
              <tr key={x}>
                <td>{fmt(x, digits)}</td>
                {active.map((r) => <td key={r.obj.id}>{fmt((r.value as { f: (x: number) => number }).f(x), digits)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-footer">
        <button className="ghost-btn" onClick={() => { if (!chosen.length) setTable({ ids: active.map((r) => r.obj.id) }); setTimeout(() => exportCSV('table')); }}><Icon.download />CSV</button>
      </div>
    </>
  );
}
