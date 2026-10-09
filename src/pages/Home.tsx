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
import { ago, plural } from "../view/text";
import { Message } from "./Message";

const EXAMPLE = "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am";

// ------------------------------------------------------------------- поле --

/** Что получится из вставленного текста — одной строкой под полем. */
function Summary({ a }: { a: InputAnalysis }) {
  if (a.kind === "empty") return <span className="sum dim">Вставь последовательность аккордов или текст песни с аккордами.</span>;
  const unk = [...new Set(a.unknown.map((u) => u.sym))];
  const unkNote = unk.length ? (
    <span className="sum-unk">
      {" "}
      · не распознаны: <b>{unk.join(", ")}</b>
    </span>
  ) : null;
  if (a.kind === "progression") {
    const n = a.syms.length;
    return (
      <span className="sum">
        последовательность: <b>{n}</b> {plural(n, "аккорд", "аккорда", "аккордов")}
        {unkNote}
      </span>
    );
  }
  const n = new Set(a.chain).size;
  return (
    <span className="sum">
      текст с аккордами
      {a.sections ? (
        <>
          : <b>{a.sections}</b> {plural(a.sections, "секция", "секции", "секций")}
        </>
      ) : null}
      , схем: <b>{n}</b>
      {a.allChords ? " (под текстом аккордов нет — схемы по проигрышам)" : ""}
      {unkNote}
    </span>
  );
}

