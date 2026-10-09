/**
 * Определение аккорда по набору нот: пэды -> список названий.
 *
 * Обратная задача ко всему остальному проекту: там символ -> схема, здесь
 * схема -> символ. Таблица типов, подписи ступеней и правильная запись нот
 * (Bb, а не A#) берутся из ядра — второй копии нет.
 *
 * Что считаем совпадением:
 *   точное      — классы высот выбранных нот в точности равны классам аккорда;
 *   + лишняя    — ровно одна нота сверх аккорда, и только поверх аккорда от трёх
 *                 нот: иначе три ноты F# B C становились «B5 (это квинта B–F#)
 *                 плюс C», то есть аккорд назывался по двум нотам из трёх;
 *   - квинта    — не хватает ровно квинты, и только у аккордов от четырёх нот
 *                 (пианист квинту опускает, терцию или септиму — нет).
 * Одновременно «и не хватает, и лишняя» не бывает: так под любые четыре ноты
 * подгонялась половина таблицы (B C# E F# объявлялись то Db7sus4, то C#m7).
 * И если точное совпадение нашлось хоть одно — приблизительные не показываем
 * вовсе, иначе список кандидатов превращается в мусор.
 *
 * Рут не угадывается: его называет страница (первый нажатый пэд), и кандидаты
 * с этим рутом идут первыми. Бас на порядок больше не влияет — он решает только,
 * писать ли аккорд через слэш и какое это обращение.
 */
import { ALIAS_PAIRS, CHORDS, ChordInfo, INTERVALS } from "./data";
import { Grid } from "./grid";
import { intervalShort, pcToName, spellFrom } from "./notes";
import { cmpTuple, mod } from "./py";

const GRID = new Grid();

// порядок типов в таблице = порядок от простого к сложному, им и разводим
// одинаково хорошие варианты (C6 раньше, чем 6/9)
const ORDER = new Map([...CHORDS.keys()].map((k, i) => [k, i]));

/**
 * Больше шести нот в таблице аккордов нет (13, maj11, min13, 7alt и родня).
 * Число считается из таблицы, а не пишется руками: добавится семизвучие —
 * страница сама начнёт пускать седьмую ноту.
 */
export const MAX_NOTES = Math.max(
  ...[...CHORDS.values()].map((e) => new Set(e.intervals.map((i) => i % 12)).size),
);

const FIRST_ALIAS = new Map<string, string>();
for (const [a, k] of ALIAS_PAIRS) if (!FIRST_ALIAS.has(k)) FIRST_ALIAS.set(k, a);

// Как тип показывается в символе. По умолчанию — первый алиас из таблицы,
// несколько случаев поправлены руками:
const SUFFIX_FIX: Record<string, string> = {
  maj: "", // C, а не Cmaj
  sus4: "sus4", // 'sus' короче, но 'sus4' понятнее
  majb5: "(b5)", // 'Cb5' прочиталось бы как нота C-бемоль плюс квинта
  minMaj7: "mMaj7", // регистр значим: mmaj7 и mMaj7 — один тип, но пишем так
  minMaj9: "mMaj9",
  dimMaj7: "dim(maj7)", // 'C#dimmaj7' читается тяжело
  "7alt": "7alt",
};

// Тоника: диезы у минорных, бемоли у мажорных — как это пишут в нотах.
// C#m, но Db; G#m, но Ab. F#, Eb и Bb одинаковы в обе стороны.
const ROOT_FLAT = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROOT_SHARP: Record<number, string> = { 1: "C#", 6: "F#", 8: "G#" };

/** Как тип пишется в символе аккорда: 'min7' -> 'm7'. */
export function suffixOf(kind: string): string {
  if (kind in SUFFIX_FIX) return SUFFIX_FIX[kind];
  return FIRST_ALIAS.get(kind) ?? kind;
}

export function rootName(pc: number, minorish = false): string {
  const p = mod(pc, 12);
  if (minorish && p in ROOT_SHARP) return ROOT_SHARP[p];
  return ROOT_FLAT[p];
}

/**
 * Название интервала по РЕАЛЬНОМУ расстоянию, а не по классам высот.
 *
 * C и Db октавой выше — малая нона, а не малая секунда: это разные интервалы,
 * и у каждого своё имя. Тот же принцип, что и в таблице аккордов, где `add9`
 * хранится как 14, а не как 2.
 *
 * Таблица знает интервалы до терцдецимы (21 полутон), а сетка растягивается
 * на 42 — дальше называем составным: «малая септима через октаву».
 */
