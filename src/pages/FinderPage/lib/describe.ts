import { padPc, Pad } from "../../../core/grid/grid";
import { pcName } from "../../../core/theory/notes";
import { chosenCandidate, FinderState } from "./finderState";

export interface SelectionHeadline {
  /** крупно: символ, «?» или «—» */
  symbol: string;
  /** названия нет — символ бледный */
  muted: boolean;
  /** строкой ниже: что это или почему названия нет */
  description: string;
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`;
const distinctNotes = (pads: readonly Pad[]) => new Set(pads.map(padPc)).size;

/** Заголовок разбора под большой сеткой. */
export function describeSelection(s: FinderState): SelectionHeadline {
  const c = chosenCandidate(s);
  const root = s.lockPc !== null ? pcName(s.lockPc) : "";
  if (c) return { symbol: c.symbol, muted: false, description: c.typeName + (c.inversion ? ` · ${ordinal(c.inversion)} inversion` : "") };
  if (!s.selection.length) return { symbol: "—", muted: true, description: "click pads — the grid will tell you what you've got" };
  // одна нота — это ещё не «аккорда нет», это заявленный рут
  if (distinctNotes(s.selection) < 2) return { symbol: "—", muted: true, description: `root ${root} — now add notes` };
  if (s.identification.candidates.length)
    return { symbol: "?", muted: true, description: `no chord from ${root || "this note"} in the table — but there are options below` };
  if (s.identification.interval) return { symbol: "?", muted: true, description: `interval: ${s.identification.interval}` };
  return { symbol: "?", muted: true, description: "no such chord in the table" };
}
