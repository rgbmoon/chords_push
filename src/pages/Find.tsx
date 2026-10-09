/**
 * Определение аккорда: слева сетка, справа собранный подбор (бывший findpage.py).
 *
 * Сетка тут живая и пустая: кликается ЛЮБОЙ пэд, а не только ноты заранее
 * заданного аккорда. Что получилось, считает identify() — прямо в браузере:
 * символ, ступени для всех 12 классов высот и правильную запись нот.
 *
 * Схема в подборе — та же самая карточка, что схема в песне: одна разметка
 * пэдов (Pads), один CSS, просто подписи проставляет эта страница.
 *
 * Рут называет человек, а не алгоритм: первый нажатый пэд — рут, от него
 * строится аккорд. Те же ноты, начатые с A, — Am7; начатые с C — C6/A.
 */
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Grid } from "../core/grid";
import { Candidate, enrich, identify, MAX_NOTES, padsToMidi } from "../core/identify";
import { floorDiv } from "../core/py";
import { ordinal } from "../core/voicing";
import { Header, PageStyle, SplitLayout, useTitle } from "../components/Frame";
import { PadRender, Pads } from "../components/Pads";
import { getPick, savePick } from "../store/db";
import { FIND_CSS, LAYOUT_CSS } from "../styles/css";
import { padMidi as midi } from "../view/live";
import { domOrder } from "../view/scheme";
import { count } from "../view/text";
import { Message } from "./Message";

const GRID = new Grid();
const oct = (m: number) => floorDiv(m, 12) - 2;
const byM = (a: number, b: number) => midi(a) - midi(b);

// имя ноты по умолчанию у каждого пэда — сетки все одинаковые
const ORDER = domOrder(GRID);
const NAME: Record<number, string> = {};
const PCNAME: Record<number, string> = {};
for (const p of ORDER) {
  NAME[p] = GRID.noteName(p);
  PCNAME[midi(p) % 12] = NAME[p];
}

/** Что нужно, чтобы раскрасить сетку: и большую, и каждую карточку подбора. */
interface Paint {
  pads: number[];
  sym?: string | null;
  root_pc: number | null;
  degrees: Record<string, string>;
  spelling: Record<string, string>;
  padDeg?: Record<string, string>;
}

/** Аккорд подбора: выбор человека плюс пересчитанные ступени и запись нот. */
interface Item extends Paint {
  sym: string;
  kind: string;
  root: number;
}

const known = (st: Paint) => !!(st && st.spelling && Object.keys(st.spelling).length);
const inChord = (st: Paint, pc: number) => known(st) && st.spelling[pc] !== undefined;

/**
 * ОДНА функция раскрашивает и большую сетку, и каждую карточку подбора:
 * ноты аккорда голубые, рут зелёный, всё, чего в аккорде нет, — фиолетовое,
 * ровно как в схемах песни.
 */
function paint(st: Paint, ghosts: boolean): PadRender[] {
  const on = new Set(st.pads);
  const pcs = new Set(st.pads.map((p) => midi(p) % 12));
  return ORDER.map((i) => {
    const pc = midi(i) % 12;
    const sel = on.has(i);
    const mine = inChord(st, pc);
    const isOn = sel && (mine || !known(st));
    const isEx = sel && !isOn;
    const gh = ghosts && !sel && pcs.has(pc) && mine;
    const cls = ["p", "b-" + GRID.state(i)];
    if (isOn) cls.push("on");
    if (isEx) cls.push("ex");
    if (gh) cls.push("gh");
    if ((isOn || gh) && st.root_pc !== null && pc === st.root_pc) cls.push("rt");
    // Ступень пишем всем пэдам, а не только выбранным: под курсором её
    // раскрывает CSS, и тогда видно, чем нота станет в этом аккорде.
    // Нота аккорда говорит на языке аккорда, всё остальное меряется от рута
    // по реальному расстоянию — пэд октавой выше это 9, а не 2.
    const deg = mine ? st.degrees[pc] || "" : (st.padDeg ?? {})[i] || (known(st) ? st.degrees[pc] || "" : "");
    return { p: i, cls: cls.join(" "), name: (known(st) && st.spelling[pc]) || NAME[i], deg, dataName: true };
  });
}

