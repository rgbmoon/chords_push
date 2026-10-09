/**
 * Страница разбора (бывшие songpage.py и song.py).
 *
 * В базе лежит только источник и правки человека, поэтому разбор собирается
 * заново при каждом открытии: солвер укладывается в миллисекунды, а схемы
 * никогда не разъедутся с текстом.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isChordSymbol, parseChordSymbol } from "../core/chord";
import { COMPACT } from "../core/data";
import { Grid } from "../core/grid";
import { analyzeInput, InputAnalysis, Unknown } from "../core/importer";
import { buildCards, hasLyrics, Line, splitUnits } from "../core/sheet";
import { voiceProgression } from "../core/voicing";
import { Header, LEGEND_LONG, LEGEND_SHORT, Legend, PageStyle, Sizer, SplitLayout, useTitle } from "../components/Frame";
import { Scheme } from "../components/Scheme";
import { Analysis, deleteAnalysis, getAnalysis, saveAnalysisState, storageMode } from "../store/db";
import { LAYOUT_CSS, SEQ_CSS, SONG_CSS } from "../styles/css";
import { APP_CSS_ANALYSIS } from "../styles/app";
import type { Saved } from "../view/live";
import { schemeModel, SchemeModel } from "../view/scheme";
import { count, fmtDate } from "../view/text";
import { Message } from "./Message";

export function AnalysisPage() {
  const { id = "" } = useParams();
  const [rec, setRec] = useState<Analysis | null | undefined>(undefined);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    setRec(undefined);
    getAnalysis(id)
      .then((r) => live && setRec(r ?? null))
      .catch((e) => live && setErr(String(e?.message || e)));
    return () => {
      live = false;
    };
  }, [id]);

  if (err) return <Message title="Couldn't open" text={`Storage didn't respond: ${err}`} />;
  if (rec === undefined) return <Message title="Opening…" text="" loading />;
  if (rec === null) return <Message title="No such chart" text="It may have been deleted, or saved in another browser." />;
  return <AnalysisView rec={rec} />;
}

/**
 * Правки схем уходят в базу с задержкой 120 мс: перенос голоса и следующий
 * клик складываются в одну запись. Уходя со страницы — дописываем сразу.
 */
function useStateSaver(rec: Analysis) {
  const state = useRef<Record<string, Saved | null>>({ ...rec.state });
  const timer = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(() => {
    timer.current = null;
    saveAnalysisState(rec.id, state.current).then(
      () => setFailed(false),
      () => setFailed(true),
    );
  }, [rec.id]);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const onSave = useCallback(
    (key: string, st: Saved | null) => {
      if (st) state.current[key] = st;
      else delete state.current[key];
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 120);
    },
    [flush],
  );
  return { onSave, failed };
}

/** Ссылка на источник — только http(s): javascript:-ссылку в href не пускаем. */
function safeUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function Toolbar({ rec }: { rec: Analysis }) {
  const nav = useNavigate();
  return (
    <>
      <Link className="btn" to={`/edit/${rec.id}`}>
        edit
      </Link>
      <button
        onClick={async () => {
          if (!confirm(`Delete chart "${rec.title}"?`)) return;
          await deleteAnalysis(rec.id);
          nav("/");
        }}
      >
        delete
      </button>
    </>
  );
}

function Warnings({ unknown }: { unknown: readonly Unknown[] }) {
  if (!unknown.length) return null;
  const syms = [...new Set(unknown.map((u) => u.sym))];
  return (
    <p className="unk-note">
      Not recognized: <b>{syms.join(", ")}</b> — no diagrams for these. The format help on the{" "}
      <Link to="/">home page</Link> lists the spellings it understands.
    </p>
  );
}

function SaveNote({ failed }: { failed: boolean }) {
  const [mode, setMode] = useState<"idb" | "memory">("idb");
  useEffect(() => {
    storageMode().then(setMode);
  }, []);
  if (mode === "memory")
    return <span className="st on err">storage unavailable — edits last until the tab is closed</span>;
  return failed ? <span className="st on err">edit not saved</span> : null;
}

function AnalysisView({ rec }: { rec: Analysis }) {
  const a = useMemo(() => analyzeInput(rec.source), [rec.source]);
  if (a.kind === "empty")
    return <Message title={rec.title} text="No chords found in the source." back={`/edit/${rec.id}`} backText="edit source" />;
  if (a.kind === "progression") return <ProgressionView rec={rec} a={a} />;
  return <SheetView rec={rec} a={a} />;
}

