import type { DiagramState } from "../../../core/diagram/diagram";
import type { Pad } from "../../../core/grid/grid";
import type { Chord } from "../../../core/theory/chord";
import { CardButton, DiagramCard } from "../DiagramCard/DiagramCard";
import { PadGrid } from "../PadGrid/PadGrid";
import styles from "./ChordDiagram.module.scss";
import { useDiagramEditor } from "./useDiagramEditor";

interface ChordDiagramProps {
  chord: Chord;
  /** раскладка солвера */
  pads: readonly Pad[];
  /** сохранённая правка */
  saved?: DiagramState | null;
  onChange?: (state: DiagramState | null) => void;
}

/**
 * Схема аккорда, которую можно переопределить рукой: клик по бледному пэду
 * переносит туда голос (так задаётся обращение), клик по любому другому —
 * добавляет свою ноту, ⟲ возвращает раскладку солвера.
 */
export function ChordDiagram({ chord, pads, saved, onChange }: ChordDiagramProps) {
  const { cells, summary, clickPad, reset } = useDiagramEditor(chord, pads, saved, onChange);
  return (
    <DiagramCard
      title={chord.symbol}
      notes={summary.notes}
      extraNotes={summary.extraNotes}
      degrees={summary.degrees}
      extraDegrees={summary.extraDegrees}
      edited={summary.edited}
      data-chord={chord.symbol}
      actions={
        summary.edited && (
          <>
            {summary.inversion && <span className={styles.inversion}>{summary.inversion}</span>}
            <CardButton title="restore the solver's voicing" onClick={reset}>
              &#10227;
            </CardButton>
          </>
        )
      }
    >
      <PadGrid cells={cells} onPadClick={clickPad} />
    </DiagramCard>
  );
}
