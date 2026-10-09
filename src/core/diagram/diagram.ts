/**
 * Схема аккорда на сетке: что написано на каждом пэде и какую роль он играет.
 *
 * Роли:
 *   chord — нота выбранной раскладки;
 *   ghost — та же нота на другом пэде или в другой октаве (бледная): по ней
 *           можно кликнуть и перенести туда голос — так задаётся обращение;
 *   extra — нота, добавленная руками; в аккорд не входит.
 * Рут аккорда отмечается отдельно — он зелёный, в басу он или нет.
 */
import { ALL_PADS, byPadPitch, Pad, PadColor, padColor, padMidi, padPc, PADS_TOP_DOWN } from "../grid/grid";
import { mod } from "../math";
import type { Chord } from "../theory/chord";
import { intervalShort } from "../theory/intervals";
import { octaveOf, pcName } from "../theory/notes";

export type PadRole = "chord" | "ghost" | "extra";

/** Подписи пэда в схеме конкретного аккорда. */
export interface PadLabel {
  pad: Pad;
  color: PadColor;
  /** имя ноты в правописании аккорда: Bb, а не A# */
  name: string;
  /**
   * Ступень от рута — у ВСЕХ пэдов, не только у нот аккорда: выделить руками
   * можно любую ноту, и подпись должна быть готова заранее.
   */
  degree: string;
}

const degreeOf = (chord: Chord, pc: number): string => chord.degreeByPc.get(pc) ?? intervalShort(mod(pc - chord.rootPc, 12));

/** Подписи всех 64 пэдов, в порядке отрисовки (верхний ряд первым). */
export function padLabels(chord: Chord): PadLabel[] {
  return PADS_TOP_DOWN.map((pad) => {
    const pc = padPc(pad);
    return { pad, color: padColor(pad), name: chord.nameByPc.get(pc) || pcName(pc, chord.prefersFlats), degree: degreeOf(chord, pc) };
  });
}

/** Состояние схемы: пэды аккорда и ноты, добавленные руками. */
export interface DiagramState {
  pads: Pad[];
  extra: Pad[];
}

const isChordTone = (chord: Chord, pad: Pad) => chord.pitchClasses.includes(padPc(pad));

export const initialDiagram = (solverPads: readonly Pad[]): DiagramState => ({ pads: [...solverPads], extra: [] });

/** Сохранённая правка принимается, только если число нот сошлось: источник могли поменять под тем же именем. */
export function restoreDiagram(solverPads: readonly Pad[], saved: DiagramState | null | undefined): DiagramState {
  return saved && saved.pads.length === solverPads.length ? { pads: [...saved.pads], extra: [...saved.extra] } : initialDiagram(solverPads);
}

/**
 * Клик по пэду:
 *   по ноте аккорда, которая уже звучит здесь, — ничего;
 *   по бледному пэду — переносит на него ближайший голос той же ноты;
 *   по любому другому — добавляет свою ноту, повторный клик её снимает.
 */
export function clickPad(chord: Chord, state: DiagramState, pad: Pad): DiagramState {
  if (state.pads.includes(pad)) return state;
  if (state.extra.includes(pad)) return { ...state, extra: state.extra.filter((p) => p !== pad) };
  if (!isChordTone(chord, pad)) return { ...state, extra: [...state.extra, pad] };
  const samePc = state.pads.filter((p) => padPc(p) === padPc(pad));
  if (!samePc.length) return state;
  const distance = (p: Pad) => Math.abs(padMidi(p) - padMidi(pad));
  const nearest = samePc.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  return { ...state, pads: state.pads.map((p) => (p === nearest ? pad : p)) };
}

export interface PadView {
  role: PadRole | null;
  isRoot: boolean;
}

export function padView(chord: Chord, state: DiagramState, pad: Pad): PadView {
  const role: PadRole | null = state.pads.includes(pad)
    ? "chord"
    : state.extra.includes(pad)
      ? "extra"
      : isChordTone(chord, pad)
        ? "ghost"
        : null;
  return { role, isRoot: role !== "extra" && role !== null && padPc(pad) === chord.rootPc };
}

const INVERSIONS = ["root position", "1st inversion", "2nd inversion", "3rd inversion", "4th inversion", "5th inversion"];

const sameSet = (a: readonly Pad[], b: readonly Pad[]) => a.length === b.length && a.every((p) => b.includes(p));

export interface DiagramSummary {
  /** ноты аккорда снизу вверх: 'Bb2', 'D3' */
  notes: string[];
  extraNotes: string[];
  degrees: string[];
  /** ступени своих нот без повторов: одна нота в двух октавах — одна ступень */
  extraDegrees: string[];
  /** схема отличается от раскладки солвера */
  edited: boolean;
  /**
   * Какое обращение вышло — только если руками двигали САМ аккорд: добавленные
   * сбоку ноты бас не меняют, и писать «root position» незачем.
   */
  inversion: string;
}

export function summarize(chord: Chord, state: DiagramState, solverPads: readonly Pad[]): DiagramSummary {
  const label = (p: Pad) => `${chord.nameByPc.get(padPc(p)) || pcName(padPc(p), chord.prefersFlats)}${octaveOf(padMidi(p))}`;
  const pads = [...state.pads].sort(byPadPitch);
  const extra = [...state.extra].sort(byPadPitch);
  const moved = !sameSet(state.pads, solverPads);
  // порядок ступеней от рута: индекс баса в нём — номер обращения
  const byDegree = [...chord.pitchClasses].sort((a, b) => mod(a - chord.rootPc, 12) - mod(b - chord.rootPc, 12));
  return {
    notes: pads.map(label),
    extraNotes: extra.map(label),
    degrees: pads.map((p) => degreeOf(chord, padPc(p))),
    extraDegrees: [...new Set(extra.map((p) => degreeOf(chord, padPc(p))))],
    edited: moved || extra.length > 0,
    inversion: moved && pads.length ? (INVERSIONS[byDegree.indexOf(padPc(pads[0]))] ?? "") : "",
  };
}

/** Пэды схемы, которые подсвечиваются бледным: все прочие пэды тех же классов высот. */
export const ghostPads = (chord: Chord, pads: readonly Pad[]): Pad[] =>
  ALL_PADS.filter((p) => !pads.includes(p) && isChordTone(chord, p));
