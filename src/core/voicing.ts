/** Аппликатуры: размещение аккорда на сетке и голосоведение по цепочке. */
import { ChordSpec, parseChordSymbol } from "./chord";
import { COMPACT, WEIGHTS } from "./data";
import { Grid, Pad, padCol, padRow } from "./grid";
import { midiToName, pcToName } from "./notes";
import { argMin, floorDiv, mod, product, sortByKey, sortNum } from "./py";

/**
 * MIDI-ноты аккорда. Рут кладём в октаву, начинающуюся с `low`.
 * Слэш-бас опускается ниже рута и становится нижним голосом.
 */
export function chordPitches(spec: ChordSpec, low = 48): number[] {
  const root = low + mod(spec.rootPc - low, 12);
  let notes = spec.intervals.map((i) => root + i);
  if (spec.bassPc !== null) {
    let b = root + mod(spec.bassPc - root, 12);
    while (b >= Math.min(...notes)) b -= 12;
    const bpc = mod(spec.bassPc, 12);
    notes = [...notes.filter((n) => mod(n, 12) !== bpc), b];
  }
  return sortNum(notes);
}

/** Сколько колонок грида занимает фигура — это и есть «ширина под руку». */
export function spanCols(pads: readonly Pad[]): number {
  const cs = pads.map(padCol);
  return Math.max(...cs) - Math.min(...cs) + 1;
}

export function spanRows(pads: readonly Pad[]): number {
  const rs = pads.map(padRow);
  return Math.max(...rs) - Math.min(...rs) + 1;
}

function cost(pads: readonly Pad[], compact = false): number[] {
  const rs = pads.map(padRow);
  const cs = pads.map(padCol);
  const h = Math.max(...rs) - Math.min(...rs);
  const w = Math.max(...cs) - Math.min(...cs);
  // колонки дороже рядов: рука разъезжается именно вбок
  if (compact) return [w * 3 + h, w, h, Math.min(...rs), Math.min(...cs)];
  return [h * 3 + w, w, h, Math.min(...rs), Math.min(...cs)];
}

export interface PlacementOptions {
  limit?: number | null;
  maxCols?: number | null;
  compact?: boolean;
}

/**
 * Все способы разложить набор нот по пэдам, от самого компактного.
 *
 * Одна и та же нота лежит на нескольких пэдах, поэтому вариантов больше одного —
 * именно из них солвер и выбирает тот, что ближе к предыдущему аккорду.
 *
 * maxCols — потолок занятых колонок. Если в него не влезает ни один вариант
 * (бывает у широких аккордов), потолок отпускается по шагам `relax_cols`,
 * а не выбрасывает аккорд совсем.
 */
export function allPlacements(grid: Grid, pitches: readonly number[], opts: PlacementOptions = {}): Pad[][] {
  const { limit = null, maxCols = null, compact = false } = opts;
  const cand: Pad[][] = [];
  for (const m of sortNum(pitches)) {
    const pads = grid.padsOfMidi(m);
    if (!pads.length) return [];
    cand.push(pads);
  }
  const out: { w: number; k: number[]; p: Pad[] }[] = [];
  for (const combo of product(cand)) {
    if (new Set(combo).size !== combo.length) continue;
    out.push({ w: spanCols(combo), k: cost(combo, compact), p: combo });
  }
  if (!out.length) return [];
  let sel = out;
  if (maxCols) {
    for (const cap of [maxCols, ...COMPACT.relax_cols]) {
      const fit = out.filter((x) => x.w <= cap);
      if (fit.length) {
        sel = fit;
        break;
      }
    }
  }
  sel = sortByKey(sel, (x) => x.k);
  return (limit ? sel.slice(0, limit) : sel).map((x) => x.p);
}

/** n-е обращение: n нижних голосов переносятся на октаву вверх. */
export function invert(pitches: readonly number[], n = 1): number[] {
  let p = sortNum(pitches);
  const times = mod(n, Math.max(1, p.length));
  for (let k = 0; k < times; k++) p = sortNum([...p.slice(1), p[0] + 12]);
  return p;
}

