/** Утилиты нот: классы высот, имена, правописание по ступени. */
import { INTERVALS, NOTE_FLAT, NOTE_SHARP, SCALES } from "./data";
import { floorDiv, mod, pyStrip } from "./py";

export const DEGREE_SHORT = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];

/** Короткое имя интервала: 0->'1', 4->'3', 14->'9', 21->'13'. */
export function intervalShort(n: number): string {
  const ent = INTERVALS.get(n);
  return ent ? ent.short : DEGREE_SHORT[mod(n, 12)];
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^[A-Ga-g][#b♯♭]*$/;

export class NoteError extends Error {}

/** 'C', 'F#', 'Bb' или число -> класс высоты 0..11. */
export function noteToPc(name: string | number): number {
  if (typeof name === "number") return mod(name, 12);
  const s = pyStrip(String(name));
  if (!s) throw new NoteError("пустое имя ноты");
  let pc = PC[s[0].toUpperCase()];
  if (pc === undefined) throw new NoteError(`неизвестная нота: '${name}'`);
  for (const ch of s.slice(1)) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
    else throw new NoteError(`неизвестный знак альтерации в '${name}'`);
  }
  return mod(pc, 12);
}

export function isNoteName(s: string): boolean {
  return NOTE_RE.test(pyStrip(s));
}

export function pcToName(pc: number, flats = false): string {
  return (flats ? NOTE_FLAT : NOTE_SHARP)[mod(pc, 12)];
}

/** Нотация Ableton: C3 = MIDI 60. */
export function midiToName(midi: number, flats = false, octave = true): string {
  const n = pcToName(midi, flats);
  return octave ? `${n}${floorDiv(midi, 12) - 2}` : n;
}

export function scaleSteps(scale: string | readonly number[]): number[] {
  if (typeof scale !== "string") return [...new Set(scale.map((x) => mod(x, 12)))].sort((a, b) => a - b);
  const ent = SCALES.get(scale);
  if (!ent) throw new Error(`неизвестная гамма: '${scale}'`);
  return [...ent.steps];
}

// --------------------------------------------------- правописание нот ------

const LETTERS = "CDEFGAB";

/** Имена, которые нормально читаются на пэде. Fb / Cb / E# / B# и двойные знаки
 *  теоретически верны, но для подписи пэда только мешают — их мы не используем. */
export const SIMPLE_NAMES: ReadonlySet<string> = new Set([...NOTE_SHARP, ...NOTE_FLAT]);

/**
 * Записать ноту по её ступени относительно тоники аккорда.
 *
 * 'G' + 'b3' + pc=10 -> 'Bb' (а не 'A#'): буква определяется номером ступени,
 * знак — тем, что нужно, чтобы попасть в нужный класс высоты.
 * "" — пусть решает вызывающий.
 */
export function spellFrom(rootName: string, degreeLabel: string, pc: number): string {
  const m = /\d+/.exec(degreeLabel);
  const dnum = m ? Number(m[0]) : 1;
  const step = mod(dnum - 1, 7);
  const letter = LETTERS[(LETTERS.indexOf(rootName[0].toUpperCase()) + step) % 7];
  const diff = mod(pc - PC[letter], 12);
  const acc = diff <= 6 ? diff : diff - 12;
  const name = letter + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc));
  return SIMPLE_NAMES.has(name) ? name : "";
}
