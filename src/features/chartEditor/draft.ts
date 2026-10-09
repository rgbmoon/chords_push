/** Правила черновика разбора — без React: что не так с текстом и как назвать разбор. */
import { voiceProgression, VoicingError } from "../../core/grid/voicing";
import type { InputAnalysis } from "../../core/sheet/analyze";
import { songDiagrams } from "../../core/sheet/songDiagrams";
import { parseChord } from "../../core/theory/chord";
import type { ChartDraft } from "../../storage";

/** Почему разбор сохранить нельзя; null — можно. */
export function draftProblem(a: InputAnalysis): string | null {
  if (a.kind === "empty") return "nothing to read";
  if (a.kind === "progression" && a.unknown.length) return "the progression has unrecognized chords — fix them first";
  if (!a.chords.length) return "no chords found";
  // аккорд, который не влезает в сетку, лучше поймать до сохранения
  try {
    if (a.kind === "progression") voiceProgression(a.chords.map(parseChord));
    else songDiagrams(a.chords);
  } catch (e) {
    if (e instanceof VoicingError) return e.message;
    throw e;
  }
  return null;
}

/** Название по умолчанию: первые аккорды или первая строка текста — чтобы плитки различались. */
export function defaultTitle(a: InputAnalysis): string {
  if (a.kind === "progression") return a.chords.slice(0, 4).join(" ");
  if (a.kind === "sheet")
    for (const section of a.song.sections)
      for (const line of section.lines)
        if ((line.kind === "lyric" || line.kind === "pair") && line.lyric.trim()) {
          const t = line.lyric.trim();
          return t.length > 40 ? `${t.slice(0, 39)}…` : t;
        }
  return "Song";
}

export function toChartDraft(a: Exclude<InputAnalysis, { kind: "empty" }>, fields: { id?: string; title: string; artist: string; source: string }): ChartDraft {
  return {
    id: fields.id,
    kind: a.kind,
    title: fields.title.trim() || defaultTitle(a),
    artist: fields.artist.trim(),
    source: fields.source,
    chords: a.kind === "progression" ? a.chords : [...new Set(a.chords)],
  };
}
