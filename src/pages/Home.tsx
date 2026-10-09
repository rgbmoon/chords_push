/**
 * Главная: поле для нового разбора, разборы, подборы и хранилище.
 * Плитки — бывший homepage.py; поле ввода и хранилище — новое.
 */
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { parseChordSymbol } from "../core/chord";
import { Grid } from "../core/grid";
import { analyzeInput, InputAnalysis } from "../core/importer";
import { buildCards } from "../core/sheet";
import { voiceProgression } from "../core/voicing";
import { Header, PageStyle, useTitle } from "../components/Frame";
import {
  Analysis,
  deleteAnalysis,
  deletePick,
  exportAll,
  getAnalysis,
  importAll,
  listAnalyses,
  listPicks,
  persistence,
  Persistence,
  Pick,
  requestPersist,
  saveAnalysis,
  storageMode,
} from "../store/db";
import { APP_CSS_HOME } from "../styles/app";
import { HOME_CSS } from "../styles/css";
import { ago, count, plural } from "../view/text";
import { Message } from "./Message";

const EXAMPLE = "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am";

// ------------------------------------------------------------------- поле --

/** Что получится из вставленного текста — одной строкой под полем. */
function Summary({ a }: { a: InputAnalysis }) {
  if (a.kind === "empty") return <span className="sum dim">Paste a chord progression or song lyrics with chords.</span>;
  const unk = [...new Set(a.unknown.map((u) => u.sym))];
  const unkNote = unk.length ? (
    <span className="sum-unk">
      {" "}
      · not recognized: <b>{unk.join(", ")}</b>
    </span>
  ) : null;
  if (a.kind === "progression") {
    const n = a.syms.length;
    return (
      <span className="sum">
        progression: <b>{n}</b> {plural(n, "chord", "chords")}
        {unkNote}
      </span>
    );
  }
  const n = new Set(a.chain).size;
  return (
    <span className="sum">
      lyrics with chords
      {a.sections ? (
        <>
          : <b>{a.sections}</b> {plural(a.sections, "section", "sections")}
        </>
      ) : null}
      , diagrams: <b>{n}</b>
      {a.allChords ? " (no chords under the lyrics — diagrams from instrumental parts)" : ""}
      {unkNote}
    </span>
  );
}

/** Почему разобрать нельзя — или пустая строка, если можно. */
function blocker(a: InputAnalysis): string {
  if (a.kind === "empty") return "nothing to read";
  if (a.kind === "progression") {
    if (a.unknown.length) return "the progression has unrecognized chords — fix them first";
    if (!a.syms.length) return "no chords";
    return "";
  }
  return a.chain.length ? "" : "no chords found";
}

/** Первая строка текста — название по умолчанию, чтобы плитки не были одинаковыми. */
function defaultTitle(a: InputAnalysis): string {
  if (a.kind === "progression") return a.syms.slice(0, 4).join(" ");
  if (a.kind === "sheet") {
    for (const s of a.song.sections)
      for (const l of s.lines)
        if ((l.kind === "lyric" || l.kind === "pair") && l.lyric.trim()) {
          const t = l.lyric.trim();
          return t.length > 40 ? t.slice(0, 39) + "…" : t;
        }
  }
  return "Song";
}

