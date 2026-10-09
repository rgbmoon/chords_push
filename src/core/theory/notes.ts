/** Ноты: классы высот, имена и правописание по ступени. */
import { mod } from "../math";

/** Класс высоты: 0 = C, 1 = C#/Db … 11 = B. */
export type PitchClass = number;

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Имена, которые нормально читаются на пэде. Fb, E#, двойные знаки теоретически верны, но только мешают. */
const READABLE_NAMES: ReadonlySet<string> = new Set([...SHARP_NAMES, ...FLAT_NAMES]);
export const isReadableName = (name: string): boolean => READABLE_NAMES.has(name);

const LETTER_PC: Record<string, PitchClass> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = "CDEFGAB";
const NOTE_NAME = /^[A-Ga-g][#b♯♭]*$/;

export class NoteSyntaxError extends Error {}

export const isNoteName = (s: string): boolean => NOTE_NAME.test(s.trim());

/** 'C', 'F#', 'Bb', 'B♭' -> класс высоты. */
export function parseNoteName(name: string): PitchClass {
  const s = name.trim();
  if (!NOTE_NAME.test(s)) throw new NoteSyntaxError(`unknown note: '${name}'`);
  let pc = LETTER_PC[s[0].toUpperCase()];
  for (const ch of s.slice(1)) pc += ch === "#" || ch === "♯" ? 1 : -1;
  return mod(pc, 12);
}

export const pcName = (pc: PitchClass, flats = false): string => (flats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)];

/** Октава в нотации Ableton: C3 = MIDI 60. */
export const octaveOf = (midi: number): number => Math.floor(midi / 12) - 2;

export const midiName = (midi: number, flats = false): string => `${pcName(midi, flats)}${octaveOf(midi)}`;

/**
 * Записать ноту по её ступени от тоники: G + b3 -> Bb, а не A#. Буква берётся
 * по номеру ступени, знак — тот, что нужен до нужного класса высоты.
 * null — читаемого имени нет (вышло бы Fb или двойной знак), пусть решает вызывающий.
 */
export function spellNote(rootName: string, degree: string, pc: PitchClass): string | null {
  const step = Number(/\d+/.exec(degree)?.[0] ?? 1) - 1;
  const letter = LETTERS[(LETTERS.indexOf(rootName[0].toUpperCase()) + step) % 7];
  const diff = mod(pc - LETTER_PC[letter], 12);
  const shift = diff <= 6 ? diff : diff - 12;
  const name = letter + (shift > 0 ? "#".repeat(shift) : "b".repeat(-shift));
  return isReadableName(name) ? name : null;
}