export function intervalName(semitones: number): string {
  const n = Math.abs(Math.trunc(semitones));
  const ent = INTERVALS.get(n);
  if (ent) return ent.name;
  const octs = Math.floor(n / 12);
  const rest = n % 12;
  if (rest === 0) return ({ 2: "две октавы", 3: "три октавы" } as Record<number, string>)[octs] ?? `${octs} октав`;
  const base = INTERVALS.get(rest);
  if (!base) return "";
  return `${base.name} через ${octs === 1 ? "октаву" : `${octs} октавы`}`;
}

/** Подпись ступени по расстоянию от рута. Выше октавы — настоящая ступень
 *  (9, 11, 13), ниже рута и совсем далеко — свёрнутая в октаву. */
export function degreeFromRoot(semitones: number): string {
  const d = Math.trunc(semitones);
  if (d >= 0 && d <= 21) return intervalShort(d);
  return intervalShort(mod(d, 12));
}

function spell(rname: string, degree: string, pc: number, flats: boolean): string {
  return spellFrom(rname, degree, pc) || pcToName(pc, flats);
}

export interface Candidate {
  sym: string;
  root: string;
  root_pc: number;
  kind: string;
  name: string;
  bass_pc: number;
  inv: number;
  exact: boolean;
  missing: string[];
  extra: string[];
  degrees: Record<string, string>;
  spelling: Record<string, string>;
  pcs: number[];
}

type Ranked = Candidate & { _sort: number[] };

function candidate(
  rootPc: number,
  kind: string,
  ent: ChordInfo,
  pcs: ReadonlySet<number>,
  bassPc: number,
  lockPc: number | null,
): Ranked | null {
  const ivs = ent.intervals;
  const degrees = ent.degrees.length ? ent.degrees : ivs.map(intervalShort);
  const need = ivs.map((i) => mod(rootPc + i, 12)); // по порядку ступеней
  const needSet = new Set(need);
  const missing = [...needSet].filter((p) => !pcs.has(p));
  const extra = [...pcs].filter((p) => !needSet.has(p));

  if (missing.length > 1 || extra.length > 1) return null;
  if (missing.length && extra.length) return null; // это уже гадание, а не разбор
  // «квинта плюс лишняя нота» — не разбор, а отговорка: три ноты F# B C
  // так объявлялись аккордом B5 по двум нотам из трёх
  if (extra.length && needSet.size < 3) return null;
  if (missing.length) {
    if (needSet.size < 4) return null;
    if (mod(missing[0] - rootPc, 12) !== 7) return null; // опускаем только квинту
  }
  if ([...needSet].filter((p) => pcs.has(p)).length < 2) return null;

  const minorish = ivs.includes(3);
  const rname = rootName(rootPc, minorish);
  const flats = rname.includes("b");
  const dmap = new Map<number, string>();
  const smap = new Map<number, string>();
  ivs.forEach((i, k) => {
    if (k >= degrees.length) return;
    const pc = mod(rootPc + i, 12);
    if (!dmap.has(pc)) dmap.set(pc, degrees[k]);
    if (!smap.has(pc)) smap.set(pc, spell(rname, degrees[k], pc, flats));
  });
  // ступени для всех 12 — и для лишних
  for (let pc = 0; pc < 12; pc++) if (!dmap.has(pc)) dmap.set(pc, intervalShort(mod(pc - rootPc, 12)));

  const inv = need.includes(bassPc) ? need.indexOf(bassPc) : 0;
  const slash = bassPc !== rootPc && needSet.has(bassPc);
  const suf = suffixOf(kind);
  let sym = rname + suf;
  if (slash) {
    // C6/9 с басом в слэше превращается в ребус «C6/9/A» — для таких типов
    // пишем алиас без косой черты: C69/A
    sym = `${rname}${suf.replaceAll("/", "")}/${smap.get(bassPc) ?? pcToName(bassPc, flats)}`;
  }
  const sortedNum = (xs: number[]) => xs.slice().sort((a, b) => a - b);

  return {
    sym,
    root: rname,
    root_pc: rootPc,
    kind,
    name: ent.name || kind,
    bass_pc: bassPc,
    inv: slash ? inv : 0,
    exact: !missing.length && !extra.length,
    missing: sortedNum(missing).map((p) => dmap.get(p)!),
    extra: sortedNum(extra).map((p) => spell(rname, dmap.get(p)!, p, flats)),
    degrees: Object.fromEntries([...dmap].map(([p, d]) => [String(p), d])),
    spelling: Object.fromEntries([...smap].map(([p, n]) => [String(p), n])),
    pcs: need,
    // порядок: сначала аккорды от заданного рута (его называет страница —
    // это первый нажатый пэд), потом точные, потом простые по таблице.
    // Если рут не задан, его место занимает бас — так было до лока рута.
    _sort: [
      rootPc === (lockPc !== null ? lockPc : bassPc) ? 0 : 1,
      !missing.length && !extra.length ? 0 : 1,
      missing.length + extra.length,
      ORDER.get(kind) ?? 99,
      needSet.size,
    ],
  };
}

