import { useCallback, useEffect, useReducer, useRef } from "react";
import { MAX_CHORD_NOTES } from "../../../core/theory/chordTypes";
import { useTimedValue } from "../../../hooks/useTimedValue";
import type { Pad } from "../../../core/grid/grid";
import { FinderAction, finderReducer, FinderItem, initialFinderState, isFull } from "../lib/finderState";

const HINT_MS = 2600;

/**
 * Страница определения: редьюсер плюс то, что живёт вне него — подсказка «не
 * больше шести нот» и клавиши: Enter — в подбор, Esc — очистить сетку.
 */
export function useFinder(items: FinderItem[]) {
  const [state, dispatch] = useReducer(finderReducer, items, initialFinderState);
  const [hint, setHint] = useTimedValue<string>(HINT_MS);

  const clickPad = useCallback(
    (pad: Pad) => {
      if (isFull(state) && !state.selection.includes(pad)) setHint(`a chord has at most ${MAX_CHORD_NOTES} notes — remove one first`);
      else dispatch({ type: "clickPad", pad });
    },
    [state, setHint],
  );

  const hasSelection = state.selection.length > 0;
  const keys = useRef<(e: KeyboardEvent) => void>(null);
  keys.current = (e) => {
    const target = e.target as HTMLElement | null;
    if (!hasSelection || target?.closest("input, textarea, button, a, [role=separator]")) return;
    if (e.key === "Enter") {
      dispatch({ type: "addToCollection" });
      e.preventDefault();
    } else if (e.key === "Escape") dispatch({ type: "clearGrid" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current?.(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return { state, dispatch: dispatch as (a: FinderAction) => void, clickPad, hint };
}
