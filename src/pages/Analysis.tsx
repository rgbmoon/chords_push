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
import { fmtDate, plural } from "../view/text";
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

  if (err) return <Message title="Не открылось" text={`Хранилище не ответило: ${err}`} />;
  if (rec === undefined) return <Message title="Открываю…" text="" loading />;
  if (rec === null) return <Message title="Нет такого разбора" text="Может быть, он удалён или сохранён в другом браузере." />;
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
        править
      </Link>
      <button
        onClick={async () => {
          if (!confirm(`Удалить разбор «${rec.title}»?`)) return;
          await deleteAnalysis(rec.id);
          nav("/");
        }}
      >
        удалить
      </button>
    </>
  );
}

function Warnings({ unknown }: { unknown: readonly Unknown[] }) {
  if (!unknown.length) return null;
  const syms = [...new Set(unknown.map((u) => u.sym))];
  return (
    <p className="unk-note">
      Не распознаны: <b>{syms.join(", ")}</b> — схем для них нет. Как писать аккорды, чтобы их узнавало, —
      в подсказке на <Link to="/">главной</Link>.
    </p>
  );
}

function SaveNote({ failed }: { failed: boolean }) {
  const [mode, setMode] = useState<"idb" | "memory">("idb");
  useEffect(() => {
    storageMode().then(setMode);
  }, []);
  if (mode === "memory")
    return <span className="st on err">хранилище недоступно — правки живут до закрытия вкладки</span>;
  return failed ? <span className="st on err">правка не сохранилась</span> : null;
}

function AnalysisView({ rec }: { rec: Analysis }) {
  const a = useMemo(() => analyzeInput(rec.source), [rec.source]);
  if (a.kind === "empty")
    return <Message title={rec.title} text="В источнике не нашлось ни одного аккорда." back={`/edit/${rec.id}`} backText="править источник" />;
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
    <span className={isChordSymbol(sym) ? "c" : "c unk"} title={isChordSymbol(sym) ? undefined : "не распознан — схемы нет"}>
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
  const title = rec.title || meta.title || "Песня";
  const artist = rec.artist || meta.artist || "";
  useTitle(`${title} — текст и схемы для Push`);

  const [models, err] = useMemo(
    () =>
      solve(() => {
        const grid = new Grid();
        return buildCards(grid, a.chain).map((c) => schemeModel(grid, c.spec, c.overlay, c.symbol, c.symbol));
      }),
    [a.chain],
  );

  const chips: ReactNode[] = [];
  if (meta.key) chips.push(<span key="k">тональность <b>{meta.key}</b></span>);
  if (meta.capo) chips.push(<span key="c">каподастр <b>{meta.capo}</b></span>);
  if (meta.bpm) chips.push(<span key="b"><b>{meta.bpm}</b> BPM</span>);

  const src = safeUrl(meta.source);
  const footer = (
    <footer>
      <Legend items={LEGEND_SHORT} />
      <div className="facts">
        <span>
          схемы: <b>{(models ?? []).map((m) => m.title).join(", ")}</b>
        </span>
        {a.skipped.length ? <span>без схем: {a.skipped.join(", ")}</span> : null}
        {src ? (
          <span>
            <a href={src} target="_blank" rel="noopener noreferrer">
              источник
            </a>
          </span>
        ) : null}
      </div>
      <Warnings unknown={a.unknown} />
      Сетка Ableton Push, режим <b>Note / Chromatic</b>, раскладка <b>4ths</b>, нижний левый пэд — C1. Раскраска сетки
      всегда одна: тоника&nbsp;C + гамма&nbsp;C&nbsp;major.
      <br />
      Одна схема — один аккорд песни. Аппликатуру солвер выбирал не для аккорда в отдельности, а для всей цепочки
      куплета, поэтому соседние аккорды делят пэды. Структура при этом не тронута — <b>рут всегда в басу</b>.
      <br />
      Фигура всегда держится в {COMPACT.max_cols} колонках грида — такой аккорд берётся одной рукой, не разъезжаясь
      вбок. Трезвучие уже четырёх колонок не бывает, sus-аккорды ложатся в три.
      <br />
      Схема не приколочена. Клик по бледному пэду переносит на него голос той же ноты — так руками задаётся обращение,
      и схема подписывает, какое получилось. Клик по любому другому пэду добавляет ноту не из аккорда, фиолетовым.
      Изменённая схема помечается точкой у имени, <b>&#10227;</b> возвращает аппликатуру солвера. Правки сохраняются
      сразу по клику — в этом браузере, и при следующем открытии схема встаёт так, как ты её оставил.
      <br />
      {a.allChords
        ? "Под текстом аккордов нет, поэтому схемы построены по всем аккордам, включая проигрыши."
        : "Секции без текста (интро, проигрыши, аутро) оставлены в тексте, но схемы по ним не строятся."}
      <br />
      Разбор создан {fmtDate(rec.created)}
      {rec.updated !== rec.created ? `, изменён ${fmtDate(rec.updated)}` : ""}.
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
              label="текст:"
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
  useTitle(`${title} — схемы для Push`);

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
              label="размер:"
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
          Сетка Ableton Push, режим <b>Note / Chromatic</b>, раскладка <b>4ths</b>, нижний левый пэд — C1. Раскраска
          сетки всегда одна: тоника&nbsp;C + гамма&nbsp;C&nbsp;major.
          <br />
          Аппликатуры подобраны сразу для всей цепочки: солвер минимизирует сдвиг руки по гриду, поэтому часть нот
          переходит из аккорда в аккорд не сходя с пэда. Структуру аккорда он при этом не трогает —{" "}
          <b>рут всегда в басу</b>, играет только октавой и выбором пэда.
          <br />
          Фигура всегда держится в {COMPACT.max_cols} колонках грида — такой аккорд берётся одной рукой, не разъезжаясь
          вбок.
          <br />
          Схему можно переопределить руками: клик по бледному пэду переносит на него голос той же ноты — так задаётся
          обращение, и схема подписывает, какое получилось. Клик по любому другому пэду добавляет ноту не из аккорда,
          фиолетовым. Изменённая схема помечается точкой у имени, <b>&#10227;</b> возвращает аппликатуру солвера. Правки
          сохраняются в этом браузере.
          <br />
          {a.syms.length} {plural(a.syms.length, "аккорд", "аккорда", "аккордов")}. Разбор создан {fmtDate(rec.created)}
          {rec.updated !== rec.created ? `, изменён ${fmtDate(rec.updated)}` : ""}.
        </footer>
      </div>
    </>
  );
}
