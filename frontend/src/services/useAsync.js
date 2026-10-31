import { useCallback, useEffect, useState } from 'react';

/** Runs an async loader on mount / when deps change. Returns { data, error, loading, reload, setData }. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}
