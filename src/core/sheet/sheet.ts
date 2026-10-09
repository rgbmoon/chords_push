/**
 * Текст песни с аккордами — «аккорды над текстом», как на любом сайте с подборами:
 *
 *   @title: Lanterns          шапка: title, artist, key, bpm, capo, source, tuning
 *   # Verse 1                 секция
 *   Am                F       строка аккордов; если под ней текст — аккорды встают
 *   Evening walks across      над своими слогами, если нет — это проигрыш
 *
 * `.` в начале строки — «это точно аккорды», `|` — «это точно текст».
 *
 * Колонки считаются в символах (кодовых точках), а не в UTF-16: иначе эмодзи
 * в тексте сдвигали бы аккорд со слога.
 */
import { isChordSymbol } from "../theory/chord";

export const META_KEYS = ["title", "artist", "key", "bpm", "capo", "source", "tuning"] as const;
export type SongMeta = Partial<Record<(typeof META_KEYS)[number], string>>;

export interface ChordMark {
  /** колонка над текстом, в символах */
  column: number;
  symbol: string;
  /** символ есть в таблице; нераспознанный виден в тексте, но схемы не получает */
  known: boolean;
}

export type SheetLine =
  | { kind: "pair"; lyric: string; chords: ChordMark[] }
  | { kind: "chords"; chords: ChordMark[] }
  | { kind: "lyric"; lyric: string }
  | { kind: "blank" };

export interface Section {
  title: string;
  lines: SheetLine[];
}

export interface Song {
  meta: SongMeta;
  sections: Section[];
}

/**
 * Похоже на символ аккорда, даже если такого типа в таблице нет: тоника, потом
 * только «аккордовые» кусочки. Обычное слово сюда не пролезет — «Bad», «Day»,
 * «Down» спотыкаются на строчных буквах.
 */
export const CHORD_SHAPE =
  /^[A-H][#b♯♭]?(?:maj|min|dim|aug|sus|add|alt|omit|no|dom|m|M|j|b|[0-9#+\-°ø∆Δ△()/,^])*(?:\/[A-H][#b♯♭]?)?$/;

const SENTENCE_END = /[,.?!;:]$/;
const QUOTES = /['"’“”«»]/;

/**
 * Строка аккордов: каждый токен — аккорд или хотя бы похож на него, и хотя бы
 * один аккорд настоящий. Если все токены — аккорды, длина почти не ограничена:
 * проигрыш бывает длинным.
 */
export function isChordLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith(".")) return true;
  if (t.startsWith("|") || SENTENCE_END.test(t) || QUOTES.test(t)) return false;
  const tokens = t.split(/\s+/);
  const known = tokens.filter(isChordSymbol).length;
  if (!known) return false;
  if (known === tokens.length) return tokens.length <= 24;
  return tokens.length <= 12 && tokens.every((tok) => isChordSymbol(tok) || CHORD_SHAPE.test(tok));
}

/** Аккорды строки с их колонками. */
export function chordMarks(line: string): ChordMark[] {
  const text = line.trimStart().startsWith(".") ? line.replace(".", " ") : line;
  return [...text.matchAll(/\S+/g)].map((m) => ({
    column: [...text.slice(0, m.index)].length,
    symbol: m[0],
    known: isChordSymbol(m[0]),
  }));
}

const META_LINE = /^@(\w+)\s*:\s*(.*)$/;
const dropMarker = (s: string) => (s.trimStart().startsWith("|") ? s.replace("|", "") : s);

export function parseSheet(text: string): Song {
  const meta: SongMeta = {};
  const body: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const m = META_LINE.exec(raw.trim());
    const key = m?.[1].toLowerCase();
    if (m && (META_KEYS as readonly string[]).includes(key!)) meta[key as keyof SongMeta] = m[2].trim();
    else body.push(raw.trimEnd());
  }

  const sections: Section[] = [{ title: "", lines: [] }];
  let cur = sections[0];
  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    const t = raw.trim();
    if (t.startsWith("#")) {
      cur = { title: t.replace(/^#+/, "").trim(), lines: [] };
      sections.push(cur);
    } else if (!t) {
      if (cur.lines.length && cur.lines.at(-1)!.kind !== "blank") cur.lines.push({ kind: "blank" });
    } else if (isChordLine(raw)) {
      const next = body[i + 1] ?? "";
      const nt = next.trim();
      if (nt && !nt.startsWith("#") && !isChordLine(next)) {
        cur.lines.push({ kind: "pair", lyric: dropMarker(next), chords: chordMarks(raw) });
        i++;
      } else {
        cur.lines.push({ kind: "chords", chords: chordMarks(raw) });
      }
    } else {
      cur.lines.push({ kind: "lyric", lyric: dropMarker(raw) });
    }
  }

  for (const s of sections) while (s.lines.at(-1)?.kind === "blank") s.lines.pop();
  return { meta, sections: sections.filter((s) => s.title || s.lines.length) };
}

export const hasLyrics = (section: Section): boolean =>
  section.lines.some((l) => (l.kind === "pair" || l.kind === "lyric") && l.lyric.trim() !== "");

/**
 * Аккорды в порядке звучания, подряд идущие повторы схлопнуты, нераспознанные
 * пропущены. lyricsOnly — только те, что звучат под текстом (без проигрышей).
 */
export function songChords(song: Song, { lyricsOnly = true } = {}): string[] {
  const out: string[] = [];
  for (const sec of song.sections)
    for (const line of sec.lines) {
      if (line.kind !== "pair" && (line.kind !== "chords" || lyricsOnly)) continue;
      for (const { symbol, known } of line.chords) if (known && out.at(-1) !== symbol) out.push(symbol);
    }
  return out;
}

export interface LyricPiece {
  chord: ChordMark | null;
  text: string;
}

/** Разрезать строку текста по колонкам аккордов: аккорд встаёт над своим слогом. */
export function splitLyric(lyric: string, chords: readonly ChordMark[]): LyricPiece[] {
  if (!chords.length) return [{ chord: null, text: lyric }];
  const chars = [...lyric];
  const pieces: LyricPiece[] = [];
  if (chords[0].column > 0) pieces.push({ chord: null, text: chars.slice(0, chords[0].column).join("") });
  chords.forEach((chord, k) => {
    const end = chords[k + 1]?.column ?? Math.max(chars.length, chord.column);
    pieces.push({ chord, text: chars.slice(chord.column, end).join("") });
  });
  return pieces;
}
