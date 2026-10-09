/**
 * Аппликатуры: как разложить аккорд по пэдам и как выбрать раскладки для
 * целой цепочки, чтобы рука ходила по гриду как можно меньше.
 *
 * Структура аккорда неприкосновенна: рут всегда в басу (или заданный слэш-бас),
 * набор интервалов — ровно тот, что в символе. Солверу остаются два рычага:
 * октава всего аккорда и выбор пэда для каждой ноты (одна нота лежит на
 * нескольких пэдах).
 */
import { byNumber, cartesian, compareVectors, indexOfMin, mod } from "../math";
import type { Chord } from "../theory/chord";
import { COLS, HIGHEST_MIDI, LOWEST_MIDI, Pad, padCol, padRow, padsOfMidi, ROWS, spanCols } from "./grid";

/**
 * Настройки солвера. Цена узла = компактность + регистр; цена перехода =
 * движение голосов + сдвиг руки − премия за пэды, оставшиеся на месте.
 * Замер на шести цепочках против независимого выбора: путь руки −51%,
 * общих нот ×1.7, движение голосов −14%.
 */
export const SOLVER = {
  /**
   * Фигура держится в узкой полосе КОЛОНОК — пальцы разъезжаются вбок, а не по
   * рядам. Трезвучие уже четырёх колонок не ложится (квинта и терция дают
   * минимум 4), sus- и квартовые фигуры ложатся в три.
   */
  maxCols: 4,
  /** если аккорд в потолок не лезет — потолок отпускается по шагам, а не режет ноты */
  relaxCols: [5, 6, 7, 8],
  weights: {
    compact: 0.35, // габарит фигуры
    register: 1.4, // уход центра фигуры от середины грида
    voice: 1.0, // среднее движение голосов в полутонах
    hand: 1.2, // сдвиг центра фигуры по пэдам
    hold: 0.85, // премия за каждую ноту, остающуюся на том же пэде
  },
  /** октавы, от которых пробуется рут */
  lows: [36, 41, 43, 48, 53, 55, 60],
  /** сколько лучших раскладок одной октавы идёт в перебор цепочки */
  placementsPerOctave: 6,
} as const;

export interface Voicing {
  chord: Chord;
  /** MIDI-ноты по возрастанию */
  notes: number[];
  /** пэд каждой ноты, в том же порядке */
  pads: Pad[];
  /** насколько сдвинулась рука от прошлого аккорда; null у первого */
  move: number | null;
}

/** MIDI-ноты аккорда с рутом в октаве от `low`. Слэш-бас уходит ниже рута и становится нижним голосом. */
export function chordPitches(chord: Chord, low = 48): number[] {
  const root = low + mod(chord.rootPc - low, 12);
  let notes = chord.intervals.map((iv) => root + iv);
  if (chord.bassPc !== null) {
    let bass = root + mod(chord.bassPc - root, 12);
    while (bass >= Math.min(...notes)) bass -= 12;
    notes = [...notes.filter((n) => mod(n, 12) !== chord.bassPc), bass];
  }
  return notes.sort(byNumber);
}

/** Насколько фигура «неудобна»: сначала габарит (в компактном режиме колонки дороже рядов), потом место. */
function shapeCost(pads: readonly Pad[], compact: boolean): number[] {
  const rows = pads.map(padRow);
  const cols = pads.map(padCol);
  const h = Math.max(...rows) - Math.min(...rows);
  const w = Math.max(...cols) - Math.min(...cols);
  return [compact ? w * 3 + h : h * 3 + w, w, h, Math.min(...rows), Math.min(...cols)];
}

export interface PlacementOptions {
  limit?: number;
  /** держать фигуру в SOLVER.maxCols колонках */
  compact?: boolean;
}

/** Все способы разложить ноты по пэдам — от самого компактного. */
export function placements(notes: readonly number[], { limit, compact = true }: PlacementOptions = {}): Pad[][] {
  const options = [...notes].sort(byNumber).map((n) => padsOfMidi(n));
  const all: { pads: Pad[]; width: number; cost: number[] }[] = [];
  for (const pads of cartesian(options)) {
    if (new Set(pads).size === pads.length) all.push({ pads, width: spanCols(pads), cost: shapeCost(pads, compact) });
  }
  let fit = all;
  if (compact) {
    for (const cap of [SOLVER.maxCols, ...SOLVER.relaxCols]) {
      const narrow = all.filter((x) => x.width <= cap);
      if (narrow.length) {
        fit = narrow;
        break;
      }
    }
  }
  const sorted = fit.sort((a, b) => compareVectors(a.cost, b.cost)).map((x) => x.pads);
  return limit ? sorted.slice(0, limit) : sorted;
}

const fitsGrid = (notes: readonly number[]) => notes[0] >= LOWEST_MIDI && notes[notes.length - 1] <= HIGHEST_MIDI;

export class VoicingError extends Error {}

const outOfRange = (chord: Chord) => new VoicingError(`chord ${chord.symbol} doesn't fit the grid range`);

export interface VoicingOptions {
  /** держать фигуру в SOLVER.maxCols колонках (по умолчанию — да) */
  compact?: boolean;
}

