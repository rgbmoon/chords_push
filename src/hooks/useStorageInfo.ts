import { useCallback, useEffect, useState } from "react";
import { getPersistence, Persistence, requestPersistence, storageMode } from "../storage";

/** Где лежат данные и обещал ли браузер их не чистить. */
export function useStorageInfo() {
  const [mode, setMode] = useState<"indexeddb" | "memory" | null>(null);
  const [persistence, setPersistence] = useState<Persistence | null>(null);

  useEffect(() => {
    storageMode().then(setMode);
    getPersistence().then(setPersistence);
  }, []);

  const askToPersist = useCallback(() => {
    requestPersistence().then(setPersistence);
  }, []);

  return { mode, persistence, askToPersist };
}
