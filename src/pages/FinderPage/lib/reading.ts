/**
 * «Прочтение» набора пэдов: что выбрано, каким аккордом это названо и как
 * раскрасить сетку. Одна и та же логика рисует и большую сетку, и каждую
 * карточку подбора: ноты аккорда голубые, рут зелёный, всё, чего в аккорде
 * нет, — фиолетовое, ровно как в схемах песни.
 */
import { byPadPitch, Pad, padColor, padMidi, padPc, PADS_TOP_DOWN } from "../../../core/grid/grid";
import type { ChordCandidate } from "../../../core/identify/identify";
import { octaveOf, pcName, spellNote } from "../../../core/theory/notes";
import type { PadCell } from "../../../components/music";

export interface Reading {
  pads: readonly Pad[];
  /** выбранное название; null — названия нет */
  candidate: ChordCandidate | null;
  /** рут: у названия свой, без названия — тот, что назвал человек */
  rootPc: number | null;
  /** ступени всех пэдов от рута — их видно под курсором */
  padDegrees: readonly string[] | null;
}

const inChord = (r: Reading, pc: number) => !!r.candidate?.nameByPc.has(pc);
/**
 * Имя ноты: у нот аккорда и у выбранных лишних нот — на языке названного
 * аккорда (Bb, а не A#), у остальных пэдов — по умолчанию, диезами.
 */
function nameOf(r: Reading, pad: Pad): string {
  const pc = padPc(pad);
  const c = r.candidate;
  const spelled = c && (c.nameByPc.get(pc) ?? (r.pads.includes(pad) ? spellNote(c.rootName, c.degreeByPc[pc], pc) : null));
  return spelled || pcName(pc);
}

export function readingCells(r: Reading): PadCell[] {
  const selectedPcs = new Set(r.pads.map(padPc));
  return PADS_TOP_DOWN.map((pad) => {
    const pc = padPc(pad);
    const selected = r.pads.includes(pad);
    const mine = inChord(r, pc);
    const role = selected ? (mine || !r.candidate ? "chord" : "extra") : selectedPcs.has(pc) && mine ? "ghost" : null;
    // нота аккорда говорит на языке аккорда, остальное меряется от рута по
    // реальному расстоянию: пэд октавой выше — 9, а не 2
    const degree = mine ? r.candidate!.degreeByPc[pc] : (r.padDegrees?.[pad] ?? r.candidate?.degreeByPc[pc] ?? "");
    return {
      pad,
      color: padColor(pad),
      name: nameOf(r, pad),
      degree,
      role,
      isRoot: (role === "chord" || role === "ghost") && r.rootPc === pc,
    };
  });
}

export interface ReadingText {
  notes: string[];
  extraNotes: string[];
  degrees: string[];
  extraDegrees: string[];
}

/** Ноты и ступени снизу вверх: свои ноты — отдельно, повторы ступеней схлопнуты. */
export function readingText(r: Reading): ReadingText {
  const out: ReadingText = { notes: [], extraNotes: [], degrees: [], extraDegrees: [] };
  for (const pad of [...r.pads].sort(byPadPitch)) {
    const pc = padPc(pad);
    const mine = inChord(r, pc) || !r.candidate;
    (mine ? out.notes : out.extraNotes).push(nameOf(r, pad) + octaveOf(padMidi(pad)));
    const degree = r.candidate?.degreeByPc[pc];
    const into = mine ? out.degrees : out.extraDegrees;
    if (degree && !into.includes(degree)) into.push(degree);
  }
  return out;
}