/** Пометка на пэде для рендера. */
export interface PadMark {
  degree: string;
  isRoot: boolean;
  ghost: boolean;
  midi: number;
}

export type Overlay = Map<Pad, PadMark>;

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export class Voicing {
  constructor(
    readonly spec: ChordSpec,
    readonly notes: number[],
    readonly pads: Pad[],
    readonly ghosts: Pad[],
    readonly overlay: Overlay,
    readonly inversion = 0,
    readonly move: number | null = null, // насколько сдвинулась рука от прошлого аккорда
  ) {}

  get noteNames(): string[] {
    return noteNames(this.spec, this.notes);
  }

  get bass(): number {
    return Math.min(...this.notes);
  }

  describe(): string {
    let s = this.noteNames.join(" ");
    if (this.inversion) s += `  ·  ${ordinal(this.inversion)} inversion`;
    return s;
  }
}

/** Имена нот с октавой — по правописанию аккорда, остальное бемолями/диезами. */
export function noteNames(spec: ChordSpec, notes: readonly number[]): string[] {
  const sp = spec.spelling();
  const flats = spec.prefersFlats;
  return notes.map((m) => `${sp.get(mod(m, 12)) || pcToName(mod(m, 12), flats)}${floorDiv(m, 12) - 2}`);
}

export function buildOverlay(grid: Grid, spec: ChordSpec, pads: readonly Pad[], ghosts: boolean): [Overlay, Pad[]] {
  const dmap = spec.degreeMap();
  const overlay: Overlay = new Map();
  for (const p of pads) {
    const pc = grid.pc(p);
    overlay.set(p, { degree: dmap.get(pc) ?? "?", isRoot: pc === spec.rootPc, ghost: false, midi: grid.midi(p) });
  }
  const ghostPads: Pad[] = [];
  if (ghosts) {
    const pcs = new Set(spec.pitchClasses);
    for (let p = 0; p < grid.rows * grid.cols; p++) {
      if (overlay.has(p)) continue;
      const pc = grid.pc(p);
      if (pcs.has(pc)) {
        ghostPads.push(p);
        overlay.set(p, { degree: dmap.get(pc) ?? "?", isRoot: pc === spec.rootPc, ghost: true, midi: grid.midi(p) });
      }
    }
  }
  return [overlay, ghostPads];
}

const toSpec = (c: ChordSpec | string): ChordSpec => (c instanceof ChordSpec ? c : parseChordSymbol(String(c)));

function rangeError(grid: Grid, spec: ChordSpec): Error {
  return new RangeError(
    `chord ${spec.symbol} doesn't fit the grid range ` +
      `(${midiToName(grid.lowestMidi)}..${midiToName(grid.highestMidi)})`,
  );
}

export interface VoiceChordOptions {
  lowCandidates?: readonly number[];
  ghosts?: boolean;
  compact?: boolean;
}

/**
 * Выбрать голосоведение аккорда и разложить его по пэдам.
 *
 * Возвращает Voicing: сами ноты, пэды выбранной аппликатуры и «призраки» —
 * все прочие пэды с теми же классами высот (обращения и другие октавы).
 */
export function voiceChord(grid: Grid, chord: ChordSpec | string, opts: VoiceChordOptions = {}): Voicing {
  const { lowCandidates = [48, 43, 53, 36], ghosts = true, compact = true } = opts;
  const spec = toSpec(chord);
  let chosen: [number[], Pad[]] | null = null;
  for (const low of lowCandidates) {
    const notes = chordPitches(spec, low);
    if (notes[0] < grid.lowestMidi || notes[notes.length - 1] > grid.highestMidi) continue;
    const cap = compact ? COMPACT.max_cols : null;
    const got = allPlacements(grid, notes, { limit: 1, maxCols: cap, compact });
    if (got.length) {
      chosen = [notes, got[0]];
      break;
    }
  }
  if (chosen === null) throw rangeError(grid, spec);
  const [notes, pads] = chosen;
  const [overlay, ghostPads] = buildOverlay(grid, spec, pads, ghosts);
  return new Voicing(spec, notes, pads, ghostPads, overlay);
}

