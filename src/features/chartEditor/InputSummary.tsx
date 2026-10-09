import type { InputAnalysis } from "../../core/sheet/analyze";
import { count } from "../../utils/format";
import styles from "./ChartEditor.module.scss";

/** Что получится из вставленного текста — одной строкой под полем. */
export function InputSummary({ analysis: a }: { analysis: InputAnalysis }) {
  if (a.kind === "empty") return <span className={styles.dim}>Paste a chord progression or song lyrics with chords.</span>;

  const unknown = [...new Set(a.unknown.map((u) => u.symbol))];
  const unknownNote = unknown.length > 0 && (
    <span className={styles.unknown}>
      {" "}
      · not recognized: <b>{unknown.join(", ")}</b>
    </span>
  );

  if (a.kind === "progression")
    return (
      <span>
        progression: <b>{count(a.chords.length, "chord", "chords")}</b>
        {unknownNote}
      </span>
    );

  return (
    <span>
      lyrics with chords
      {a.sections > 0 && (
        <>
          : <b>{count(a.sections, "section", "sections")}</b>
        </>
      )}
      , diagrams: <b>{new Set(a.chords).size}</b>
      {a.fromInstrumental && " (no chords under the lyrics — diagrams from instrumental parts)"}
      {unknownNote}
    </span>
  );
}
