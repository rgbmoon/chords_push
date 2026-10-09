/**
 * Таблица типов аккордов и написаний. Таблица — это и есть парсер: символ
 * вроде "Bbmaj7b5" превращается в набор интервалов только если его суффикс
 * здесь есть. Генеративного разбора суффиксов нет осознанно.
 *
 * Порядок строк — от простого к сложному. Он значим: из одинаково хороших
 * вариантов определитель называет тот, что выше.
 *
 * Сторож (в тестах): у двух разных типов не должно совпадать множество классов
 * высот от одного рута, иначе одному набору нот достались бы два имени.
 * Поэтому нет Cadd13 и Cmadd13 (это C6 и Cm6), нет Cmaj13#11 (семь нот — больше
 * шести на схеме не бывает) и аккордов с одновременно альтерированными ноной и
 * ундецимой — их территорию закрывает C7alt.
 */
import { intervalShort } from "./intervals";

export interface ChordType {
  kind: string;
  /** интервалы от рута в полутонах, по возрастанию: add9 — это 14, а не 2 */
  intervals: readonly number[];
  name: string;
  /** подписи ступеней по порядку интервалов */
  degrees: readonly string[];
}

/** У увеличенных и уменьшённых аккордов ступени пишутся не так, как интервалы. */
const DEGREES: Record<string, readonly string[]> = {
  aug: ["1", "3", "#5"],
  aug7: ["1", "3", "#5", "b7"],
  maj7sharp5: ["1", "3", "#5", "7"],
  dim7: ["1", "b3", "b5", "bb7"],
  "9sharp5": ["1", "3", "#5", "b7", "9"],
  "7b9sharp5": ["1", "3", "#5", "b7", "b9"],
  "7sharp9sharp5": ["1", "3", "#5", "b7", "#9"],
};

const ROWS: readonly [kind: string, intervals: readonly number[], name: string][] = [
  // трезвучия
  ["maj", [0, 4, 7], "major triad"],
  ["min", [0, 3, 7], "minor triad"],
  ["dim", [0, 3, 6], "diminished triad"],
  ["aug", [0, 4, 8], "augmented triad"],
  ["sus2", [0, 2, 7], "suspended second"],
  ["sus4", [0, 5, 7], "suspended fourth"],
  ["5", [0, 7], "fifth / power chord"],
  ["majb5", [0, 4, 6], "major flat five"],
  ["sus4add9", [0, 5, 7, 14], "sus4 add nine"],
  // сексты
  ["6", [0, 4, 7, 9], "major sixth"],
  ["min6", [0, 3, 7, 9], "minor sixth"],
  ["6_9", [0, 4, 7, 9, 14], "six-nine"],
  ["min6_9", [0, 3, 7, 9, 14], "minor six-nine"],
  ["6sus4", [0, 5, 7, 9], "sixth sus4"],
  // септаккорды
  ["maj7", [0, 4, 7, 11], "major seventh"],
  ["min7", [0, 3, 7, 10], "minor seventh"],
  ["7", [0, 4, 7, 10], "dominant seventh"],
  ["minMaj7", [0, 3, 7, 11], "minor-major seventh"],
  ["m7b5", [0, 3, 6, 10], "half-diminished seventh"],
  ["dim7", [0, 3, 6, 9], "diminished seventh"],
  ["aug7", [0, 4, 8, 10], "augmented seventh"],
  ["maj7b5", [0, 4, 6, 11], "major seventh flat five"],
  ["maj7sharp5", [0, 4, 8, 11], "major seventh sharp five"],
  ["7b5", [0, 4, 6, 10], "seventh flat five"],
  ["7sus4", [0, 5, 7, 10], "seventh sus4"],
  ["7sus2", [0, 2, 7, 10], "seventh sus2"],
  ["maj7sus2", [0, 2, 7, 11], "major seventh sus2"],
  ["maj7sus4", [0, 5, 7, 11], "major seventh sus4"],
  ["dimMaj7", [0, 3, 6, 11], "diminished major seventh"],
  // ноны
  ["add9", [0, 4, 7, 14], "major add nine"],
  ["madd9", [0, 3, 7, 14], "minor add nine"],
  ["maj9", [0, 4, 7, 11, 14], "major ninth"],
  ["min9", [0, 3, 7, 10, 14], "minor ninth"],
  ["9", [0, 4, 7, 10, 14], "dominant ninth"],
  ["7b9", [0, 4, 7, 10, 13], "seventh flat nine"],
  ["7sharp9", [0, 4, 7, 10, 15], "seventh sharp nine"],
  ["m9b5", [0, 3, 6, 10, 14], "half-diminished ninth"],
  ["m7b9", [0, 3, 7, 10, 13], "minor seventh flat nine"],
  ["minMaj9", [0, 3, 7, 11, 14], "minor-major ninth"],
  ["9sus4", [0, 5, 7, 10, 14], "ninth sus4"],
  ["7susb9", [0, 5, 7, 10, 13], "seventh sus4 flat nine"],
  ["9b5", [0, 4, 6, 10, 14], "ninth flat five"],
  ["9sharp5", [0, 4, 8, 10, 14], "ninth sharp five"],
  ["7b9sharp5", [0, 4, 8, 10, 13], "seventh flat nine sharp five"],
  ["7sharp9sharp5", [0, 4, 8, 10, 15], "seventh sharp nine sharp five"],
  // ундецимы и терцдецимы
  ["add11", [0, 4, 7, 17], "major add eleven"],
  ["addsharp11", [0, 4, 7, 18], "major add sharp eleven"],
  ["madd11", [0, 3, 7, 17], "minor add eleven"],
  ["maj11", [0, 4, 7, 11, 14, 17], "major eleventh"],
  ["min11", [0, 3, 7, 10, 14, 17], "minor eleventh"],
  ["11", [0, 4, 7, 10, 14, 17], "dominant eleventh"],
  ["7sharp11", [0, 4, 7, 10, 18], "seventh sharp eleven"],
  ["maj7sharp11", [0, 4, 7, 11, 18], "major seventh sharp eleven"],
  ["maj9sharp11", [0, 4, 7, 11, 14, 18], "major ninth sharp eleven"],
  ["9sharp11", [0, 4, 7, 10, 14, 18], "ninth sharp eleven"],
  ["m11b5", [0, 3, 6, 10, 14, 17], "half-diminished eleventh"],
  ["maj13", [0, 4, 7, 11, 14, 21], "major thirteenth"],
  ["min13", [0, 3, 7, 10, 14, 21], "minor thirteenth"],
  ["13", [0, 4, 7, 10, 14, 21], "dominant thirteenth"],
  ["13sus4", [0, 5, 7, 10, 14, 21], "thirteenth sus4"],
  ["13b9", [0, 4, 7, 10, 13, 21], "thirteenth flat nine"],
  // у 13#11 квинта опущена: с ней вышло бы семь нот, а живой пианист в этом
  // аккорде как раз квинту и убирает — её место занимает #11
  ["13sharp11", [0, 4, 10, 14, 18, 21], "thirteenth sharp eleven"],
  ["7b13", [0, 4, 7, 10, 20], "seventh flat thirteen"],
  ["7b9b13", [0, 4, 7, 10, 13, 20], "seventh flat nine flat thirteen"],
  ["7sharp9b13", [0, 4, 7, 10, 15, 20], "seventh sharp nine flat thirteen"],
  ["7alt", [0, 4, 10, 13, 15, 20], "altered dominant"],
];

