import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/* GET a path; refetch when it changes, on reload(), and every `poll` ms if set. */
export function useApi(path, { poll = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const tick = useRef(0);
  const load = useCallback(
    async (quiet = false) => {
      if (!path) return;
      const mine = ++tick.current;
      if (!quiet) setState((s) => ({ ...s, loading: true }));
      try {
        const data = await api(path);
        if (mine === tick.current) setState({ data, error: null, loading: false });
      } catch (error) {
        if (mine === tick.current) setState((s) => ({ data: s.data, error, loading: false }));
      }
    },
    [path],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!poll) return undefined;
    const id = setInterval(() => document.visibilityState === 'visible' && load(true), poll);
    return () => clearInterval(id);
  }, [load, poll]);
  return { ...state, reload: load };
}
