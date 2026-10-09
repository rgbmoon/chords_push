/**
 * Живая схема: аппликатуру солвера можно переопределить рукой (бывший GRID_JS).
 *
 * Два жеста, оба — клик по пэду:
 *   по пэду ноты, которая уже в аккорде — переносит на него этот голос;
 *   по любому другому                   — добавляет ноту руками (в аккорд не входит).
 * Если после переноса в басу оказалась не тоника, схема коротко подписывает,
 * какое обращение получилось. Никакой музыкальной математики сверх этого здесь
 * нет: имена нот и ступени уже лежат в модели каждого пэда, тут их только
 * показывают. data.pcs идёт по порядку ступеней от рута — отсюда и номер обращения.
 */
import { BASE_MIDI, COLS, ROW_SEMITONES } from "../core/data";
import { floorDiv } from "../core/py";
import type { LiveData, PadCell } from "./scheme";

export const INV = ["root position", "1st inversion", "2nd inversion", "3rd inversion", "4th inversion", "5th inversion"];

export const padMidi = (p: number): number => BASE_MIDI + ROW_SEMITONES * Math.floor(p / COLS) + (p % COLS);
const oct = (m: number): number => floorDiv(m, 12) - 2;
const byMidi = (a: number, b: number): number => padMidi(a) - padMidi(b);
const sorted = (a: readonly number[]): number[] => a.slice().sort(byMidi);

/** То, что человек накликал: пэды аккорда и свои ноты сверх него. */
export interface Saved {
  pads: number[];
  extra: number[];
}

export interface LiveState {
  cur: number[];
  ext: number[];
}

export const initialState = (d: LiveData): LiveState => ({ cur: d.o.slice(), ext: [] });

/**
 * Обратный ход: хранилище отдаёт сохранённую правку, схема её принимает.
 * Число нот аккорда сверяем — источник мог поменяться под тем же именем.
 */
export function restore(d: LiveData, saved: Saved | null | undefined): LiveState {
  if (saved && saved.pads && saved.pads.length === d.o.length) return { cur: saved.pads.slice(), ext: (saved.extra || []).slice() };
  return initialState(d);
}

const isChord = (d: LiveData, p: number): boolean => d.pcs.includes(padMidi(p) % 12);

/** Клик по пэду. Возвращает тот же объект, если клик ничего не меняет. */
export function hit(d: LiveData, st: LiveState, p: number): LiveState {
  if (st.cur.includes(p)) return st; // нота аккорда уже здесь
  const j = st.ext.indexOf(p);
  if (j >= 0) return { cur: st.cur, ext: st.ext.filter((_, k) => k !== j) }; // повторный клик снимает
  if (isChord(d, p)) {
    // пэд той же ноты, что уже есть в аккорде: переносим на него голос
    const pc = padMidi(p) % 12;
    let k = -1;
    st.cur.forEach((q, n) => {
      if (padMidi(q) % 12 !== pc) return;
      if (k < 0 || Math.abs(padMidi(q) - padMidi(p)) < Math.abs(padMidi(st.cur[k]) - padMidi(p))) k = n;
    });
    if (k < 0) return st;
    const cur = st.cur.slice();
    cur[k] = p;
    return { cur, ext: st.ext };
  }
  return { cur: st.cur, ext: [...st.ext, p] }; // нота не из аккорда — своя
}

export interface LiveView {
  /** класс каждого пэда по номеру */
  cls: Map<number, string>;
  /** пэды, до которых можно дойти с клавиатуры */
  tab: Set<number>;
  notes: string[];
  extraNotes: string[];
  degs: string[];
  extraDegs: string[];
  edited: boolean;
  vlab: string;
}

export function view(d: LiveData, cells: readonly PadCell[], st: LiveState): LiveView {
  const on = new Set(st.cur);
  const ex = new Set(st.ext);
  const cell = new Map(cells.map((c) => [c.p, c]));
  const cls = new Map<number, string>();
  const tab = new Set<number>();
  for (const c of cells) {
    const isOn = on.has(c.p);
    const isEx = ex.has(c.p);
    const gh = !isOn && !isEx && isChord(d, c.p);
    const k = ["p", "b-" + c.base];
    if (isOn) k.push("on");
    if (isEx) k.push("ex");
    if (gh) k.push("gh");
    if ((isOn || gh) && padMidi(c.p) % 12 === d.rt) k.push("rt");
    cls.set(c.p, k.join(" "));
    if (gh || isEx) tab.add(c.p);
  }
  const nameOf = (p: number) => cell.get(p)!.name + oct(padMidi(p));
  const degOf = (p: number) => cell.get(p)!.deg ?? "?";
  const s = sorted(st.cur);
  const e = sorted(st.ext);
  // у добавленных руками нот ступени повторяются (одна и та же нота в разных
  // октавах) — в списке от повтора никакого смысла, только длина
  const ed: string[] = [];
  for (const x of e.map(degOf)) if (!ed.includes(x)) ed.push(x);
  const so = sorted(d.o);
  const same = st.cur.length === d.o.length && s.every((p, k) => p === so[k]);
  // подписываем обращение только если руками двигали САМ аккорд: добавленные
  // сбоку ноты бас не меняют, и писать «осн. вид» просто так незачем
  const vlab = same ? "" : (INV[d.pcs.indexOf(padMidi(s[0]) % 12)] ?? "");
  return {
    cls,
    tab,
    notes: s.map(nameOf),
    extraNotes: e.map(nameOf),
    degs: s.map(degOf),
    extraDegs: ed,
    edited: !same || e.length > 0,
    vlab,
  };
}

/**
 * Наружу отдаём ровно то, что человек накликал; вернул как было — null,
 * чтобы в хранилище не копились записи «эта схема не изменена».
 */
export function toSaved(d: LiveData, cells: readonly PadCell[], st: LiveState): Saved | null {
  return view(d, cells, st).edited ? { pads: sorted(st.cur), extra: sorted(st.ext) } : null;
}