export const CHORD_TYPES: readonly ChordType[] = ROWS.map(([kind, intervals, name]) => ({
  kind,
  intervals,
  name,
  degrees: DEGREES[kind] ?? intervals.map(intervalShort),
}));

const BY_KIND = new Map(CHORD_TYPES.map((t) => [t.kind, t]));

export function chordType(kind: string): ChordType {
  const t = BY_KIND.get(kind);
  if (!t) throw new Error(`unknown chord type: '${kind}'`);
  return t;
}

/** Больше нот, чем у самого большого типа, в аккорде не бывает (сейчас 6). */
export const MAX_CHORD_NOTES = Math.max(...CHORD_TYPES.map((t) => new Set(t.intervals.map((i) => i % 12)).size));

/**
 * Суффикс символа -> тип. Регистр значим: "M7" — большой мажорный, "m7" —
 * малый минорный; поиск по нижнему регистру — только запасной.
 */
export const SUFFIXES: readonly [suffix: string, kind: string][] = [
  // трезвучия
  ["", "maj"], ["maj", "maj"], ["major", "maj"], ["M", "maj"], ["△", "maj"],
  ["m", "min"], ["min", "min"], ["minor", "min"], ["-", "min"],
  ["dim", "dim"], ["o", "dim"], ["°", "dim"],
  ["aug", "aug"], ["+", "aug"],
  ["sus", "sus4"], ["sus2", "sus2"], ["sus4", "sus4"],
  ["5", "5"], ["no3", "5"],
  ["b5", "majb5"], ["majb5", "majb5"],
  ["sus4add9", "sus4add9"], ["susadd9", "sus4add9"], ["sus2sus4", "sus4add9"],
  // сексты
  ["6", "6"], ["m6", "min6"], ["min6", "min6"], ["-6", "min6"],
  ["6/9", "6_9"], ["69", "6_9"], ["6add9", "6_9"],
  ["m6/9", "min6_9"], ["m69", "min6_9"],
  ["6sus4", "6sus4"], ["6sus", "6sus4"],
  // септаккорды
  ["maj7", "maj7"], ["ma7", "maj7"], ["M7", "maj7"], ["△7", "maj7"], ["j7", "maj7"],
  ["m7", "min7"], ["min7", "min7"], ["-7", "min7"],
  ["7", "7"], ["dom7", "7"],
  ["mmaj7", "minMaj7"], ["mMaj7", "minMaj7"], ["minmaj7", "minMaj7"], ["-maj7", "minMaj7"],
  ["m7b5", "m7b5"], ["ø", "m7b5"], ["ø7", "m7b5"], ["halfdim", "m7b5"],
  ["min7b5", "m7b5"],
  ["dim7", "dim7"], ["o7", "dim7"], ["°7", "dim7"],
  ["7#5", "aug7"], ["aug7", "aug7"], ["+7", "aug7"], ["7+5", "aug7"],
  ["maj7b5", "maj7b5"], ["M7b5", "maj7b5"],
  ["maj7#5", "maj7sharp5"], ["M7#5", "maj7sharp5"], ["+maj7", "maj7sharp5"],
  ["7b5", "7b5"],
  ["7sus4", "7sus4"], ["7sus", "7sus4"], ["7sus2", "7sus2"],
  ["maj7sus2", "maj7sus2"], ["M7sus2", "maj7sus2"],
  ["maj7sus4", "maj7sus4"], ["maj7sus", "maj7sus4"], ["M7sus4", "maj7sus4"],
  ["dimmaj7", "dimMaj7"], ["dimMaj7", "dimMaj7"], ["omaj7", "dimMaj7"],
  ["°maj7", "dimMaj7"],
  // ноны
  ["add9", "add9"], ["add2", "add9"],
  ["madd9", "madd9"], ["madd2", "madd9"], ["minadd9", "madd9"],
  ["maj9", "maj9"], ["M9", "maj9"], ["△9", "maj9"],
  ["m9", "min9"], ["min9", "min9"], ["-9", "min9"],
  ["9", "9"],
  ["7b9", "7b9"], ["7#9", "7sharp9"],
  ["m9b5", "m9b5"],
  ["m7b9", "m7b9"], ["min7b9", "m7b9"],
  ["mmaj9", "minMaj9"], ["mMaj9", "minMaj9"], ["minmaj9", "minMaj9"],
  ["9sus4", "9sus4"], ["9sus", "9sus4"],
  ["7susb9", "7susb9"], ["7sus4b9", "7susb9"], ["susb9", "7susb9"],
  ["9b5", "9b5"], ["9#5", "9sharp5"], ["9+5", "9sharp5"],
  ["7b9#5", "7b9sharp5"], ["7#5b9", "7b9sharp5"],
  ["7#9#5", "7sharp9sharp5"], ["7#5#9", "7sharp9sharp5"],
  // ундецимы и терцдецимы
  ["add11", "add11"], ["add4", "add11"],
  ["add#11", "addsharp11"], ["addsharp11", "addsharp11"], ["add#4", "addsharp11"],
  ["maj11", "maj11"], ["M11", "maj11"],
  ["m11", "min11"], ["min11", "min11"], ["11", "11"],
  ["7#11", "7sharp11"],
  ["maj7#11", "maj7sharp11"], ["M7#11", "maj7sharp11"], ["△7#11", "maj7sharp11"],
  ["maj9#11", "maj9sharp11"], ["M9#11", "maj9sharp11"],
  ["9#11", "9sharp11"],
  ["m11b5", "m11b5"], ["min11b5", "m11b5"],
  ["madd11", "madd11"], ["madd4", "madd11"], ["minadd11", "madd11"],
  ["maj13", "maj13"], ["M13", "maj13"],
  ["m13", "min13"], ["min13", "min13"], ["13", "13"],
  ["13sus4", "13sus4"], ["13sus", "13sus4"],
  ["13b9", "13b9"], ["13#11", "13sharp11"],
  ["7b13", "7b13"], ["alt", "7alt"], ["7alt", "7alt"],
  ["7b9b13", "7b9b13"], ["7#9b13", "7sharp9b13"],
  // треугольник набирают двумя разными символами: △ и греческой дельтой
  ["Δ", "maj"], ["Δ7", "maj7"], ["Δ9", "maj9"],
  ["Δ11", "maj11"], ["Δ13", "maj13"],
  ["△11", "maj11"], ["△13", "maj13"],

];

