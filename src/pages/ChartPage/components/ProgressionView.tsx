import { Fragment, useMemo, useState } from "react";
import { PageContent, PageHeader, PageLayout } from "../../../components/layout";
import { ChordDiagram, ColorLegend, DiagramList } from "../../../components/music";
import { Size, SizeSwitch } from "../../../components/ui";
import { SOLVER, voiceProgression } from "../../../core/grid/voicing";
import type { InputAnalysis } from "../../../core/sheet/analyze";
import { parseChord } from "../../../core/theory/chord";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import type { Chart } from "../../../storage";
import { cssVars } from "../../../utils/cssVars";
import { count, formatDate } from "../../../utils/format";
import { useChartEdits } from "../hooks/useChartEdits";
import { solve } from "../lib/solve";
import { ChartActions } from "./ChartActions";
import styles from "./ProgressionView.module.scss";
import { ErrorNote, UnknownChords } from "./UnknownChords";

const CARD_SIZE: Record<Size, [number, number]> = { S: [320, 340], M: [400, 430], L: [540, 580] };

type ProgressionAnalysis = Extract<InputAnalysis, { kind: "progression" }>;

/**
 * Голая последовательность: лента схем, своя схема у каждого места в цепочке.
 * Один аккорд может встретиться дважды — поэтому ключ правки «номер:символ».
 */
export function ProgressionView({ chart, analysis }: { chart: Chart; analysis: ProgressionAnalysis }) {
  const title = chart.title || analysis.meta.title || analysis.chords.slice(0, 4).join(" ");
  useDocumentTitle(`${title} — Push diagrams`);
  const [size, setSize] = useState<Size>("M");
  const edits = useChartEdits(chart);
  const [voicings, error] = useMemo(() => solve(() => voiceProgression(analysis.chords.map(parseChord))), [analysis.chords]);
  const [min, max] = CARD_SIZE[size];

  return (
    <PageLayout
      header={
        <PageHeader
          title={title}
          subtitle={chart.artist || analysis.meta.artist}
          actions={
            <>
              <SizeSwitch label="size:" value={size} onChange={setSize} />
              <ChartActions chart={chart} saveFailed={edits.failed} />
            </>
          }
        />
      }
    >
      <PageContent wide>
        <p className={styles.sequence} aria-label="progression">
          {analysis.chords.map((symbol, i) => (
            <Fragment key={i}>
              {i > 0 && " → "}
              <b>{symbol}</b>
            </Fragment>
          ))}
        </p>
        <ColorLegend className={styles.legendBar} />
        <UnknownChords unknown={analysis.unknown} />
        <ErrorNote message={error} />
        <DiagramList layout="grid" aria-label="diagrams" style={cssVars({ "--card-min": `${min}px`, "--card-max": `${max}px` })}>
          {(voicings ?? []).map(({ chord, pads }, i) => {
            const key = `${i}:${chord.symbol}`;
            return <ChordDiagram key={key} chord={chord} pads={pads} saved={edits.saved[key]} onChange={(state) => edits.change(key, state)} />;
          })}
        </DiagramList>
        <footer className={styles.footer}>
          <p>
            Ableton Push grid, <b>Note / Chromatic</b> mode, <b>4ths</b> layout, bottom-left pad is C1. The grid coloring is always the
            same: tonic&nbsp;C + C&nbsp;major scale.
          </p>
          <p>
            Voicings are chosen for the whole chain at once: the solver minimizes hand movement across the grid, so some notes stay on
            the same pad from chord to chord. It never touches the chord&apos;s structure — <b>the root is always in the bass</b>; it only
            plays with the octave and the choice of pad.
          </p>
          <p>The shape always fits in {SOLVER.maxCols} grid columns — one hand takes the chord without stretching sideways.</p>
          <p>
            You can override a diagram by hand: clicking a pale pad moves the voice of the same note there — that&apos;s how you set an
            inversion, and the diagram labels which one you got. Clicking any other pad adds a note outside the chord, in purple. An
            edited diagram gets a dot next to its name, <b>&#10227;</b> restores the solver&apos;s voicing. Edits are saved in this browser.
          </p>
          <p>
            {count(analysis.chords.length, "chord", "chords")}. Chart created {formatDate(chart.created)}
            {chart.updated !== chart.created && `, edited ${formatDate(chart.updated)}`}.
          </p>
        </footer>
      </PageContent>
    </PageLayout>
  );
}
