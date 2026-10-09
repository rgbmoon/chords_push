import { useEffect, useState } from "react";

/** Значение, которое само сбрасывается в null через ms — для коротких подсказок и статусов. */
export function useTimedValue<T>(ms: number): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return [value, setValue];
}