/** Почему разобрать нельзя — или пустая строка, если можно. */
function blocker(a: InputAnalysis): string {
  if (a.kind === "empty") return "пусто";
  if (a.kind === "progression") {
    if (a.unknown.length) return "в последовательности есть нераспознанные аккорды — поправь их";
    if (!a.syms.length) return "ни одного аккорда";
    return "";
  }
  return a.chain.length ? "" : "не нашёл ни одного аккорда";
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
  return "Песня";
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
          "Bb Gm Dm C\n\nили текст песни — аккорды над строками:\n\n[Verse 1]\nAm                F\nВечер тихо ходит по крыше\nC                     G\nВетер пишет письма воде"
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="erow">
        <input
          type="text"
          placeholder="название"
          value={title}
          onChange={(e) => {
            touched.current.title = true;
            setTitle(e.target.value);
          }}
        />
        <input
          type="text"
          placeholder="исполнитель"
          value={artist}
          onChange={(e) => {
            touched.current.artist = true;
            setArtist(e.target.value);
          }}
        />
        <button className="pri" disabled={!!block || busy} onClick={submit} title="Ctrl/⌘ + Enter">
          {initial ? "Сохранить" : "Разобрать"}
        </button>
        {!initial ? (
          <button
            onClick={() => {
              setText(EXAMPLE);
              touched.current.title = false;
            }}
          >
            вставить пример
          </button>
        ) : null}
      </div>
      <div className="einfo">
        <Summary a={a} />
        {err ? <span className="st on err"> {err}</span> : null}
      </div>
      <details className="howto">
        <summary>Как писать</summary>
        <p>
          <b>Последовательность</b> — аккорды через пробел, запятую, <code>|</code> или <code>-&gt;</code>:{" "}
          <code>Bb | Gm -&gt; A, Dm</code>. Получится лента схем, аппликатуры подобраны сразу для всей цепочки.
        </p>
        <p>
          <b>Песня</b> — «аккорды над текстом», как на любом сайте с подборами: строка аккордов, под ней строка текста,
          аккорд встаёт над своим слогом. Копипаст с ultimate-guitar или amdm можно вставлять как есть: секции{" "}
          <code>[Verse 1]</code> и <code>Припев:</code>, пометки в скобках, <code>x2</code>, <code>N.C.</code>, звёздочки
          и тактовые черты уберутся сами, <code>H</code> прочитается как <code>B</code>. Схемы строятся по аккордам,
          которые звучат под текстом; интро и проигрыши остаются в тексте.
        </p>
        <p>
          Шапка по желанию: <code>@title:</code>, <code>@artist:</code>, <code>@key:</code>, <code>@bpm:</code>,{" "}
          <code>@capo:</code>, <code>@source:</code>. Строка, начатая с <code>.</code>, — точно аккорды, с{" "}
          <code>|</code> — точно текст.
        </p>
        <p>
          <b>Регистр значим</b>: <code>CM7</code> — большой мажорный, <code>Cm7</code> — малый минорный. Слэш-бас —{" "}
          <code>Am/C</code>, мажор с пониженной квинтой — <code>C(b5)</code> (голое <code>Cb5</code> — это квинта от Cb).
          Понимаются, например: <code>C Cm Cdim Caug Csus2 Csus4 C5 C6 Cm6 C6/9 Cmaj7 Cm7 C7 CmMaj7 Cm7b5 Cdim7 Cadd9
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
      title="удалить"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Удалить ${what} «${name}»?`)) return;
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
        Разборы <span>{analyses.length}</span>
      </h2>
      {analyses.length ? (
        <div className="tiles">
          {analyses.map((it) => {
            const n = it.syms.length;
            let sub = it.artist;
            if (it.kind === "progression") sub = (sub ? sub + " · " : "") + it.syms.slice(0, 9).join(" · ") + (n > 9 ? " …" : "");
            else if (n) sub = (sub ? sub + " · " : "") + `${n} ${plural(n, "схема", "схемы", "схем")}`;
            return (
              <Link className="card" to={`/a/${it.id}`} key={it.id}>
                <b>{it.title}</b>
                <i>{sub}</i>
                <em>{ago(it.updated)}</em>
                <DelButton name={it.title} what="разбор" onDelete={() => deleteAnalysis(it.id).then(reload)} />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">Пока пусто. Вставь аккорды или текст песни в поле выше и нажми «Разобрать».</div>
      )}

      <h2>
        Подборы <span>{picks.length}</span>
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
                  {n} {plural(n, "аккорд", "аккорда", "аккордов")} · {ago(it.updated)}
                </em>
                <DelButton name={it.name} what="подбор" onDelete={() => deletePick(it.id).then(reload)} />
              </Link>
            );
          })}
          <Link className="card new" to="/find">
            + новый подбор
          </Link>
        </div>
      ) : (
        <div className="empty">
          Пока пусто. <Link to="/find">Открыть страницу определения</Link> — накликать аккорд на сетке, добавить в
          подбор и сохранить под именем.
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
    setMsg(`выгружено: ${data.analyses.length} разб., ${data.picks.length} подб.`);
  }

  async function doImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await importAll(JSON.parse(await f.text()));
      setMsg(`загружено: новых ${r.added}, обновлено ${r.updated}, пропущено ${r.skipped}`);
      reload();
    } catch (err) {
      setMsg(`не загрузилось: ${(err as Error).message}`);
    }
  }

  let status: string;
  if (mode === "memory") status = "Хранилище браузера недоступно — разборы живут только до закрытия вкладки.";
  else if (pers === "persisted") status = "Разборы хранятся в этом браузере, постоянно.";
  else if (pers === "best-effort")
    status = "Разборы хранятся в этом браузере. Если место на диске кончится, браузер может их очистить.";
  else status = "Разборы хранятся в этом браузере.";

  return (
    <section className="storage">
      <h2>Хранилище</h2>
      <p>
        {status} Сервера нет: на другом устройстве их не будет — для этого есть бэкап.
      </p>
      <div className="erow">
        {pers === "best-effort" && mode === "idb" ? (
          <button onClick={() => requestPersist().then(setPers)}>попросить хранить постоянно</button>
        ) : null}
        <button onClick={doExport}>выгрузить бэкап</button>
        <button onClick={() => file.current?.click()}>загрузить бэкап</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={doImport} />
        {msg ? <span className="st on">{msg}</span> : null}
      </div>
    </section>
  );
}

// --------------------------------------------------------------- страницы --

export function HomePage() {
  useTitle("Аккорды на Push");
  const { analyses, picks, err, reload } = useLists();
  return (
    <>
      <PageStyle css={HOME_CSS + APP_CSS_HOME} />
      <Header
        title="Аккорды на Push"
        back={null}
        ctl={
          <Link className="btn" to="/find">
            + новый подбор
          </Link>
        }
      />
      <div className="wrap">
        <h2>Новый разбор</h2>
        <Editor />
        {err ? <div className="empty">Хранилище не ответило: {err}</div> : null}
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
  useTitle(rec ? `Правка: ${rec.title}` : "Правка");
  if (rec === undefined) return <Message title="Открываю…" text="" loading />;
  if (rec === null) return <Message title="Нет такого разбора" text="Может быть, он удалён или сохранён в другом браузере." />;
  return (
    <>
      <PageStyle css={HOME_CSS + APP_CSS_HOME} />
      <Header title={`Правка: ${rec.title}`} back={`/a/${rec.id}`} backText="к разбору" />
      <div className="wrap">
        <Editor initial={rec} />
      </div>
    </>
  );
}
