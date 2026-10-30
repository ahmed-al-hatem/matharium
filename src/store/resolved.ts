import { useMemo } from 'react';
import { evaluateAll } from '../math/engine';
import { useStore } from './project';

export function useResolved() {
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  const sigFigs = useStore((s) => s.settings.sigFigs);
  const angle = useStore((s) => s.settings.angle);
  const sheet = useStore((s) => s.sheet);
  return useMemo(() => evaluateAll(objects, digits, sheet, { sigFigs, angle }), [objects, digits, sheet, sigFigs, angle]);
}
