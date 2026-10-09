/** Аккорд: разбор символа ('Bbmaj7b5', 'Am/C', 'C6/9') и всё, что из него следует. */
import { mod } from "../math";
import { chordType, kindOfSuffix } from "./chordTypes";
import { intervalShort } from "./intervals";
import { isNoteName, isReadableName, parseNoteName, PitchClass, spellNote } from "./notes";

export interface Chord {
  /** символ как написан: 'Bbmaj7b5', 'Am/C' */
  symbol: string;
  kind: string;
  rootPc: PitchClass;
  /** тоника как записана в символе: 'Bb', 'F#' */
  rootName: string;
  /** слэш-бас; null — бас совпадает с рутом */
  bassPc: PitchClass | null;
  intervals: readonly number[];
  /** классы высот аккорда, слэш-бас — последним */
  pitchClasses: readonly PitchClass[];
  /** класс высоты -> подпись ступени ('1', 'b3', '9') */
  degreeByPc: ReadonlyMap<PitchClass, string>;
  /** класс высоты -> правильно записанное имя ноты (Bb, а не A#); null — пусть решает пэд */
  nameByPc: ReadonlyMap<PitchClass, string | null>;
  /** чем писать остальные пэды схемы — бемолями или диезами */
  prefersFlats: boolean;
}

export class ChordSyntaxError extends Error {}

const ROOT = /^([A-Ga-g][#b♯♭]*)(.*)$/;

function splitRoot(symbol: string): { pc: PitchClass; name: string; suffix: string } {
  const m = ROOT.exec(symbol);
  if (!m) throw new ChordSyntaxError(`can't read the root in '${symbol}'`);
  const name = m[1][0].toUpperCase() + m[1].slice(1).replaceAll("♯", "#").replaceAll("♭", "b");
  // скобки снимаем только с суффикса: в 'C(b5)' тоника — C, а не Cb
  return { pc: parseNoteName(m[1]), name, suffix: m[2].replace(/[()]/g, "") };
}

export function makeChord(
  symbol: string,
  kind: string,
  rootPc: PitchClass,
  rootName: string,
  bass?: { pc: PitchClass; name: string },
): Chord {
  const { intervals, degrees } = chordType(kind);
  const degreeByPc = new Map<PitchClass, string>();
  const nameByPc = new Map<PitchClass, string | null>();
  intervals.forEach((iv, i) => {
    const pc = mod(rootPc + iv, 12);
    if (degreeByPc.has(pc)) return;
    degreeByPc.set(pc, degrees[i]);
    nameByPc.set(pc, spellNote(rootName, degrees[i], pc));
  });
  const pitchClasses = [...degreeByPc.keys()];
  const bassPc = bass && bass.pc !== rootPc ? bass.pc : null;
  if (bass && bassPc !== null && !degreeByPc.has(bassPc)) {
    degreeByPc.set(bassPc, intervalShort(mod(bassPc - rootPc, 12)));
    nameByPc.set(bassPc, isReadableName(bass.name) ? bass.name : null);
    pitchClasses.push(bassPc);
  }

  const names = [...nameByPc.values()].filter((n): n is string => !!n);
  const flats = names.filter((n) => n.includes("b")).length;
  const sharps = names.filter((n) => n.includes("#")).length;

  return {
    symbol,
    kind,
    rootPc,
    rootName,
    bassPc: bass ? bass.pc : null,
    intervals,
    pitchClasses,
    degreeByPc,
    nameByPc,
    prefersFlats: flats !== sharps ? flats > sharps : rootName.includes("b"),
  };
}

/**
 * 'Bbmaj7b5' -> Chord. Тоника читается «жадно», вместе со знаком: 'Cb5' — это
 * квинта от Cb. Мажор с пониженной квинтой пишется 'C(b5)'.
 * Символ сначала пробуется целиком — иначе '6/9' развалился бы на слэш-бас.
 */
export function parseChord(symbol: string): Chord {
  const raw = symbol.trim();
  if (!raw) throw new ChordSyntaxError("empty chord symbol");
  const clean = raw.replaceAll(" ", "");

  const whole = splitRoot(clean);
  const kind = kindOfSuffix(whole.suffix);
  if (kind) return makeChord(raw, kind, whole.pc, whole.name);

  const cut = clean.lastIndexOf("/");
  if (cut > 0 && isNoteName(clean.slice(cut + 1))) {
    const head = splitRoot(clean.slice(0, cut));
    const bass = splitRoot(clean.slice(cut + 1));
    const headKind = kindOfSuffix(head.suffix);
    if (headKind) return makeChord(raw, headKind, head.pc, head.name, { pc: bass.pc, name: bass.name });
  }
  throw new ChordSyntaxError(`unknown chord '${raw}'`);
}

export function tryParseChord(symbol: string): Chord | null {
  try {
    return parseChord(symbol);
  } catch {
    return null;
  }
}

export const isChordSymbol = (symbol: string): boolean => tryParseChord(symbol) !== null;

/** 'Bb Gm A', 'Bb | Gm -> A, Dm' -> аккорды. Подряд идущие повторы схлопываются. */
export function parseProgression(text: string): Chord[] {
  const out: Chord[] = [];
  for (const token of text.replaceAll("->", " ").split(/[\s,;|–—>→]+/)) {
    if (!token || token === "-") continue;
    const chord = parseChord(token);
    if (out.at(-1)?.symbol !== chord.symbol) out.push(chord);
  }
  return out;
}
