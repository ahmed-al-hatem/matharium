import { useMemo } from 'react';
import { evaluateAll } from '../math/engine';
import { useStore } from './project';

export function useResolved() {
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  return useMemo(() => evaluateAll(objects, digits), [objects, digits]);
}
