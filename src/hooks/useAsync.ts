import { DependencyList, useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: Error };

/**
 * Загрузить данные и перезагружать при смене зависимостей. Ответ на устаревший
 * запрос отбрасывается. reload() — перечитать вручную.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (error: unknown) => current && setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
