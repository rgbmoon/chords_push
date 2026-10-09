/**
 * Текст песни с аккордами: разбор «аккорды над текстом» и подбор схем.
 *
 * Формат:
 *   * `@ключ: значение` — шапка (title, artist, key, bpm, capo, source, tuning);
 *   * `# Название` — секция (Verse 1, Chorus, Bridge…);
 *   * строка, все токены которой читаются как аккорды, — строка аккордов;
 *     если следом идёт строка текста, аккорды встают над ней по колонкам,
 *     иначе это проигрыш (аккорды без текста);
 *   * `.` в начале — «это точно аккорды», `|` в начале — «это точно текст»
 *     (нужно редко: например если слово в тексте совпало с символом аккорда).
 *
 * Схемы строятся только для аккордов, которые реально звучат под текстом —
 * интро/аутро/проигрыши в текст попадают, а в сайдбар нет.
 *
 * Колонки считаются в кодовых точках, как в Python, а не в UTF-16: иначе
 * эмодзи в тексте сдвигали бы аккорды на слог.
 */
import { ChordSpec, isChordSymbol } from "./chord";
import { Grid, Pad } from "./grid";
import { cpSlice, NON_WS_RUN_RE, pyLstrip, pyRstrip, pySplit, pySplitLines, pyStrip } from "./py";
import { buildOverlay, noteNames, Overlay, spanCols, voiceProgression } from "./voicing";

export const META_KEYS = ["title", "artist", "key", "bpm", "capo", "source", "tuning"] as const;
const SENT_END = ",.?!;:";

export type LineKind = "pair" | "chords" | "lyric" | "blank";
export type ChordAt = [number, string]; // (колонка, символ)

export interface Line {
  kind: LineKind;
  lyric: string;
  chords: ChordAt[];
}

export interface Section {
  title: string;
  lines: Line[];
}

export interface Song {
  meta: Record<string, string>;
  sections: Section[];
}

export const hasLyrics = (s: Section): boolean =>
  s.lines.some((l) => (l.kind === "pair" || l.kind === "lyric") && pyStrip(l.lyric) !== "");

/**
 * Аккорды в порядке звучания. Подряд идущие повторы схлопнуты.
 * Нераспознанные символы (их пропускает только мягкий разбор ввода) в цепочку
 * не идут: схемы для них нет.
 */
export function songChain(song: Song, withLyricsOnly = true): string[] {
  const out: string[] = [];
  for (const sec of song.sections) {
    for (const l of sec.lines) {
      if (l.kind === "chords" && withLyricsOnly) continue;
      for (const [, sym] of l.chords) {
        if (!isChordSymbol(sym)) continue;
        if (!out.length || out[out.length - 1] !== sym) out.push(sym);
      }
    }
  }
  return out;
}

export const isChordToken = isChordSymbol;

export function isChordLine(s: string): boolean {
  const t = pyStrip(s);
  if (!t) return false;
  if (t[0] === ".") return true;
  if (t[0] === "|") return false;
  if (SENT_END.includes(t[t.length - 1]) || t.includes("'") || t.includes('"')) return false;
  const toks = pySplit(t);
  if (toks.length > 12) return false;
  return toks.every(isChordToken);
}

/** Позиции аккордов в строке: [(колонка, символ)], колонка — в кодовых точках. */
export function chordPositions(s: string): ChordAt[] {
  let cps = Array.from(s);
  if (pyLstrip(s).startsWith(".")) cps = cps.slice(1);
  const line = cps.join("");
  const out: ChordAt[] = [];
  for (const m of line.matchAll(NON_WS_RUN_RE)) {
    out.push([Array.from(line.slice(0, m.index)).length, m[0]]);
  }
  return out;
}

const META_RE = /^@(\w+)\s*:\s*(.*)$/;
const dropFirst = (s: string): string => Array.from(s).slice(1).join("");

export interface ParseOptions {
  /** что считать строкой аккордов; по умолчанию — строгое правило Python-версии */
  isChordLine?: (s: string) => boolean;
}