const KIND_OF_SUFFIX = new Map(SUFFIXES);

export const kindOfSuffix = (suffix: string): string | undefined =>
  KIND_OF_SUFFIX.get(suffix) ?? KIND_OF_SUFFIX.get(suffix.toLowerCase());

/**
 * Как тип пишется в символе, который показывает приложение. По умолчанию —
 * первый алиас из таблицы; несколько случаев поправлены руками.
 */
const PREFERRED_SUFFIX: Record<string, string> = {
  maj: "", // C, а не Cmaj
  sus4: "sus4", // 'sus' короче, но 'sus4' понятнее
  majb5: "(b5)", // 'Cb5' прочиталось бы как квинта от C-бемоль
  minMaj7: "mMaj7",
  minMaj9: "mMaj9",
  dimMaj7: "dim(maj7)", // 'C#dimmaj7' читается тяжело
  "7alt": "7alt", // 'Calt' без семёрки читается хуже
};

const FIRST_SUFFIX = new Map<string, string>();
for (const [suffix, kind] of SUFFIXES) if (!FIRST_SUFFIX.has(kind)) FIRST_SUFFIX.set(kind, suffix);

export const suffixOf = (kind: string): string => PREFERRED_SUFFIX[kind] ?? FIRST_SUFFIX.get(kind) ?? kind;