export function Editor({ initial }: { initial?: Analysis }) {
  const nav = useNavigate();
  const [text, setText] = useState(initial?.source ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [artist, setArtist] = useState(initial?.artist ?? "");
  const touched = useRef({ title: !!initial, artist: !!initial });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const a = useMemo(() => analyzeInput(text), [text]);
  const block = blocker(a);

  // шапка источника (@title, @artist) заполняет поля, пока человек их не трогал
  useEffect(() => {
    if (!touched.current.title) setTitle(a.meta.title ?? "");
    if (!touched.current.artist) setArtist(a.meta.artist ?? "");
  }, [a.meta.title, a.meta.artist]);

  async function submit() {
    setErr("");
    if (block) return setErr(block);
    // аккорд, который не влезает в сетку, лучше поймать до сохранения
    try {
      const g = new Grid();
      if (a.kind === "progression") voiceProgression(g, a.syms.map(parseChordSymbol));
      else if (a.kind === "sheet") buildCards(g, a.chain);
    } catch (e) {
      return setErr(String((e as Error).message || e));
    }
    setBusy(true);
    try {
      const rec = await saveAnalysis({
        id: initial?.id,
        kind: a.kind === "progression" ? "progression" : "sheet",
        title: title.trim() || defaultTitle(a),
        artist: artist.trim(),
        source: text,
        syms: a.kind === "progression" ? a.syms : a.kind === "sheet" ? [...new Set(a.chain)] : [],
      });
      requestPersist(); // первое сохранение — самое время попросить браузер не чистить базу
      nav(`/a/${rec.id}`);
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  }

  return (
    <section className="editor">
      <textarea
        value={text}
        spellCheck={false}
        placeholder={
          "Bb Gm Dm C\n\nor song lyrics with chords above the lines:\n\n[Verse 1]\nAm                F\nEvening walks across the rooftops\nC                     G\nWind is writing letters to the sea"
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="erow">
        <input
          type="text"
          placeholder="title"
          value={title}
          onChange={(e) => {
            touched.current.title = true;
            setTitle(e.target.value);
          }}
        />
        <input
          type="text"
          placeholder="artist"
          value={artist}
          onChange={(e) => {
            touched.current.artist = true;
            setArtist(e.target.value);
          }}
        />
        <button className="pri" disabled={!!block || busy} onClick={submit} title="Ctrl/⌘ + Enter">
          {initial ? "Save" : "Create chart"}
        </button>
        {!initial ? (
          <button
            onClick={() => {
              setText(EXAMPLE);
              touched.current.title = false;
            }}
          >
            insert example
          </button>
        ) : null}
      </div>
      <div className="einfo">
        <Summary a={a} />
        {err ? <span className="st on err"> {err}</span> : null}
      </div>
      <details className="howto">
        <summary>Format help</summary>
        <p>
          <b>Progression</b> — chords separated by spaces, commas, <code>|</code> or <code>-&gt;</code>:{" "}
          <code>Bb | Gm -&gt; A, Dm</code>. You get a strip of diagrams, with voicings chosen for the whole chain at
          once.
        </p>
        <p>
          <b>Song</b> — &ldquo;chords over lyrics&rdquo;, like on any chords site: a line of chords, a line of lyrics
          under it, and each chord sits over its syllable. Paste from ultimate-guitar or similar sites as is: sections
          like <code>[Verse 1]</code> or <code>Chorus:</code>, notes in brackets, <code>x2</code>, <code>N.C.</code>,
          asterisks and bar lines are cleaned up automatically, and <code>H</code> is read as <code>B</code>. Diagrams
          are built for the chords played under the lyrics; intros and interludes stay in the text.
        </p>
        <p>
          Optional header: <code>@title:</code>, <code>@artist:</code>, <code>@key:</code>, <code>@bpm:</code>,{" "}
          <code>@capo:</code>, <code>@source:</code>. A line starting with <code>.</code> is always chords, one starting
          with <code>|</code> is always lyrics.
        </p>
        <p>
          <b>Case matters</b>: <code>CM7</code> is major seventh, <code>Cm7</code> is minor seventh. Slash bass —{" "}
          <code>Am/C</code>; major flat five — <code>C(b5)</code> (a bare <code>Cb5</code> is a power chord on Cb).
          Understood, for example: <code>C Cm Cdim Caug Csus2 Csus4 C5 C6 Cm6 C6/9 Cmaj7 Cm7 C7 CmMaj7 Cm7b5 Cdim7 Cadd9
          Cmaj9 Cm9 C9 C7b9 C7#9 C11 Cm11 C13 C7alt</code>.
        </p>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- плитки --

function useLists() {
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(() => {
    Promise.all([listAnalyses(), listPicks()]).then(
      ([a, p]) => {
        setAnalyses(a);
        setPicks(p);
      },
      (e) => setErr(String(e?.message || e)),
    );
  }, []);
  useEffect(reload, [reload]);
  return { analyses, picks, err, reload };
}

function DelButton({ name, what, onDelete }: { name: string; what: string; onDelete: () => Promise<void> }) {
  return (
    <button
      className="x"
      title="delete"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Delete ${what} "${name}"?`)) return;
        await onDelete();
      }}
    >
      &times;
    </button>
  );
}

function Tiles({ analyses, picks, reload }: { analyses: Analysis[]; picks: Pick[]; reload: () => void }) {
  return (
    <>
      <h2>
        Charts <span>{analyses.length}</span>
      </h2>
      {analyses.length ? (
        <div className="tiles">
          {analyses.map((it) => {
            const n = it.syms.length;
            let sub = it.artist;
            if (it.kind === "progression") sub = (sub ? sub + " · " : "") + it.syms.slice(0, 9).join(" · ") + (n > 9 ? " …" : "");
            else if (n) sub = (sub ? sub + " · " : "") + count(n, "diagram", "diagrams");
            return (
              <Link className="card" to={`/a/${it.id}`} key={it.id}>
                <b>{it.title}</b>
                <i>{sub}</i>
                <em>{ago(it.updated)}</em>
                <DelButton name={it.title} what="chart" onDelete={() => deleteAnalysis(it.id).then(reload)} />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">Nothing yet. Paste chords or lyrics into the box above and press “Create chart”.</div>
      )}

      <h2>
        Collections <span>{picks.length}</span>
      </h2>
      {picks.length ? (
        <div className="tiles">
          {picks.map((it) => {
            const n = it.chords.length;
            // на карточке видно саму цепочку, а не только счёт —
            // по названию «проба 3» через неделю не вспомнить, что внутри
            const syms = it.chords.slice(0, 9).map((c) => c.sym || "?");
            return (
              <Link className="card" to={`/find/${it.id}`} key={it.id}>
                <b>{it.name}</b>
                <i>{syms.join(" · ") + (n > syms.length ? " …" : "")}</i>
                <em>
                  {count(n, "chord", "chords")} · {ago(it.updated)}
                </em>
                <DelButton name={it.name} what="collection" onDelete={() => deletePick(it.id).then(reload)} />
              </Link>
            );
          })}
          <Link className="card new" to="/find">
            + new collection
          </Link>
        </div>
      ) : (
        <div className="empty">
          Nothing yet. <Link to="/find">Open the chord finder</Link> — click a chord on the grid, add it to a collection
          and save it under a name.
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------- хранилище --

function Storage({ reload }: { reload: () => void }) {
  const [mode, setMode] = useState<"idb" | "memory" | null>(null);
  const [pers, setPers] = useState<Persistence | null>(null);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storageMode().then(setMode);
    persistence().then(setPers);
  }, []);

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chords-push-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(`exported: ${count(data.analyses.length, "chart", "charts")}, ${count(data.picks.length, "collection", "collections")}`);
  }

  async function doImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await importAll(JSON.parse(await f.text()));
      setMsg(`imported: ${r.added} new, ${r.updated} updated, ${r.skipped} skipped`);
      reload();
    } catch (err) {
      setMsg(`import failed: ${(err as Error).message}`);
    }
  }

  let status: string;
  if (mode === "memory") status = "Browser storage is unavailable — charts only last until the tab is closed.";
  else if (pers === "persisted") status = "Charts are stored in this browser, permanently.";
  else if (pers === "best-effort")
    status = "Charts are stored in this browser. If the disk runs out of space, the browser may clear them.";
  else status = "Charts are stored in this browser.";

  return (
    <section className="storage">
      <h2>Storage</h2>
      <p>
        {status} There is no server: they won't be on your other devices — that's what the backup is for.
      </p>
      <div className="erow">
        {pers === "best-effort" && mode === "idb" ? (
          <button onClick={() => requestPersist().then(setPers)}>ask to keep permanently</button>
        ) : null}
        <button onClick={doExport}>export backup</button>
        <button onClick={() => file.current?.click()}>import backup</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={doImport} />
        {msg ? <span className="st on">{msg}</span> : null}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- страницы --

export function HomePage() {
  useTitle("Chords on Push");
  const { analyses, picks, err, reload } = useLists();
  return (
    <>
      <PageStyle css={HOME_CSS + APP_CSS_HOME} />
      <Header
        title="Chords on Push"
        back={null}
        ctl={
          <Link className="btn" to="/find">
            + new collection
          </Link>
        }
      />
      <div className="wrap">
        <h2>New chart</h2>
        <Editor />
        {err ? <div className="empty">Storage didn't respond: {err}</div> : null}
        {analyses && picks ? <Tiles analyses={analyses} picks={picks} reload={reload} /> : null}
        <Storage reload={reload} />
      </div>
    </>
  );
}

export function EditPage() {
  const { id = "" } = useParams();
  const [rec, setRec] = useState<Analysis | null | undefined>(undefined);
  useEffect(() => {
    getAnalysis(id).then(
      (r) => setRec(r ?? null),
      () => setRec(null),
    );
  }, [id]);
  useTitle(rec ? `Edit: ${rec.title}` : "Edit");
  if (rec === undefined) return <Message title="Opening…" text="" loading />;
  if (rec === null) return <Message title="No such chart" text="It may have been deleted, or saved in another browser." />;
  return (
    <>
      <PageStyle css={HOME_CSS + APP_CSS_HOME} />
      <Header title={`Edit: ${rec.title}`} back={`/a/${rec.id}`} backText="back to chart" />
      <div className="wrap">
        <Editor initial={rec} />
      </div>
    </>
  );
}