export interface IdentifyResult {
  count: number;
  midi: number[];
  candidates: Candidate[];
  interval: string;
  root_pc: number | null;
  max_notes: number;
  pad_degrees: Record<string, string>;
}

/**
 * Набор MIDI-нот -> кандидаты на название, лучший первым.
 *
 * rootPc — рут, который назвала страница (первый нажатый пэд). Это НЕ фильтр:
 * аккорды от других рутов остаются в списке вариантов, просто уходят ниже.
 * Выбрал вариант — сменился рут, и страница присылает уже его.
 */
export function identify(midis: readonly number[], rootPc: number | null = null, limit = 8): IdentifyResult {
  const ms = [...new Set(midis.map((m) => Math.trunc(m)))].sort((a, b) => a - b);
  const pcs = new Set(ms.map((m) => mod(m, 12)));
  const out: IdentifyResult = {
    count: ms.length,
    midi: ms,
    candidates: [],
    interval: "",
    root_pc: rootPc !== null ? mod(rootPc, 12) : null,
    max_notes: MAX_NOTES,
    pad_degrees: {},
  };

  // Ступень КАЖДОГО пэда от рута — ею страница подписывает пэд под курсором.
  // Считается от реальной высоты рутовой ноты, а не от класса высоты: пэд
  // октавой выше — это 9, а не 2. Якорь — самая низкая выбранная нота рута.
  if (rootPc !== null && ms.length) {
    const same = ms.filter((m) => mod(m, 12) === mod(rootPc, 12));
    const anchor = same.length ? same[0] : ms[0];
    for (let p = 0; p < 64; p++) out.pad_degrees[String(p)] = degreeFromRoot(GRID.midi(p) - anchor);
  }
  if (!ms.length) return out;
  const bassPc = mod(ms[0], 12);

  // интервал между двумя нотами — по расстоянию, а не по классам высот
  if (ms.length === 2) out.interval = intervalName(ms[1] - ms[0]);

  let found: Ranked[] = [];
  const lock = rootPc !== null ? mod(rootPc, 12) : null;
  for (let rp = 0; rp < 12; rp++) {
    for (const [kind, ent] of CHORDS) {
      const c = candidate(rp, kind, ent, pcs, bassPc, lock);
      if (c) found.push(c);
    }
  }
  found = found.map((c, i) => ({ c, i })).sort((a, b) => cmpTuple(a.c._sort, b.c._sort) || a.i - b.i).map((x) => x.c);
  if (found.some((c) => c.exact)) found = found.filter((c) => c.exact); // точное есть — «похожие» лишние
  out.candidates = found.slice(0, limit).map(({ _sort, ...c }) => c);
  return out;
}

/** Номера пэдов (снизу вверх, r*8+c) -> MIDI-ноты. Мусор отбрасывается. */
export function padsToMidi(pads: readonly number[]): number[] {
  const out: number[] = [];
  for (const raw of pads) {
    const p = Math.trunc(raw);
    if (p >= 0 && p < 64) out.push(GRID.midi(p));
  }
  return out;
}

export interface PickChord {
  sym: string;
  pads: number[];
  root?: number;
  root_pc: number | null;
  kind: string;
}

export interface EnrichedChord extends PickChord {
  degrees: Record<string, string>;
  spelling: Record<string, string>;
  padDeg?: Record<string, string>;
}

/**
 * Дополняет сохранённые аккорды тем, что нужно для отрисовки схемы.
 *
 * В подборе лежит только выбор человека: символ и пэды. Ступени и запись нот
 * туда не пишем — это производное, его дешевле пересчитать при открытии, чем
 * потом чинить разъехавшиеся копии.
 */
export function enrich(chords: readonly PickChord[]): EnrichedChord[] {
  return chords.map((it) => {
    const d = { ...it } as EnrichedChord;
    const res = identify(padsToMidi(d.pads ?? []), d.root_pc ?? null);
    let best: Candidate | null = res.candidates.find((c) => c.sym === d.sym) ?? null; // сначала тот же символ
    if (best === null) {
      const same = res.candidates.filter((c) => c.kind === d.kind && c.root_pc === d.root_pc);
      best = same.length ? same[0] : (res.candidates[0] ?? null);
    }
    if (best) {
      d.sym = d.sym || best.sym;
      d.kind = best.kind;
      d.root_pc = best.root_pc;
      d.degrees = best.degrees;
      d.spelling = best.spelling;
      d.padDeg = res.pad_degrees ?? {};
    } else {
      d.degrees = {};
      d.spelling = {};
      d.root_pc = null;
    }
    return d;
  });
}
