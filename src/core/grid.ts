/**
 * Нотная сетка Push: Chromatic, раскладка 4ths.
 *
 * Пэд в ядре — это его номер `r*8 + c` (ряд снизу вверх, колонка слева
 * направо). В Python пэдом был кортеж (r, c); номер удобнее: он сам себе ключ
 * для Set/Map и в том же порядке сортируется.
 *
 * root / scale задают только РАСКРАСКУ (какие пэды белые, какой оранжевый).
 * Рабочее значение по умолчанию — C major, менять его в проекте не нужно.
 */
import { BASE_MIDI, COLS, DEFAULT_ROOT, DEFAULT_SCALE, ROWS, ROW_SEMITONES } from "./data";
import { midiToName, noteToPc, scaleSteps } from "./notes";
import { mod } from "./py";

export type Pad = number;
export type BaseState = "root" | "in_key" | "off";

export const padRow = (p: Pad): number => Math.floor(p / COLS);
export const padCol = (p: Pad): number => p % COLS;
export const padIndex = (r: number, c: number): Pad => r * COLS + c;

export class Grid {
  readonly root: string;
  readonly scale: string;
  readonly rootPc: number;
  readonly steps: number[];
  readonly baseMidi = BASE_MIDI;
  readonly rows = ROWS;
  readonly cols = COLS;

  constructor(root: string = DEFAULT_ROOT, scale: string = DEFAULT_SCALE) {
    this.root = root;
    this.scale = scale;
    this.rootPc = noteToPc(root);
    this.steps = scaleSteps(scale);
  }

  /** MIDI-нота пэда (по номеру). */
  midi(p: Pad): number {
    if (!(p >= 0 && p < this.rows * this.cols) || !Number.isInteger(p))
      throw new RangeError(`pad ${p} is outside the ${this.rows}x${this.cols} grid`);
    return this.baseMidi + ROW_SEMITONES * padRow(p) + padCol(p);
  }

  /** MIDI-нота по ряду и колонке. */
  midiRc(r: number, c: number): number {
    if (!(r >= 0 && r < this.rows && c >= 0 && c < this.cols))
      throw new RangeError(`pad (${r}, ${c}) is outside the ${this.rows}x${this.cols} grid`);
    return this.baseMidi + ROW_SEMITONES * r + c;
  }

  pc(p: Pad): number {
    return this.midi(p) % 12;
  }

  /** 'root' | 'in_key' | 'off' — базовая раскраска пэда. */
  state(p: Pad): BaseState {
    const rel = mod(this.pc(p) - this.rootPc, 12);
    if (rel === 0) return "root";
    return this.steps.includes(rel) ? "in_key" : "off";
  }

  degree(p: Pad): number {
    return mod(this.pc(p) - this.rootPc, 12);
  }

  noteName(p: Pad, flats = false, octave = false): string {
    return midiToName(this.midi(p), flats, octave);
  }

  /** Все пэды, играющие эту MIDI-ноту (их бывает несколько). */
  padsOfMidi(midi: number): Pad[] {
    const out: Pad[] = [];
    for (let p = 0; p < this.rows * this.cols; p++) if (this.midi(p) === midi) out.push(p);
    return out;
  }

  padsOfPc(pc: number): Pad[] {
    const want = mod(pc, 12);
    const out: Pad[] = [];
    for (let p = 0; p < this.rows * this.cols; p++) if (this.pc(p) === want) out.push(p);
    return out;
  }

  get lowestMidi(): number {
    return this.midi(0);
  }

  get highestMidi(): number {
    return this.midi(this.rows * this.cols - 1);
  }

  uniquePitches(): number[] {
    const s = new Set<number>();
    for (let p = 0; p < this.rows * this.cols; p++) s.add(this.midi(p));
    return [...s].sort((a, b) => a - b);
  }
}
