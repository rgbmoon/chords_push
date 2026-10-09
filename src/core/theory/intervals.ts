/** Интервалы: короткие подписи ступеней и полные названия. */
import { mod } from "../math";

interface Interval {
  /** подпись ступени: 'b3', '9', '#11' */
  short: string;
  name: string;
}

/** Индекс — расстояние в полутонах. Таблица доходит до терцдецимы (21). */
const INTERVALS: readonly Interval[] = [
  { short: "1", name: "unison" },
  { short: "b2", name: "minor second" },
  { short: "2", name: "major second" },
  { short: "b3", name: "minor third" },
  { short: "3", name: "major third" },
  { short: "4", name: "perfect fourth" },
  { short: "b5", name: "tritone" },
  { short: "5", name: "perfect fifth" },
  { short: "b6", name: "minor sixth" },
  { short: "6", name: "major sixth" },
  { short: "b7", name: "minor seventh" },
  { short: "7", name: "major seventh" },
  { short: "8", name: "octave" },
  { short: "b9", name: "minor ninth" },
  { short: "9", name: "major ninth" },
  { short: "#9", name: "augmented ninth" },
  { short: "10", name: "major tenth" },
  { short: "11", name: "perfect eleventh" },
  { short: "#11", name: "augmented eleventh" },
  { short: "12", name: "perfect twelfth" },
  { short: "b13", name: "minor thirteenth" },
  { short: "13", name: "major thirteenth" },
];

/** Подпись ступени: 0 -> '1', 4 -> '3', 14 -> '9', 21 -> '13'; дальше — свёрнутая в октаву. */
export function intervalShort(semitones: number): string {
  return INTERVALS[semitones]?.short ?? INTERVALS[mod(semitones, 12)].short;
}

/**
 * Название интервала по РЕАЛЬНОМУ расстоянию, а не по классам высот: C и Db
 * октавой выше — малая нона, а не малая секунда. Сетка растягивается на 42
 * полутона, а таблица — на 21: дальше название составное.
 */
export function intervalName(semitones: number): string {
  const n = Math.abs(Math.trunc(semitones));
  if (INTERVALS[n]) return INTERVALS[n].name;
  const octaves = Math.floor(n / 12);
  const rest = n % 12;
  if (rest === 0) return ({ 2: "two octaves", 3: "three octaves" } as Record<number, string>)[octaves] ?? `${octaves} octaves`;
  return `${INTERVALS[rest].name} plus ${octaves === 1 ? "an octave" : `${octaves} octaves`}`;
}

/**
 * Ступень ноты от рута по реальному расстоянию: выше октавы — настоящая
 * ступень (9, 11, 13), ниже рута и дальше терцдецимы — свёрнутая в октаву.
 */
export function degreeFromRoot(semitones: number): string {
  return semitones >= 0 && semitones < INTERVALS.length ? INTERVALS[semitones].short : INTERVALS[mod(semitones, 12)].short;
}