/** Самая компактная раскладка одного аккорда, без оглядки на соседей. */
export function voiceChord(chord: Chord, { compact = true }: VoicingOptions = {}): Voicing {
  for (const low of [48, 43, 53, 36]) {
    const notes = chordPitches(chord, low);
    if (!fitsGrid(notes)) continue;
    const [pads] = placements(notes, { limit: 1, compact });
    if (pads) return { chord, notes, pads, move: null };
  }
  throw outOfRange(chord);
}

// ------------------------------------------------- голосоведение по цепочке --

function centroid(pads: readonly Pad[]): [number, number] {
  const n = pads.length;
  return [pads.reduce((s, p) => s + padRow(p), 0) / n, pads.reduce((s, p) => s + padCol(p), 0) / n];
}

/** Среднее движение голосов в полутонах — симметрично, для аккордов разного размера. */
export function voiceDistance(prev: readonly number[], next: readonly number[]): number {
  if (!prev.length || !next.length) return 0;
  const near = (from: readonly number[], to: readonly number[]) =>
    from.reduce((s, n) => s + Math.min(...to.map((m) => Math.abs(n - m))), 0) / from.length;
  return (near(next, prev) + near(prev, next)) / 2;
}

/** Сдвиг руки: расстояние между центрами фигур, в пэдах. */
export function handMove(prev: readonly Pad[], next: readonly Pad[]): number {
  const [pr, pc] = centroid(prev);
  const [nr, nc] = centroid(next);
  return Math.hypot(nr - pr, nc - pc);
}

/** Сколько пэдов остаётся зажатыми при переходе. */
export const heldPads = (prev: readonly Pad[], next: readonly Pad[]): number => next.filter((p) => prev.includes(p)).length;

function placementCost(pads: readonly Pad[], compact: boolean): number {
  const rows = pads.map(padRow);
  const cols = pads.map(padCol);
  const h = Math.max(...rows) - Math.min(...rows);
  const w = Math.max(...cols) - Math.min(...cols);
  const size = compact ? h + 3 * w : 3 * h + w;
  // середина грида лучше краёв: там больше вариантов рядом
  const [cr, cc] = centroid(pads);
  const midR = (ROWS - 1) / 2;
  const midC = (COLS - 1) / 2;
  const edge = (Math.abs(cr - midR) / midR + Math.abs(cc - midC) / midC) / 2;
  return (SOLVER.weights.compact * size) / 4 + SOLVER.weights.register * edge;
}

function transitionCost(prevNotes: readonly number[], prevPads: readonly Pad[], notes: readonly number[], pads: readonly Pad[]): number {
  const w = SOLVER.weights;
  return w.voice * voiceDistance(prevNotes, notes) + w.hand * handMove(prevPads, pads) - w.hold * heldPads(prevPads, pads);
}

interface Candidate {
  notes: number[];
  pads: Pad[];
  cost: number;
}

function candidates(chord: Chord, compact: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const low of SOLVER.lows) {
    const notes = chordPitches(chord, low);
    if (!fitsGrid(notes) || out.some((c) => c.notes[0] === notes[0])) continue;
    for (const pads of placements(notes, { limit: SOLVER.placementsPerOctave, compact }))
      out.push({ notes, pads, cost: placementCost(pads, compact) });
  }
  if (!out.length) throw outOfRange(chord);
  return out;
}

export interface ProgressionOptions extends VoicingOptions {
  /** выбирать раскладки с оглядкой на соседей (по умолчанию — да) */
  voiceLeading?: boolean;
}

/**
 * Раскладки для всей цепочки сразу — динамическое программирование (Витерби):
 * состояние — вариант раскладки одного аккорда, переход — смена руки.
 */
export function voiceProgression(chords: readonly Chord[], { compact = true, voiceLeading = true }: ProgressionOptions = {}): Voicing[] {
  if (!chords.length) return [];
  if (!voiceLeading) return withMoves(chords.map((c) => voiceChord(c, { compact })));

  const layers = chords.map((c) => candidates(c, compact));
  let best = layers[0].map((c) => c.cost);
  const back: number[][] = [];
  for (let k = 1; k < layers.length; k++) {
    const prev = layers[k - 1];
    const ptr: number[] = [];
    best = layers[k].map((cur) => {
      const totals = prev.map((p, j) => best[j] + transitionCost(p.notes, p.pads, cur.notes, cur.pads));
      const j = indexOfMin(totals);
      ptr.push(j);
      return totals[j] + cur.cost;
    });
    back.push(ptr);
  }

  const path = [indexOfMin(best)];
  for (let k = back.length - 1; k >= 0; k--) path.unshift(back[k][path[0]]);
  return withMoves(chords.map((chord, k) => ({ chord, notes: layers[k][path[k]].notes, pads: layers[k][path[k]].pads, move: null })));
}

function withMoves(voicings: Voicing[]): Voicing[] {
  return voicings.map((v, k) => (k ? { ...v, move: handMove(voicings[k - 1].pads, v.pads) } : v));
}
