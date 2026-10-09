import { useMemo, useState } from "react";
import { clickPad, DiagramState, initialDiagram, padLabels, padView, restoreDiagram, summarize } from "../../../core/diagram/diagram";
import type { Pad } from "../../../core/grid/grid";
import type { Chord } from "../../../core/theory/chord";
import type { PadCell } from "../PadGrid/PadGrid";

/**
 * Состояние редактируемой схемы: раскладка солвера, поверх неё — правки руками.
 * Наружу (onChange) уходит то, что накликал человек; вернул как было — null,
 * чтобы в хранилище не копились записи «эта схема не изменена».
 */
export function useDiagramEditor(
  chord: Chord,
  solverPads: readonly Pad[],
  saved: DiagramState | null | undefined,
  onChange?: (state: DiagramState | null) => void,
) {
  const [state, setState] = useState(() => restoreDiagram(solverPads, saved));
  const labels = useMemo(() => padLabels(chord), [chord]);
  const summary = useMemo(() => summarize(chord, state, solverPads), [chord, state, solverPads]);

  const cells: PadCell[] = useMemo(
    () =>
      labels.map((label) => {
        const view = padView(chord, state, label.pad);
        return { ...label, ...view, focusable: view.role === "ghost" || view.role === "extra" };
      }),
    [labels, chord, state],
  );

  const commit = (next: DiagramState) => {
    setState(next);
    onChange?.(summarize(chord, next, solverPads).edited ? next : null);
  };

  return {
    cells,
    summary,
    clickPad: (pad: Pad) => {
      const next = clickPad(chord, state, pad);
      if (next !== state) commit(next);
    },
    reset: () => commit(initialDiagram(solverPads)),
  };
}
