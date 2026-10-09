/**
 * Нотная сетка Ableton Push: режим Note / Chromatic, раскладка 4ths.
 *
 *   midi(r, c) = 36 + 5*r + c
 *
 * r — ряд снизу вверх (0..7), c — колонка слева направо (0..7). Вправо на пэд —
 * полутон, вверх на ряд — кварта; (+1, −5) — та же нота, (+2, +2) — октава.
 * Колонки 5–7 ряда r совпадают с колонками 0–2 ряда r+1: из 64 пэдов 43
 * уникальные высоты, 21 пэд — повтор. Эти повторы и есть обращения на схеме.
 *
 * Пэд — его номер r*8 + c.
 */
import { mod } from "../math";
import type { PitchClass } from "../theory/notes";

export type Pad = number;

export const ROWS = 8;
export const COLS = 8;
export const PAD_COUNT = ROWS * COLS;
const ROW_INTERVAL = 5;
const BASE_MIDI = 36; // нижний левый пэд — C1 (нотация Ableton, C3 = MIDI 60)

export const padRow = (pad: Pad): number => Math.floor(pad / COLS);
export const padCol = (pad: Pad): number => pad % COLS;
export const padAt = (row: number, col: number): Pad => row * COLS + col;
export const padMidi = (pad: Pad): number => BASE_MIDI + ROW_INTERVAL * padRow(pad) + padCol(pad);
export const padPc = (pad: Pad): PitchClass => padMidi(pad) % 12;

export const ALL_PADS: readonly Pad[] = Array.from({ length: PAD_COUNT }, (_, p) => p);
export const LOWEST_MIDI = padMidi(0);
export const HIGHEST_MIDI = padMidi(PAD_COUNT - 1);

/** Пэды в порядке отрисовки: верхний ряд первым. */
export const PADS_TOP_DOWN: readonly Pad[] = Array.from({ length: ROWS }, (_, i) =>
  Array.from({ length: COLS }, (_, c) => padAt(ROWS - 1 - i, c)),
).flat();

const PADS_BY_MIDI = new Map<number, Pad[]>();
for (const p of ALL_PADS) PADS_BY_MIDI.set(padMidi(p), [...(PADS_BY_MIDI.get(padMidi(p)) ?? []), p]);

/** Все пэды, играющие эту ноту: их бывает несколько. */
export const padsOfMidi = (midi: number): readonly Pad[] => PADS_BY_MIDI.get(midi) ?? [];

export const byPadPitch = (a: Pad, b: Pad): number => padMidi(a) - padMidi(b);

/** Сколько колонок занимает фигура — это и есть «ширина под руку». */
export function spanCols(pads: readonly Pad[]): number {
  const cols = pads.map(padCol);
  return Math.max(...cols) - Math.min(...cols) + 1;
}

/**
 * Раскраска сетки, как на железе: тоника C — оранжевая, гамма C major —
 * белая, остальное тёмное. Scale на Push не переключается: любые аккорды
 * строятся поверх одного и того же визуала.
 */
export type PadColor = "tonic" | "scale" | "off";

const C_MAJOR: ReadonlySet<PitchClass> = new Set([0, 2, 4, 5, 7, 9, 11]);

export function padColor(pad: Pad): PadColor {
  const pc = padPc(pad);
  if (pc === 0) return "tonic";
  return C_MAJOR.has(mod(pc, 12)) ? "scale" : "off";
}