export function parseSource(text: string, opts: ParseOptions = {}): Song {
  const chordLine = opts.isChordLine ?? isChordLine;
  const song: Song = { meta: {}, sections: [] };
  const body: string[] = [];
  for (const raw of pySplitLines(text)) {
    const m = META_RE.exec(pyStrip(raw));
    if (m && (META_KEYS as readonly string[]).includes(m[1].toLowerCase())) {
      song.meta[m[1].toLowerCase()] = pyStrip(m[2]);
    } else {
      body.push(pyRstrip(raw));
    }
  }

  let cur: Section = { title: "", lines: [] };
  song.sections.push(cur);
  let i = 0;
  while (i < body.length) {
    const raw = body[i];
    if (pyStrip(raw).startsWith("#")) {
      cur = { title: pyStrip(pyStrip(raw).replace(/^#+/, "")), lines: [] };
      song.sections.push(cur);
      i += 1;
      continue;
    }
    if (!pyStrip(raw)) {
      if (cur.lines.length && cur.lines[cur.lines.length - 1].kind !== "blank")
        cur.lines.push({ kind: "blank", lyric: "", chords: [] });
      i += 1;
      continue;
    }
    if (chordLine(raw)) {
      const nxt = i + 1 < body.length ? body[i + 1] : "";
      if (pyStrip(nxt) && !pyStrip(nxt).startsWith("#") && !chordLine(nxt)) {
        const lyr = pyLstrip(nxt).startsWith("|") ? dropFirst(nxt) : nxt;
        cur.lines.push({ kind: "pair", lyric: lyr, chords: chordPositions(raw) });
        i += 2;
      } else {
        cur.lines.push({ kind: "chords", lyric: "", chords: chordPositions(raw) });
        i += 1;
      }
      continue;
    }
    const lyr = pyLstrip(raw).startsWith("|") ? dropFirst(raw) : raw;
    cur.lines.push({ kind: "lyric", lyric: lyr, chords: [] });
    i += 1;
  }

  song.sections = song.sections.filter((s) => s.title || s.lines.length);
  for (const s of song.sections) while (s.lines.length && s.lines[s.lines.length - 1].kind === "blank") s.lines.pop();
  return song;
}

/** Разрезать строку текста по колонкам аккордов: [(аккорд|null, кусок текста)]. */
export function splitUnits(lyric: string, chords: readonly ChordAt[]): [string | null, string][] {
  if (!chords.length) return [[null, lyric]];
  const cps = Array.from(lyric);
  const units: [string | null, string][] = [];
  if (chords[0][0] > 0) units.push([null, cpSlice(cps, 0, chords[0][0])]);
  chords.forEach(([col, sym], k) => {
    const end = k + 1 < chords.length ? chords[k + 1][0] : Math.max(cps.length, col);
    units.push([sym, col < cps.length ? cpSlice(cps, col, end) : ""]);
  });
  return units;
}

// -------------------------------------------------------------- аппликатуры --

export interface Card {
  symbol: string;
  spec: ChordSpec;
  notes: number[];
  pads: Pad[];
  overlay: Overlay;
  names: string[];
  degrees: string;
  width: number; // сколько колонок грида занимает фигура
}

export interface CardOptions {
  voiceLeading?: boolean;
  allowInversions?: boolean;
  compact?: boolean;
}

/**
 * Одна карточка на уникальный аккорд.
 *
 * Аппликатура выбирается не в вакууме: солвер прогоняется по всей реальной
 * цепочке песни, а карточке достаётся вариант, который в этой цепочке
 * встретился чаще всего (при равенстве — тот, что встретился раньше).
 */
export function buildCards(grid: Grid, chain: readonly string[], opts: CardOptions = {}): Card[] {
  const { voiceLeading = true, allowInversions = false, compact = true } = opts;
  if (!chain.length) return [];
  const voicings = voiceProgression(grid, chain, { voiceLeading, allowInversions, compact });

  const counts = new Map<string, Map<string, { n: number; notes: number[]; pads: Pad[] }>>();
  const specOf = new Map<string, ChordSpec>();
  for (const v of voicings) {
    const sym = v.spec.symbol;
    if (!counts.has(sym)) counts.set(sym, new Map());
    const key = `${v.notes.join(",")}|${v.pads.join(",")}`;
    const c = counts.get(sym)!;
    const e = c.get(key);
    if (e) e.n += 1;
    else c.set(key, { n: 1, notes: v.notes, pads: v.pads });
    specOf.set(sym, v.spec);
  }

  const cards: Card[] = [];
  for (const [sym, c] of counts) {
    let best: { n: number; notes: number[]; pads: Pad[] } | null = null;
    for (const e of c.values()) if (!best || e.n > best.n) best = e;
    const { notes, pads } = best!;
    const spec = specOf.get(sym)!;
    const [overlay] = buildOverlay(grid, spec, pads, true);
    const degs = pads
      .slice()
      .sort((a, b) => grid.midi(a) - grid.midi(b))
      .map((p) => overlay.get(p)!.degree)
      .join(" · ");
    cards.push({
      symbol: sym,
      spec,
      notes: [...notes],
      pads: [...pads],
      overlay,
      names: noteNames(spec, notes),
      degrees: degs,
      width: spanCols(pads),
    });
  }
  return cards;
}
