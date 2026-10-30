import { useMemo } from 'react';
import { evaluateAll } from '../math/engine';
import { useStore } from './project';

export function useResolved() {
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  const sheet = useStore((s) => s.sheet);
  return useMemo(() => evaluateAll(objects, digits, sheet), [objects, digits, sheet]);
}