function solve<T>(f: () => T): [T | null, string] {
  try {
    return [f(), ""];
  } catch (e) {
    return [null, String((e as Error).message || e)];
  }
}

// --------------------------------------------------------- песня с текстом --

export function LineView({ line }: { line: Line }) {
  const c = (sym: string) => (
    <span className={isChordSymbol(sym) ? "c" : "c unk"} title={isChordSymbol(sym) ? undefined : "not recognized — no diagram"}>
      {sym}
    </span>
  );
  if (line.kind === "blank") return <div className="blank" />;
  if (line.kind === "lyric") return <div className="line plain">{line.lyric || " "}</div>;
  if (line.kind === "chords")
    return (
      <div className="line only">
        {line.chords.map(([col, sym]) => (
          <span className="u" key={col}>
            {c(sym)}
            <span className="t">{" "}</span>
          </span>
        ))}
      </div>
    );
  return (
    <div className="line">
      {splitUnits(line.lyric, line.chords).map(([sym, text], k) => (
        <span className="u" key={k}>
          {sym === null ? <span className="c">{" "}</span> : c(sym)}
          <span className="t">{text || " "}</span>
        </span>
      ))}
    </div>
  );
}

const SIZES_LYRIC = { S: "15px", M: "clamp(16px,1.4vw,21px)", L: "24px" } as const;

function SheetView({ rec, a }: { rec: Analysis; a: Extract<InputAnalysis, { kind: "sheet" }> }) {
  const { onSave, failed } = useStateSaver(rec);
  const meta = a.meta;
  const title = rec.title || meta.title || "Song";
  const artist = rec.artist || meta.artist || "";
  useTitle(`${title} — lyrics and Push diagrams`);

  const [models, err] = useMemo(
    () =>
      solve(() => {
        const grid = new Grid();
        return buildCards(grid, a.chain).map((c) => schemeModel(grid, c.spec, c.overlay, c.symbol, c.symbol));
      }),
    [a.chain],
  );

  const chips: ReactNode[] = [];
  if (meta.key) chips.push(<span key="k">key <b>{meta.key}</b></span>);
  if (meta.capo) chips.push(<span key="c">capo <b>{meta.capo}</b></span>);
  if (meta.bpm) chips.push(<span key="b"><b>{meta.bpm}</b> BPM</span>);

  const src = safeUrl(meta.source);
  const footer = (
    <footer>
      <Legend items={LEGEND_SHORT} />
      <div className="facts">
        <span>
          diagrams: <b>{(models ?? []).map((m) => m.title).join(", ")}</b>
        </span>
        {a.skipped.length ? <span>no diagrams: {a.skipped.join(", ")}</span> : null}
        {src ? (
          <span>
            <a href={src} target="_blank" rel="noopener noreferrer">
              source
            </a>
          </span>
        ) : null}
      </div>
      <Warnings unknown={a.unknown} />
      Ableton Push grid, <b>Note / Chromatic</b> mode, <b>4ths</b> layout, bottom-left pad is C1. The grid coloring
      is always the same: tonic&nbsp;C + C&nbsp;major scale.
      <br />
      One diagram per chord of the song. The solver picked voicings not for each chord on its own but for the whole
      verse chain, so neighboring chords share pads. The structure is untouched — <b>the root is always in the
      bass</b>.
      <br />
      The shape always fits in {COMPACT.max_cols} grid columns — one hand takes the chord without stretching sideways.
      A triad is never narrower than four columns; sus chords fit in three.
      <br />
      The diagram isn&apos;t fixed. Clicking a pale pad moves the voice of the same note there — that&apos;s how you
      set an inversion by hand, and the diagram labels which one you got. Clicking any other pad adds a note outside
      the chord, in purple. An edited diagram gets a dot next to its name, <b>&#10227;</b> restores the solver&apos;s
      voicing. Edits are saved on every click — in this browser — and next time the diagram comes back the way you
      left it.
      <br />
      {a.allChords
        ? "There are no chords under the lyrics, so diagrams are built for all chords, including instrumental parts."
        : "Sections without lyrics (intro, interludes, outro) stay in the text but get no diagrams."}
      <br />
      Chart created {fmtDate(rec.created)}
      {rec.updated !== rec.created ? `, edited ${fmtDate(rec.updated)}` : ""}.
    </footer>
  );

  return (
    <>
      <PageStyle css={LAYOUT_CSS + SONG_CSS + APP_CSS_ANALYSIS} />
      <Header
        title={title}
        subtitle={artist}
        chips={chips.length ? chips : undefined}
        ctl={
          <>
            <SaveNote failed={failed} />
            <Sizer
              label="text:"
              vars={["--lyric"]}
              apply={(s) => document.documentElement.style.setProperty("--lyric", SIZES_LYRIC[s])}
            />
            <Toolbar rec={rec} />
          </>
        }
      />
      <SplitLayout
        left={
          <main className="pane sheet">
            {a.song.sections
              .filter((sec) => sec.lines.length)
              .map((sec, k) => (
                <section className={hasLyrics(sec) ? "sec" : "sec instr"} key={k}>
                  {sec.title ? <h2>{sec.title}</h2> : null}
                  {sec.lines.map((l, j) => (
                    <LineView line={l} key={j} />
                  ))}
                </section>
              ))}
            {footer}
          </main>
        }
        right={
          <aside className="pane side">
            {err ? <p className="unk-note">{err}</p> : null}
            <div className="cards">
              {(models ?? []).map((m) => (
                <Scheme key={m.key} model={m} saved={rec.state[m.key]} onSave={onSave} />
              ))}
            </div>
          </aside>
        }
      />
    </>
  );
}

