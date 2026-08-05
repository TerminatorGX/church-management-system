import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal data-fetching hook. `deps` controls refetching; `reload` forces it.
 * Aborts in-flight requests on unmount so a slow response can't set state on
 * a page the user already navigated away from.
 */
export const useApi = <T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) => {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    setState((s) => ({ ...s, loading: true, error: null }));

    fetcher(controller.signal)
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Something went wrong";
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
};

/** Debounces a value — used for search boxes so every keystroke isn't a request. */
export const useDebounced = <T>(value: T, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};