/** Ноты и ступени под сеткой — одни и те же и в карточке, и в разборе. */
function parts(st: Paint) {
  const o = { notes: [] as string[], extra: [] as string[], deg: [] as string[], edeg: [] as string[] };
  for (const p of st.pads.slice().sort(byM)) {
    const pc = midi(p) % 12;
    const mine = inChord(st, pc) || !known(st);
    (mine ? o.notes : o.extra).push(((known(st) && st.spelling[pc]) || NAME[p]) + oct(midi(p)));
    const dg = known(st) ? st.degrees[pc] || "" : "";
    const into = mine ? o.deg : o.edeg;
    if (dg && !into.includes(dg)) into.push(dg);
  }
  return o;
}

function Sub({ pt }: { pt: ReturnType<typeof parts> }) {
  return (
    <>
      {pt.notes.join(" · ")}
      {pt.extra.length ? (
        <>
          {" "}
          <span className="exd">+ {pt.extra.join(" · ")}</span>
        </>
      ) : null}
    </>
  );
}

function Degs({ pt }: { pt: ReturnType<typeof parts> }) {
  if (!pt.deg.length && !pt.edeg.length) return null;
  return (
    <>
      degrees <b>{pt.deg.join(" · ")}</b>
      {pt.edeg.length ? (
        <>
          {" "}
          <span className="exd">+ {pt.edeg.join(" · ")}</span>
        </>
      ) : null}
    </>
  );
}

const distinctPcs = (list: readonly number[]) => new Set(list.map((p) => midi(p) % 12)).size;

type Loaded = { seq: number; id: string | null; name: string; items: Item[] };

export function FindPage() {
  const { id } = useParams();
  // только что сохранённый подбор перечитывать не нужно: он и так на экране,
  // а перечитывание сбросило бы сетку
  const skip = useRef<string | null>(null);
  const seq = useRef(0);
  // новый подбор рисуется сразу, без экрана «Открываю…»
  const [loaded, setLoaded] = useState<Loaded | null | "missing">(() => (id ? null : { seq: 0, id: null, name: "", items: [] }));

  useEffect(() => {
    if (id && skip.current === id) {
      skip.current = null;
      // тот же экран, только теперь он про сохранённый подбор
      setLoaded((prev) => (prev && prev !== "missing" ? { ...prev, id } : prev));
      return;
    }
    if (!id) {
      setLoaded((prev) =>
        prev && prev !== "missing" && prev.seq === 0 && prev.id === null
          ? prev
          : { seq: ++seq.current, id: null, name: "", items: [] },
      );
      return;
    }
    let live = true;
    setLoaded(null);
    getPick(id)
      .then((p) => {
        if (!live) return;
        if (!p) return setLoaded("missing");
        // ступени и запись нот в подборе не лежат — пересчитываем при открытии
        const items = enrich(p.chords).map((c) => ({ ...c, root: c.root ?? c.pads[0] }) as Item);
        setLoaded({ seq: ++seq.current, id: p.id, name: p.name, items });
      })
      .catch(() => live && setLoaded("missing"));
    return () => {
      live = false;
    };
  }, [id]);

  if (loaded === "missing") return <Message title="No such collection" text="It may have been deleted, or saved in another browser." />;
  if (loaded === null) return <Message title="Opening…" text="" loading />;
  return <Finder key={loaded.seq} initial={loaded} onSaved={(rid) => (skip.current = rid)} />;
}