// ------------------------------------------- голосоведение по цепочке ------
//
// Одна и та же гармония ложится на грид десятками способов: разные обращения,
// разные октавы, и для каждой ноты — несколько пэдов. Поэтому выбор аппликатуры
// для аккорда имеет смысл делать не в одиночку, а с оглядкой на соседей:
// рука должна ходить по гриду как можно меньше.
//
// Считаем это динамическим программированием (Витерби) по всей цепочке:
//   состояние    = конкретный вариант (набор нот + набор пэдов) одного аккорда
//   цена узла    = компактность фигуры + регистр + штраф за обращение
//   цена перехода= голосоведение (в полутонах) + сдвиг руки (в пэдах)
//                  − премия за каждый пэд, который остаётся зажатым

function centroid(pads: readonly Pad[]): [number, number] {
  let sr = 0;
  let sc = 0;
  for (const p of pads) {
    sr += padRow(p);
    sc += padCol(p);
  }
  return [sr / pads.length, sc / pads.length];
}

/** Среднее движение голосов в полутонах (симметрично, для разных размеров). */
export function voiceDistance(prev: readonly number[], cur: readonly number[]): number {
  if (!prev.length || !cur.length) return 0;
  let a = 0;
  for (const n of cur) a += Math.min(...prev.map((p) => Math.abs(n - p)));
  a /= cur.length;
  let b = 0;
  for (const p of prev) b += Math.min(...cur.map((n) => Math.abs(p - n)));
  b /= prev.length;
  return (a + b) / 2.0;
}

function nodeCost(grid: Grid, pads: readonly Pad[], inversion: number, compactMode = false): number {
  const rs = pads.map(padRow);
  const cs = pads.map(padCol);
  const h = Math.max(...rs) - Math.min(...rs);
  const w = Math.max(...cs) - Math.min(...cs);
  const compact = compactMode ? COMPACT.row_weight * h + COMPACT.col_weight * w : h * 3 + w;
  // «удобство места»: середина грида лучше краёв — там больше вариантов рядом
  const midR = (grid.rows - 1) / 2.0;
  const midC = (grid.cols - 1) / 2.0;
  const [cr, cc] = centroid(pads);
  const edge = (Math.abs(cr - midR) / midR + Math.abs(cc - midC) / midC) / 2.0;
  const invPen = inversion === 0 ? 0.0 : WEIGHTS.inversion + WEIGHTS.inversion_step * (inversion - 1);
  return (WEIGHTS.compact * compact) / 4.0 + WEIGHTS.register * edge + invPen;
}

/** [цена перехода, сколько пэдов осталось зажатыми, сдвиг руки]. */
export function edgeCost(
  prevNotes: readonly number[],
  prevPads: readonly Pad[],
  notes: readonly number[],
  pads: readonly Pad[],
): [number, number, number] {
  const voice = voiceDistance(prevNotes, notes);
  const [pr, pc] = centroid(prevPads);
  const [cr, cc] = centroid(pads);
  // Math.sqrt, а не ** 0.5: корень по IEEE округляется точно во всех движках
  const dr = cr - pr;
  const dc = cc - pc;
  const hand = Math.sqrt(dr * dr + dc * dc);
  const prevSet = new Set(prevPads);
  const holds = pads.filter((p) => prevSet.has(p)).length;
  const c = WEIGHTS.voice * voice + WEIGHTS.hand * hand - WEIGHTS.hold * holds;
  return [c, holds, hand];
}

type Candidate = [number[], Pad[], number];

/**
 * Все разумные варианты (ноты, пэды, номер обращения) для одного аккорда.
 *
 * По умолчанию обращения НЕ перебираются: смена баса меняет звучание аккорда,
 * а солвер не должен подменять гармонию ради удобства руки. Свободы всё равно
 * хватает — октава плюс выбор пэда для каждой ноты (§3.2 GRID_SPEC).
 */