// ------------------------------------------------- голая последовательность --

const SIZES_CARDS = { S: [320, 340], M: [400, 430], L: [540, 580] } as const;

function ProgressionView({ rec, a }: { rec: Analysis; a: Extract<InputAnalysis, { kind: "progression" }> }) {
  const { onSave, failed } = useStateSaver(rec);
  const title = rec.title || a.meta.title || a.syms.slice(0, 4).join(" ");
  useTitle(`${title} — Push diagrams`);

  const [models, err] = useMemo(
    () =>
      solve<SchemeModel[]>(() => {
        const grid = new Grid();
        // у последовательности один и тот же аккорд может встретиться дважды —
        // схема своя у каждого места, поэтому ключ хранилища — «номер:символ»
        return voiceProgression(grid, a.syms.map(parseChordSymbol), { compact: true }).map((v, i) =>
          schemeModel(grid, v.spec, v.overlay, v.spec.symbol, `${i}:${v.spec.symbol}`),
        );
      }),
    [a.syms],
  );

  return (
    <>
      <PageStyle css={SEQ_CSS + APP_CSS_ANALYSIS} />
      <Header
        title={title}
        subtitle={rec.artist || a.meta.artist}
        ctl={
          <>
            <SaveNote failed={failed} />
            <Sizer
              label="size:"
              vars={["--card-min", "--card-max"]}
              apply={(s) => {
                document.documentElement.style.setProperty("--card-min", SIZES_CARDS[s][0] + "px");
                document.documentElement.style.setProperty("--card-max", SIZES_CARDS[s][1] + "px");
              }}
            />
            <Toolbar rec={rec} />
          </>
        }
      />
      <div className="wrap">
        <p className="seq">
          {a.syms.map((s, i) => (
            <span key={i}>
              {i ? " → " : ""}
              <b>{s}</b>
            </span>
          ))}
        </p>
        <div className="bar">
          <Legend items={LEGEND_LONG} />
        </div>
        <Warnings unknown={a.unknown} />
        {err ? <p className="unk-note">{err}</p> : null}
        <div className="cards">
          {(models ?? []).map((m) => (
            <Scheme key={m.key} model={m} saved={rec.state[m.key]} onSave={onSave} />
          ))}
        </div>
        <footer>
          Ableton Push grid, <b>Note / Chromatic</b> mode, <b>4ths</b> layout, bottom-left pad is C1. The grid
          coloring is always the same: tonic&nbsp;C + C&nbsp;major scale.
          <br />
          Voicings are chosen for the whole chain at once: the solver minimizes hand movement across the grid, so some
          notes stay on the same pad from chord to chord. It never touches the chord&apos;s structure —{" "}
          <b>the root is always in the bass</b>; it only plays with the octave and the choice of pad.
          <br />
          The shape always fits in {COMPACT.max_cols} grid columns — one hand takes the chord without stretching
          sideways.
          <br />
          You can override a diagram by hand: clicking a pale pad moves the voice of the same note there — that&apos;s
          how you set an inversion, and the diagram labels which one you got. Clicking any other pad adds a note outside
          the chord, in purple. An edited diagram gets a dot next to its name, <b>&#10227;</b> restores the
          solver&apos;s voicing. Edits are saved in this browser.
          <br />
          {count(a.syms.length, "chord", "chords")}. Chart created {fmtDate(rec.created)}
          {rec.updated !== rec.created ? `, edited ${fmtDate(rec.updated)}` : ""}.
        </footer>
      </div>
    </>
  );
}
