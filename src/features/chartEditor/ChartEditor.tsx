import { useNavigate } from "react-router-dom";
import { Button, StatusText, TextField } from "../../components/ui";
import type { Chart } from "../../storage";
import styles from "./ChartEditor.module.scss";
import { FormatHelp } from "./FormatHelp";
import { InputSummary } from "./InputSummary";
import { useChartDraft } from "./useChartDraft";

const EXAMPLE = "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am";

const PLACEHOLDER = `Bb Gm Dm C

or song lyrics with chords above the lines:

[Verse 1]
Am                F
Evening walks across the rooftops
C                     G
Wind is writing letters to the sea`;

/** Поле для нового разбора или правки старого. Сохранил — открылся разбор. */
export function ChartEditor({ initial }: { initial?: Chart }) {
  const navigate = useNavigate();
  const draft = useChartDraft(initial);

  const submit = async () => {
    const chart = await draft.save();
    if (chart) navigate(`/charts/${chart.id}`);
  };

  return (
    <section className={styles.editor}>
      <textarea
        className={styles.source}
        aria-label="chords or lyrics with chords"
        value={draft.source}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        onChange={(e) => draft.setSource(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <div className={styles.row}>
        <TextField className={styles.field} placeholder="title" value={draft.title} onChange={(e) => draft.setTitle(e.target.value)} />
        <TextField className={styles.field} placeholder="artist" value={draft.artist} onChange={(e) => draft.setArtist(e.target.value)} />
        <Button variant="primary" disabled={!!draft.problem || draft.saving} onClick={submit} title="Ctrl/⌘ + Enter">
          {initial ? "Save" : "Create chart"}
        </Button>
        {!initial && <Button onClick={() => draft.insertExample(EXAMPLE)}>insert example</Button>}
      </div>
      <div className={styles.info} aria-live="polite">
        <InputSummary analysis={draft.analysis} />
        <StatusText status={draft.error ? { text: draft.error, error: true } : null} />
      </div>
      <FormatHelp />
    </section>
  );
}
