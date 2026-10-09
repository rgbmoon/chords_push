import { useMemo, useState } from "react";
import { PageHeader, PageLayout, SplitPane } from "../../../components/layout";
import { ChordDiagram, ColorLegend, DiagramList } from "../../../components/music";
import { Size, SizeSwitch } from "../../../components/ui";
import { SOLVER } from "../../../core/grid/voicing";
import type { InputAnalysis } from "../../../core/sheet/analyze";
import { hasLyrics } from "../../../core/sheet/sheet";
import { songDiagrams } from "../../../core/sheet/songDiagrams";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import type { Chart } from "../../../storage";
import { cssVars } from "../../../utils/cssVars";
import { formatDate } from "../../../utils/format";
import { safeHttpUrl } from "../../../utils/url";
import { useChartEdits } from "../hooks/useChartEdits";
import { solve } from "../lib/solve";
import { ChartActions } from "./ChartActions";
import { LyricLine } from "./LyricLine";
import styles from "./SheetView.module.scss";
import { ErrorNote, UnknownChords } from "./UnknownChords";

const LYRIC_SIZE: Record<Size, string> = { S: "15px", M: "clamp(16px, 1.4vw, 21px)", L: "24px" };
const ASIDE_MIN = 315 + 26; // одна схема и отступы

type SheetAnalysis = Extract<InputAnalysis, { kind: "sheet" }>;

/** Песня: текст слева, схемы справа — по одной на уникальный аккорд. */
export function SheetView({ chart, analysis }: { chart: Chart; analysis: SheetAnalysis }) {
  const { meta, song } = analysis;
  const title = chart.title || meta.title || "Song";
  useDocumentTitle(`${title} — lyrics and Push diagrams`);
  const [size, setSize] = useState<Size>("M");
  const edits = useChartEdits(chart);
  const [diagrams, error] = useMemo(() => solve(() => songDiagrams(analysis.chords)), [analysis.chords]);

  const facts = [
    meta.key && <span key="key">key <b>{meta.key}</b></span>,
    meta.capo && <span key="capo">capo <b>{meta.capo}</b></span>,
    meta.bpm && <span key="bpm"><b>{meta.bpm}</b> BPM</span>,
  ].filter(Boolean);

  return (
    <PageLayout
      variant="fixed"
      style={cssVars({ "--lyric-size": LYRIC_SIZE[size] })}
      header={
        <PageHeader
          title={title}
          subtitle={chart.artist || meta.artist}
          facts={facts.length > 0 && facts}
          actions={
            <>
              <SizeSwitch label="text:" value={size} onChange={setSize} />
              <ChartActions chart={chart} saveFailed={edits.failed} />
            </>
          }
        />
      }
    >
      <SplitPane
        mobile="asideFirst"
        minAside={ASIDE_MIN}
        main={
          <div className={styles.sheet}>
            {song.sections.map((section, i) => (
              <section key={i} className={styles.section} data-instrumental={!hasLyrics(section) || undefined}>
                {section.title && <h2 className={styles.sectionTitle}>{section.title}</h2>}
                {section.lines.map((line, j) => (
                  <LyricLine key={j} line={line} />
                ))}
              </section>
            ))}
            <SheetFooter chart={chart} analysis={analysis} diagramChords={(diagrams ?? []).map((d) => d.chord.symbol)} />
          </div>
        }
        aside={
          <div className={styles.aside}>
            <ErrorNote message={error} />
            <DiagramList aria-label="diagrams">
              {(diagrams ?? []).map(({ chord, pads }) => (
                <ChordDiagram
                  key={chord.symbol}
                  chord={chord}
                  pads={pads}
                  saved={edits.saved[chord.symbol]}
                  onChange={(state) => edits.change(chord.symbol, state)}
                />
              ))}
            </DiagramList>
          </div>
        }
      />
    </PageLayout>
  );
}

function SheetFooter({ chart, analysis, diagramChords }: { chart: Chart; analysis: SheetAnalysis; diagramChords: string[] }) {
  const source = safeHttpUrl(analysis.meta.source);
  return (
    <footer className={styles.footer}>
      <ColorLegend variant="short" className={styles.legend} />
      <div className={styles.facts}>
        <span>
          diagrams: <b>{diagramChords.join(", ")}</b>
        </span>
        {analysis.withoutDiagrams.length > 0 && <span>no diagrams: {analysis.withoutDiagrams.join(", ")}</span>}
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer">
            source
          </a>
        )}
      </div>
      <UnknownChords unknown={analysis.unknown} />
      <p>
        Ableton Push grid, <b>Note / Chromatic</b> mode, <b>4ths</b> layout, bottom-left pad is C1. The grid coloring is always the same:
        tonic&nbsp;C + C&nbsp;major scale.
      </p>
      <p>
        One diagram per chord of the song. The solver picked voicings not for each chord on its own but for the whole chain, so
        neighboring chords share pads. The structure is untouched — <b>the root is always in the bass</b>.
      </p>
      <p>
        The shape always fits in {SOLVER.maxCols} grid columns — one hand takes the chord without stretching sideways. A triad is never
        narrower than four columns; sus chords fit in three.
      </p>
      <p>
        The diagram isn&apos;t fixed. Clicking a pale pad moves the voice of the same note there — that&apos;s how you set an inversion by
        hand, and the diagram labels which one you got. Clicking any other pad adds a note outside the chord, in purple. An edited
        diagram gets a dot next to its name, <b>&#10227;</b> restores the solver&apos;s voicing. Edits are saved on every click — in this
        browser — and next time the diagram comes back the way you left it.
      </p>
      <p>
        {analysis.fromInstrumental
          ? "There are no chords under the lyrics, so diagrams are built for all chords, including instrumental parts."
          : "Sections without lyrics (intro, interludes, outro) stay in the text but get no diagrams."}
      </p>
      <p>
        Chart created {formatDate(chart.created)}
        {chart.updated !== chart.created && `, edited ${formatDate(chart.updated)}`}.
      </p>
    </footer>
  );
}