function candidates(
  grid: Grid,
  spec: ChordSpec,
  maxPlacements = 6,
  lows: readonly number[] = [36, 41, 43, 48, 53, 55, 60],
  allowInversions = false,
  compact = false,
): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const n = spec.intervals.length;
  // у слэш-аккорда бас задан явно — его тоже не трогаем
  const inversions = allowInversions && spec.bassPc === null ? [...Array(n).keys()] : [0];
  for (const low of lows) {
    const base = chordPitches(spec, low);
    for (const inv of inversions) {
      const notes = inv ? invert(base, inv) : [...base];
      const key = notes.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      if (notes[0] < grid.lowestMidi || notes[notes.length - 1] > grid.highestMidi) continue;
      const cap = compact ? COMPACT.max_cols : null;
      for (const pads of allPlacements(grid, notes, { limit: maxPlacements, maxCols: cap, compact }))
        out.push([notes, pads, inv]);
    }
  }
  return out;
}

export interface ProgressionOptions {
  ghosts?: boolean;
  voiceLeading?: boolean;
  allowInversions?: boolean;
  maxPlacements?: number;
  compact?: boolean;
}

/**
 * Подобрать аппликатуры для всей последовательности сразу.
 *
 * voiceLeading=false    — каждый аккорд выбирается сам по себе (просто компактно).
 * allowInversions=true  — разрешить солверу менять бас. По умолчанию ВЫКЛЮЧЕНО:
 *                         структура аккорда важнее удобства, рут остаётся в басу.
 * compact=true          — держать фигуру в `compact_mode.max_cols` колонках, чтобы
 *                         аккорд брался одной рукой.
 */
export function voiceProgression(
  grid: Grid,
  chords: readonly (ChordSpec | string)[],
  opts: ProgressionOptions = {},
): Voicing[] {
  const { ghosts = true, voiceLeading = true, allowInversions = false, maxPlacements = 6, compact = true } = opts;
  const specs = chords.map(toSpec);
  if (!specs.length) return [];
  if (!voiceLeading) return specs.map((s) => voiceChord(grid, s, { ghosts, compact }));

  const cands: Candidate[][] = specs.map((spec) => {
    const cs = candidates(grid, spec, maxPlacements, undefined, allowInversions, compact);
    if (!cs.length) throw rangeError(grid, spec);
    return cs;
  });

  // прямой проход
  let best = cands[0].map(([, p, i]) => nodeCost(grid, p, i, compact));
  const back: number[][] = [cands[0].map(() => -1)];
  for (let k = 1; k < cands.length; k++) {
    const cur: number[] = [];
    const ptr: number[] = [];
    for (const [notes, pads, inv] of cands[k]) {
      const node = nodeCost(grid, pads, inv, compact);
      let bi = 0;
      let bv = Infinity;
      cands[k - 1].forEach(([pn, pp], j) => {
        const v = best[j] + edgeCost(pn, pp, notes, pads)[0];
        if (v < bv) {
          bi = j;
          bv = v;
        }
      });
      cur.push(bv + node);
      ptr.push(bi);
    }
    best = cur;
    back.push(ptr);
  }

  // обратный проход
  let idx = argMin(best);
  const chain = [idx];
  for (let k = cands.length - 1; k > 0; k--) {
    idx = back[k][idx];
    chain.push(idx);
  }
  chain.reverse();

  const out: Voicing[] = [];
  let prevPads: Pad[] | null = null;
  let prevNotes: number[] | null = null;
  specs.forEach((spec, k) => {
    const [notes, pads, inv] = cands[k][chain[k]];
    let move: number | null = null;
    if (prevPads && prevNotes) move = edgeCost(prevNotes, prevPads, notes, pads)[2];
    const [overlay, ghostPads] = buildOverlay(grid, spec, pads, ghosts);
    out.push(new Voicing(spec, [...notes], [...pads], ghostPads, overlay, inv, move));
    prevPads = pads;
    prevNotes = notes;
  });
  return out;
}
