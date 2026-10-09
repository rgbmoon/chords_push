/**
 * Что вставил человек и что из этого выйдет.
 *
 *   ПОСЛЕДОВАТЕЛЬНОСТЬ — после шапки, секций и пустых строк остались только
 *   аккорды («Bb Gm | A -> Dm»): лента схем, по одной на каждое место в цепочке;
 *
 *   ПЕСНЯ — всё остальное: текст слева, схемы справа, одна схема на уникальный
 *   аккорд. Схемы строятся по аккордам, звучащим под текстом; если под текстом
 *   их нет вовсе — по всем.
 */
import { isChordSymbol, parseChord } from "../theory/chord";
import { NOISE_TOKEN, fixChordToken, normalizePaste } from "./normalize";
import { CHORD_SHAPE, isChordLine, META_KEYS, parseSheet, Song, songChords, SongMeta } from "./sheet";

export interface UnknownChord {
  symbol: string;
  /** номер строки после чистки, с единицы */
  line: number;
}

export type InputAnalysis =
  | { kind: "empty"; meta: SongMeta }
  | { kind: "progression"; meta: SongMeta; chords: string[]; unknown: UnknownChord[] }
  | {
      kind: "sheet";
      meta: SongMeta;
      song: Song;
      /** аккорды, по которым строятся схемы */
      chords: string[];
      /** под текстом аккордов нет — схемы по всем, включая проигрыши */
      fromInstrumental: boolean;
      /** аккорды, которые видны в тексте, но схемы не получают */
      withoutDiagrams: string[];
      sections: number;
      unknown: UnknownChord[];
    };

const META_LINE = /^@(\w+)\s*:\s*(.*)$/;
const PROGRESSION_SEPARATORS = /[\s,;|–—>→]+/;

export function analyzeInput(text: string): InputAnalysis {
  const lines = normalizePaste(text).split("\n");
  const meta: SongMeta = {};
  const body: { text: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = META_LINE.exec(l.trim());
    const key = m?.[1].toLowerCase();
    if (m && (META_KEYS as readonly string[]).includes(key!)) meta[key as keyof SongMeta] = m[2].trim();
    else if (l.trim() && !l.trim().startsWith("#")) body.push({ text: l, line: i + 1 });
  });
  if (!body.length) return { kind: "empty", meta };

  const tokenized = body.map(({ text: t, line }) => ({
    line,
    tokens: t
      .replaceAll("->", " ")
      .replace(/^\s*\./, " ")
      .split(PROGRESSION_SEPARATORS)
      .filter((tok) => tok && !NOISE_TOKEN.test(tok))
      .map(fixChordToken),
  }));
  const isProgression = tokenized.every(
    ({ tokens }) => tokens.some(isChordSymbol) && tokens.every((t) => isChordSymbol(t) || CHORD_SHAPE.test(t)),
  );

  if (isProgression) {
    const chords: string[] = [];
    const unknown: UnknownChord[] = [];
    for (const { tokens, line } of tokenized)
      for (const token of tokens) {
        if (!isChordSymbol(token)) unknown.push({ symbol: token, line });
        else if (chords.at(-1) !== parseChord(token).symbol) chords.push(parseChord(token).symbol);
      }
    return { kind: "progression", meta, chords, unknown };
  }

  const song = parseSheet(lines.join("\n"));
  const underLyrics = songChords(song);
  const all = songChords(song, { lyricsOnly: false });
  const chords = underLyrics.length ? underLyrics : all;
  const unknown = lines.flatMap((l, i) =>
    isChordLine(l)
      ? l
          .replace(/^\s*\./, " ")
          .trim()
          .split(/\s+/)
          .filter((tok) => !isChordSymbol(tok))
          .map((symbol) => ({ symbol, line: i + 1 }))
      : [],
  );
  return {
    kind: "sheet",
    meta: { ...song.meta, ...meta },
    song,
    chords,
    fromInstrumental: !underLyrics.length && all.length > 0,
    withoutDiagrams: [...new Set(all)].filter((s) => !chords.includes(s)),
    sections: song.sections.filter((s) => s.title && s.lines.length).length,
    unknown,
  };
}
