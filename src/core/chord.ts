/** Разбор символа аккорда: 'Bbmaj7b5', 'Am/C', 'Gm6' -> ChordSpec. */
import { ALIASES, CHORDS } from "./data";
import { intervalShort, isNoteName, noteToPc, pcToName, SIMPLE_NAMES, spellFrom } from "./notes";
import { mod, PY_WS_CHARS, pyStrip } from "./py";

export class ChordError extends Error {}

export function chordIntervals(kind: string): number[] {
  const ent = CHORDS.get(kind);
  if (!ent) throw new ChordError(`unknown chord type: '${kind}'`);
  return [...ent.intervals];
}

export class ChordSpec {
  constructor(
    readonly symbol: string,
    readonly rootPc: number,
    readonly kind: string,
    readonly intervals: readonly number[],
    readonly bassPc: number | null = null,
    readonly rootWritten: string = "", // как тоника записана в символе: 'Bb', 'F#'
    readonly bassWritten: string = "",
  ) {}

  get degrees(): string[] {
    const ent = CHORDS.get(this.kind);
    if (ent) return [...ent.degrees];
    return this.intervals.map(intervalShort);
  }

  get rootName(): string {
    return this.rootWritten || pcToName(this.rootPc);
  }

  /** Класс высоты -> правильно записанное имя ноты для этого аккорда (null — пусть решает пэд). */
  spelling(): Map<number, string | null> {
    const out = new Map<number, string | null>();
    const rn = this.rootName;
    const degs = this.degrees;
    this.intervals.forEach((i, k) => {
      if (k >= degs.length) return;
      const pc = mod(this.rootPc + i, 12);
      if (!out.has(pc)) out.set(pc, spellFrom(rn, degs[k], pc) || null);
    });
    if (this.bassPc !== null) {
      const b = SIMPLE_NAMES.has(this.bassWritten) ? this.bassWritten : null;
      const pc = mod(this.bassPc, 12);
      if (!out.has(pc)) out.set(pc, b);
    }
    return out;
  }

  /** Чем писать остальные (не аккордовые) пэды — бемолями или диезами. */
  get prefersFlats(): boolean {
    const names = [...this.spelling().values()].filter((n): n is string => !!n);
    const count = (ch: string) => names.reduce((s, n) => s + n.split(ch).length - 1, 0);
    const flats = count("b");
    const sharps = count("#");
    if (flats !== sharps) return flats > sharps;
    return this.rootName.includes("b");
  }

  get pitchClasses(): number[] {
    const pcs = this.intervals.map((i) => mod(this.rootPc + i, 12));
    if (this.bassPc !== null && !pcs.includes(mod(this.bassPc, 12))) pcs.push(mod(this.bassPc, 12));
    return pcs;
  }

  /** Класс высоты -> подпись ступени ('1', 'b3', '9', ...). */
  degreeMap(): Map<number, string> {
    const out = new Map<number, string>();
    const degs = this.degrees;
    this.intervals.forEach((i, k) => {
      if (k >= degs.length) return;
      const pc = mod(this.rootPc + i, 12);
      if (!out.has(pc)) out.set(pc, degs[k]);
    });
    if (this.bassPc !== null) {
      const pc = mod(this.bassPc, 12);
      if (!out.has(pc)) out.set(pc, intervalShort(mod(this.bassPc - this.rootPc, 12)));
    }
    return out;
  }
}

/** Регистр значим: сначала точное совпадение, потом по нижнему регистру. */
function lookupKind(suffix: string): string | undefined {
  return ALIASES.get(suffix) ?? ALIASES.get(suffix.toLowerCase());
}

const ROOT_RE = /^([A-Ga-g][#b♯♭]*)(.*)$/;

function splitRoot(sym: string): [number, string, string] {
  const m = ROOT_RE.exec(sym);
  if (!m) throw new ChordError(`can't read the root in '${sym}'`);
  const written = m[1][0].toUpperCase() + m[1].slice(1).replaceAll("♯", "#").replaceAll("♭", "b");
  return [noteToPc(m[1]), m[2], written];
}

/**
 * 'Bbmaj7b5' -> ChordSpec. Понимает слэш-бас ('Am/C') и тип '6/9'.
 *
 * Тоника читается «жадно», вместе со знаком альтерации: 'Cb5' = квинта от Cb.
 * Мажор с пониженной квинтой пишите со скобками — 'C(b5)' — или как 'Cmajb5'.
 */
export function parseChordSymbol(sym: string): ChordSpec {
  const raw = pyStrip(sym);
  if (!raw) throw new ChordError("empty chord symbol");
  const clean = raw.replaceAll(" ", "");

  // скобки снимаем ТОЛЬКО с суффикса: в 'C(b5)' тоника — C, а не Cb
  const split = (s: string): [number, string, string] => {
    const [pc, suf, wr] = splitRoot(s);
    return [pc, suf.replaceAll("(", "").replaceAll(")", ""), wr];
  };

  // сначала пробуем символ целиком — иначе '6/9' развалится на слэш-бас
  let [rootPc, suffix, written] = split(clean);
  let kind = lookupKind(suffix);
  let bassPc: number | null = null;
  let bassWritten = "";

  if (kind === undefined && clean.includes("/")) {
    const cut = clean.lastIndexOf("/");
    const head = clean.slice(0, cut);
    const tail = clean.slice(cut + 1);
    if (head && isNoteName(tail)) {
      [rootPc, suffix, written] = split(head);
      kind = lookupKind(suffix);
      const [bpc, , bwr] = splitRoot(tail);
      bassPc = bpc;
      bassWritten = bwr;
    }
  }

  if (kind === undefined) throw new ChordError(`unknown chord '${raw}' (suffix '${suffix}')`);
  return new ChordSpec(raw, rootPc, kind, chordIntervals(kind), bassPc, written, bassWritten);
}

export function isChordSymbol(sym: string): boolean {
  try {
    parseChordSymbol(sym);
    return true;
  } catch {
    return false;
  }
}

const SPLIT_RE = new RegExp(`[${PY_WS_CHARS},;|–—>→]+`);

/**
 * 'Bb Gm A' или 'Bb | Gm -> A' -> список ChordSpec.
 * Подряд идущие повторы одного символа схлопываются в один.
 */
export function parseProgression(text: string): ChordSpec[] {
  const tokens = text
    .replaceAll("->", " ")
    .split(SPLIT_RE)
    .filter((t) => t && t !== "-" && t !== "|");
  const out: ChordSpec[] = [];
  for (const t of tokens) {
    const spec = parseChordSymbol(t);
    if (out.length && out[out.length - 1].symbol === spec.symbol) continue;
    out.push(spec);
  }
  return out;
}
