import { Button } from "../../../components/ui";
import { MAX_CHORD_NOTES } from "../../../core/theory/chordTypes";
import { describeSelection } from "../lib/describe";
import { chosenCandidate, currentReading, FinderAction, FinderState } from "../lib/finderState";
import { readingText } from "../lib/reading";
import styles from "./FinderResult.module.scss";

interface FinderResultProps {
  state: FinderState;
  dispatch: (action: FinderAction) => void;
  hint: string | null;
}

/** Под большой сеткой: что получилось, варианты названия, «в подбор». */
export function FinderResult({ state, dispatch, hint }: FinderResultProps) {
  const headline = describeSelection(state);
  const text = readingText(currentReading(state));
  const chosen = chosenCandidate(state);
  const { candidates } = state.identification;
  // лишние ноты и так видно фиолетовым — тут только «чего не хватает»
  const warning = hint ?? (chosen?.missing.length ? `no ${chosen.missing.join(", ")}` : "");
  // один вариант уже написан крупно — дубль не нужен; но если заголовка нет, выбрать его больше нечем
  const options = candidates.length > 1 || state.chosen < 0 ? candidates : [];

  return (
    <div className={styles.result}>
      <div className={styles.symbol} data-muted={headline.muted || undefined} data-testid="finder-symbol">
        {headline.symbol}
      </div>
      <div className={styles.description}>{headline.description}</div>
      <div className={styles.note}>
        {text.notes.map((n, i) => (
          <span key={i}>
            {i > 0 && " · "}
            <b>{n}</b>
          </span>
        ))}
        {text.extraNotes.length > 0 && <span className={styles.extra}> + {text.extraNotes.join(" · ")}</span>}
      </div>
      <div className={styles.note}>
        {(text.degrees.length > 0 || text.extraDegrees.length > 0) && (
          <>
            degrees <b>{text.degrees.join(" · ")}</b>
            {text.extraDegrees.length > 0 && <span className={styles.extra}> + {text.extraDegrees.join(" · ")}</span>}
          </>
        )}
      </div>
      <div className={`${styles.note} ${styles.warning}`} role="status">
        {warning}
      </div>
      <div className={styles.options}>
        {options.map((c, i) => (
          <button
            key={c.symbol}
            type="button"
            className={styles.option}
            aria-pressed={i === state.chosen}
            title={c.typeName}
            onClick={() => dispatch({ type: "chooseCandidate", index: i })}
          >
            {c.symbol}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="primary" disabled={!state.selection.length} onClick={() => dispatch({ type: "addToCollection" })}>
          Add to collection
        </Button>
        <Button onClick={() => dispatch({ type: "clearGrid" })}>Clear grid</Button>
      </div>
      <p className={styles.hint}>
        The first pad you press is the <b>root</b>: the chord is built from it, and clicking it again clears the grid. At most{" "}
        {MAX_CHORD_NOTES} notes per chord. Pick another name from the list and the root moves to it.
        <br />
        Enter &mdash; add to collection, Esc &mdash; clear. Click a diagram on the right to bring it back to the grid, drag to reorder.
      </p>
    </div>
  );
}
