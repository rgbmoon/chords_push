/**
 * Обратная задача: набор нот -> название аккорда.
 *
 * Что считаем совпадением:
 *   точное   — классы высот выбранных нот в точности равны классам аккорда;
 *   + лишняя — ровно одна нота сверх аккорда, и только поверх аккорда от трёх
 *              нот: иначе F# B C назывались бы «B5 плюс C» — по двум нотам из трёх;
 *   − квинта — не хватает ровно квинты, и только у аккордов от четырёх нот
 *              (пианист опускает квинту, но не терцию и не септиму).
 * «И не хватает, и лишняя» одновременно — это уже гадание, такого не бывает.
 * Если нашлось хоть одно точное совпадение, приблизительные не показываются.
 *
 * Рут не угадывается: его называет человек (первый нажатый пэд), и кандидаты
 * от этого рута идут первыми. Бас решает только, писать ли слэш и какое это
 * обращение.
 */
import { padMidi, PAD_COUNT } from "../grid/grid";
import { compareVectors, mod } from "../math";
import { CHORD_TYPES, ChordType, suffixOf } from "../theory/chordTypes";
import { degreeFromRoot, intervalName, intervalShort } from "../theory/intervals";
import { pcName, PitchClass, spellNote } from "../theory/notes";

export interface ChordCandidate {
  symbol: string;
  rootName: string;
  rootPc: PitchClass;
  kind: string;
  /** название типа: 'minor seventh' */
  typeName: string;
  bassPc: PitchClass;
  /** номер обращения, если бас — не рут; 0 — основной вид */
  inversion: number;
  exact: boolean;
  /** ступени, которых не хватает (только квинта) */
  missing: string[];
  /** имена лишних нот */
  extra: string[];
  /** ступень для каждого из 12 классов высот — и для нот вне аккорда */
  degreeByPc: readonly string[];
  /** правильное имя ноты для классов высот аккорда */
  nameByPc: ReadonlyMap<PitchClass, string>;
}

export interface Identification {
  candidates: ChordCandidate[];
  /** если выбраны две ноты — интервал между ними */
  interval: string;
  /**
   * Ступень каждого из 64 пэдов от рута — по реальному расстоянию: пэд октавой
   * выше рута — это 9, а не 2. null — рут не назван.
   */
  padDegrees: readonly string[] | null;
}

// Тоника: диезы у минорных, бемоли у мажорных — как пишут в нотах: C#m, но Db.
const FLAT_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_SHARP_ROOTS: Record<number, string> = { 1: "C#", 6: "F#", 8: "G#" };

const rootNameFor = (pc: PitchClass, minor: boolean): string => (minor && MINOR_SHARP_ROOTS[pc]) || FLAT_ROOTS[pc];

interface Ranked extends ChordCandidate {
  rank: number[];
}

function candidate(rootPc: PitchClass, type: ChordType, pcs: ReadonlySet<PitchClass>, bassPc: PitchClass, lockPc: PitchClass | null): Ranked | null {
  const chordPcs = type.intervals.map((iv) => mod(rootPc + iv, 12)); // по порядку ступеней
  const need = new Set(chordPcs);
  const missing = [...need].filter((pc) => !pcs.has(pc));
  const extra = [...pcs].filter((pc) => !need.has(pc));

  if (missing.length > 1 || extra.length > 1 || (missing.length && extra.length)) return null;
  if (extra.length && need.size < 3) return null;
  if (missing.length && (need.size < 4 || mod(missing[0] - rootPc, 12) !== 7)) return null;
  if ([...need].filter((pc) => pcs.has(pc)).length < 2) return null;

  const rootName = rootNameFor(rootPc, type.intervals.includes(3));
  const flats = rootName.includes("b");
  const degreeByPc = Array.from({ length: 12 }, (_, pc) => intervalShort(mod(pc - rootPc, 12)));
  const nameByPc = new Map<PitchClass, string>();
  type.intervals.forEach((iv, i) => {
    const pc = mod(rootPc + iv, 12);
    if (nameByPc.has(pc)) return;
    degreeByPc[pc] = type.degrees[i];
    nameByPc.set(pc, spellNote(rootName, type.degrees[i], pc) ?? pcName(pc, flats));
  });
  const spell = (pc: PitchClass) => nameByPc.get(pc) ?? spellNote(rootName, degreeByPc[pc], pc) ?? pcName(pc, flats);

  const slash = bassPc !== rootPc && need.has(bassPc);
  const suffix = suffixOf(type.kind);
  // C6/9 с басом в слэше превратился бы в ребус «C6/9/A» — пишем C69/A
  const symbol = slash ? `${rootName}${suffix.replaceAll("/", "")}/${spell(bassPc)}` : rootName + suffix;
  const exact = !missing.length && !extra.length;
  const byPc = (a: number, b: number) => a - b;

  return {
    symbol,
    rootName,
    rootPc,
    kind: type.kind,
    typeName: type.name,
    bassPc,
    inversion: slash ? chordPcs.indexOf(bassPc) : 0,
    exact,
    missing: missing.sort(byPc).map((pc) => degreeByPc[pc]),
    extra: extra.sort(byPc).map(spell),
    degreeByPc,
    nameByPc,
    // сначала аккорды от названного рута (если не назван — от баса), потом
    // точные, потом простые по таблице
    rank: [rootPc === (lockPc ?? bassPc) ? 0 : 1, exact ? 0 : 1, missing.length + extra.length, ORDER.get(type.kind)!, need.size],
  };
}

const ORDER = new Map(CHORD_TYPES.map((t, i) => [t.kind, i]));

/**
 * Ноты -> кандидаты на название, лучший первым. rootPc — рут, который назвал
 * человек; это не фильтр: аккорды от других рутов остаются, просто ниже.
 */
export function identifyChord(midis: readonly number[], rootPc: PitchClass | null = null, limit = 8): Identification {
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  let padDegrees: string[] | null = null;
  if (rootPc !== null && notes.length) {
    // якорь — самая низкая выбранная нота рута
    const anchor = notes.find((m) => mod(m, 12) === rootPc) ?? notes[0];
    padDegrees = Array.from({ length: PAD_COUNT }, (_, p) => degreeFromRoot(padMidi(p) - anchor));
  }
  if (!notes.length) return { candidates: [], interval: "", padDegrees };

  const pcs = new Set(notes.map((m) => mod(m, 12)));
  const bassPc = mod(notes[0], 12);
  let found: Ranked[] = [];
  for (let rp = 0; rp < 12; rp++)
    for (const type of CHORD_TYPES) {
      const c = candidate(rp, type, pcs, bassPc, rootPc);
      if (c) found.push(c);
    }
  found = found.map((c, i) => ({ c, i })).sort((a, b) => compareVectors(a.c.rank, b.c.rank) || a.i - b.i).map((x) => x.c);
  if (found.some((c) => c.exact)) found = found.filter((c) => c.exact);

  return {
    candidates: found.slice(0, limit).map(({ rank: _rank, ...c }) => c),
    interval: notes.length === 2 ? intervalName(notes[1] - notes[0]) : "",
    padDegrees,
  };
}