function Finder({ initial, onSaved }: { initial: Loaded; onSaved: (id: string) => void }) {
  const nav = useNavigate();
  // sel[0] — РУТ: первый нажатый пэд. Аккорд строится от него, а не от баса.
  // lockPc — рут в классах высот; меняется, только если человек сам выбрал
  // другой вариант в списке снизу (тогда это его рут).
  const [sel, setSel] = useState<number[]>([]);
  const [lockPc, setLockPc] = useState<number | null>(null);
  const [cand, setCand] = useState<Candidate[]>([]);
  const [ci, setCi] = useState(0);
  const [iv, setIv] = useState("");
  const [padDeg, setPadDeg] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>(initial.items);
  const [cur, setCur] = useState(-1);
  const [flash, setFlash] = useState(-1);
  const [pickId, setPickId] = useState<string | null>(initial.id);
  const [name, setName] = useState(initial.name);
  const [savedName, setSavedName] = useState(initial.name);
  const [status, setStatus] = useState<{ text: string; err: boolean; on: boolean }>({ text: "", err: false, on: false });
  const [hint, setHint] = useState("");
  const [dragI, setDragI] = useState(-1);
  const stripRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useTitle(savedName ? `${savedName} — collection` : "Chord finder");

  /** Пересчитать разбор. Рут ЗАЛОЧЕН: заголовок берём только у аккорда от него. */
  function analyze(nextSel: number[], nextLock: number | null, prefer?: string) {
    setSel(nextSel);
    setLockPc(nextLock);
    if (!nextSel.length) {
      setCand([]);
      setCi(0);
      setIv("");
      setPadDeg({});
      return;
    }
    const d = identify(padsToMidi(nextSel), nextLock);
    // Если от этого рута аккорда нет — заголовка нет тоже (ci=-1), а найденное
    // от других рутов остаётся списком вариантов внизу. Иначе рут молча уезжал:
    // C C# E — от C аккорда нет, и страница показывала C#mMaj7/C.
    let idx = -1;
    if (prefer) idx = d.candidates.findIndex((x) => x.sym === prefer);
    if (idx < 0 && nextLock !== null) idx = d.candidates.findIndex((x) => x.root_pc === nextLock);
    setCand(d.candidates);
    setIv(d.interval);
    setPadDeg(d.pad_degrees);
    setCi(idx);
  }

  const c = cand[ci] ?? null;
  const st: Paint = { pads: sel, sym: c?.sym, root_pc: c ? c.root_pc : lockPc, degrees: c ? c.degrees : {}, spelling: c ? c.spelling : {}, padDeg };
  const pt = parts(st);
  const nNotes = distinctPcs(sel);

  let sym = c ? c.sym : sel.length ? "?" : "—";
  let symNone = !c;
  let sub: string;
  if (c) {
    sub = c.name;
    if (c.inv) sub += ` · ${ordinal(c.inv)} inversion`;
  } else if (!sel.length) sub = "click pads — the grid will tell you what you've got";
  else if (nNotes < 2) {
    // одна нота — это ещё не «аккорда нет», это заявленный рут
    sym = "—";
    symNone = true;
    sub = `root ${lockPc !== null ? PCNAME[lockPc] : ""} — now add notes`;
  } else if (cand.length) sub = `no chord from ${lockPc !== null ? PCNAME[lockPc] : "this note"} in the table — but there are options below`;
  else if (iv) sub = `interval: ${iv}`;
  else sub = "no such chord in the table";

  // лишние ноты и так видно фиолетовым в списке — тут только «чего не хватает»
  const warn = hint || (c && c.missing.length ? `no ${c.missing.join(", ")}` : "");

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(""), 2600);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    if (!status.on) return;
    const t = setTimeout(() => setStatus((s) => ({ ...s, on: false })), 2400);
    return () => clearTimeout(t);
  }, [status]);

  function clickBig(i: number) {
    if (sel.length && i === sel[0]) {
      // сняли рут — снимаем всё: аккорд читается заново, а не пересчитывается
      setCur(-1);
      analyze([], null);
      return;
    }
    const j = sel.indexOf(i);
    let next = sel.slice();
    let lock = lockPc;
    if (j >= 0) next.splice(j, 1);
    else {
      if (distinctPcs(sel) >= MAX_NOTES) {
        setHint(`a chord has at most ${MAX_NOTES} notes — remove one first`);
        return;
      }
      next = [...next, i];
      if (next.length === 1) lock = midi(i) % 12; // первый пэд и есть рут
    }
    setCur(-1);
    analyze(next, lock);
  }

  function chooseAlt(i: number) {
    // выбрал другой вариант — рут стал его: дальше аккорд строится от него
    const x = cand[i];
    setCi(i);
    setLockPc(x.root_pc);
    setPadDeg(identify(padsToMidi(sel), x.root_pc).pad_degrees);
  }

  function add() {
    if (!sel.length) return;
    const it: Item = {
      sym: c ? c.sym : "?",
      pads: sel.slice().sort(byM),
      kind: c ? c.kind : "",
      root: sel[0],
      root_pc: c ? c.root_pc : lockPc,
      degrees: st.degrees,
      spelling: st.spelling,
      padDeg: st.padDeg,
    };
    const next = [...items, it];
    setItems(next);
    setCur(next.length - 1);
    setFlash(next.length - 1);
  }

  function clear() {
    setCur(-1);
    analyze([], null);
  }

  function load(it: Item) {
    const r = it.root !== undefined && it.pads.includes(it.root) ? it.root : it.pads[0];
    const lock = it.root_pc === undefined || it.root_pc === null ? midi(r) % 12 : it.root_pc;
    analyze([r, ...it.pads.filter((p) => p !== r)], lock, it.sym);
  }

  // первый аккорд подбора сразу на сетку
  useEffect(() => {
    if (initial.items.length) {
      setCur(0);
      load(initial.items[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (flash < 0) return;
    stripRef.current?.children[flash]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const t = setTimeout(() => setFlash(-1), 600);
    return () => clearTimeout(t);
  }, [flash]);

  // Enter — добавить в подбор, Esc — очистить сетку
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.key === "Enter" && sel.length) {
      add();
      e.preventDefault();
    }
    if (e.key === "Escape" && sel.length) clear();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  function stripClick(i: number, del: boolean) {
    if (del) {
      setItems(items.filter((_, k) => k !== i));
      setCur(cur === i ? -1 : cur > i ? cur - 1 : cur);
      return;
    }
    setCur(i);
    load(items[i]);
  }

  function drop(e: DragEvent, to: number) {
    e.preventDefault();
    if (dragI < 0) return;
    if (to !== dragI) {
      const next = items.slice();
      const [it] = next.splice(dragI, 1);
      next.splice(to, 0, it);
      setItems(next);
      setCur(cur === dragI ? to : -1);
    }
    setDragI(-1);
  }

  async function save() {
    const nm = name.trim();
    if (!nm) {
      nameRef.current?.focus();
      setStatus({ text: "name required", err: true, on: true });
      return;
    }
    if (!items.length) {
      setStatus({ text: "collection is empty", err: true, on: true });
      return;
    }
    const wasId = pickId;
    try {
      const rec = await savePick({ id: pickId, name: nm, chords: items });
      setPickId(rec.id);
      setSavedName(rec.name);
      setStatus({ text: "saved", err: false, on: true });
      if (rec.id !== wasId) {
        onSaved(rec.id);
        nav(`/find/${rec.id}`, { replace: true });
      }
    } catch (e) {
      setStatus({ text: String((e as Error).message || "not saved"), err: true, on: true });
    }
  }

  const bigPads = useMemo(() => paint(st, true), [sel, lockPc, cand, ci, padDeg]); // eslint-disable-line react-hooks/exhaustive-deps
  const big = ["pg", "big", "free"];
  if (nNotes >= MAX_NOTES) big.push("full");
  if (lockPc !== null) big.push("rooted");

  return (
    <>
      <PageStyle css={LAYOUT_CSS + FIND_CSS} />
      <Header
        title="Chord finder"
        ctl={
          <>
            <input
              type="text"
              id="nm"
              ref={nameRef}
              placeholder="collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <button id="save" className="pri" onClick={save}>
              Save
            </button>
            <span className={"st" + (status.on ? " on" : "") + (status.err ? " err" : "")} id="st">
              {status.text}
            </span>
          </>
        }
      />
      <SplitLayout
        left={
          <main className="pane find">
            <div className="gbox">
              <div className={big.join(" ")}>
                <Pads pads={bigPads} onHit={clickBig} />
              </div>
            </div>
            <div className="res">
              <div className={"rsym" + (symNone ? " none" : "")} id="sym">
                {sym}
              </div>
              <div className="rname" id="nm2">
                {sub}
              </div>
              <div className="rnote" id="notes">
                {sel.length ? (
                  <>
                    <b>{pt.notes[0]}</b>
                    {pt.notes.slice(1).map((n, k) => (
                      <span key={k}>
                        {" · "}
                        <b>{n}</b>
                      </span>
                    ))}
                    {pt.extra.length ? (
                      <>
                        {" "}
                        <span className="exd">+ {pt.extra.join(" · ")}</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="rnote" id="degs">
                <Degs pt={pt} />
              </div>
              <div className="rnote warn" id="warn">
                {warn}
              </div>
              <div className="alts" id="alts">
                {/* один кандидат уже написан большими буквами — чип-дубль не нужен.
                    Но если заголовка нет (аккорда от залоченного рута не нашлось),
                    показываем даже единственный вариант: иначе выбрать его нечем */}
                {(cand.length > 1 || ci < 0 ? cand : []).map((x, i) => (
                  <button key={x.sym + i} className={"alt" + (i === ci ? " on" : "")} title={x.name} onClick={() => chooseAlt(i)}>
                    {x.sym}
                  </button>
                ))}
              </div>
              <div className="acts">
                <button id="add" className="pri" disabled={!sel.length} onClick={add}>
                  Add to collection
                </button>
                <button id="clr" onClick={clear}>
                  Clear grid
                </button>
              </div>
              <div className="hint">
                The first pad you press is the <b>root</b>: the chord is built from it, and clicking it again clears
                the grid. At most {MAX_NOTES} notes per chord. Pick another name from the list and the root moves to it.
                <br />
                Enter &mdash; add to collection, Esc &mdash; clear. Click a diagram on the right to bring it back to the
                grid, drag to reorder.
              </div>
            </div>
          </main>
        }
        right={
          <aside className="pane side">
            <div className="sidehead">
              <b id="cnt">
                {items.length ? `Collection: ${count(items.length, "chord", "chords")}` : "Collection is empty"}
              </b>
              <button
                id="wipe"
                disabled={!items.length}
                onClick={() => {
                  if (items.length && !confirm("Remove all chords from the collection?")) return;
                  setItems([]);
                  setCur(-1);
                }}
              >
                clear all
              </button>
            </div>
            <div className="cards" id="strip" ref={stripRef} onDragOver={(e) => e.preventDefault()}>
              {items.map((it, idx) => {
                const ipt = parts(it);
                const cls = ["pg"];
                if (idx === cur) cls.push("cur");
                if (idx === flash) cls.push("flash");
                return (
                  <div
                    key={idx + ":" + it.sym + ":" + it.pads.join(",")}
                    className={cls.join(" ")}
                    data-i={idx}
                    draggable
                    style={dragI === idx ? { opacity: 0.35 } : undefined}
                    onClick={(e) => stripClick(idx, (e.target as HTMLElement).classList.contains("del"))}
                    onDragStart={(e) => {
                      setDragI(idx);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", "");
                    }}
                    onDrop={(e) => drop(e, idx)}
                    onDragEnd={() => setDragI(-1)}
                  >
                    <div className="pgcap">
                      <div className="pgh">
                        <b className="sym">{it.sym || "?"}</b>
                        <span className="sub">
                          <Sub pt={ipt} />
                        </span>
                      </div>
                      <div className="pgf">
                        <button className="del" title="remove">
                          &times;
                        </button>
                        <span className="pgm">
                          <Degs pt={ipt} />
                        </span>
                      </div>
                    </div>
                    <Pads pads={paint(it, true)} />
                  </div>
                );
              })}
            </div>
          </aside>
        }
      />
    </>
  );
}
