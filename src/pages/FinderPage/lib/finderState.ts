/**
 * Состояние страницы определения — без React.
 *
 * Рут называет человек: первый нажатый пэд. Аккорд строится от него, и рут
 * никуда не уезжает, даже если от него аккорда в таблице нет: тогда заголовка
 * нет, а найденное от других рутов лежит вариантами. Выбрал вариант — рут
 * стал его. Повторный клик по рутовому пэду сбрасывает сетку целиком.
 */
import { Pad, padMidi, padPc } from "../../../core/grid/grid";
import { ChordCandidate, identifyChord, Identification } from "../../../core/identify/identify";
import { MAX_CHORD_NOTES } from "../../../core/theory/chordTypes";
import type { CollectionChord } from "../../../storage";
import type { Reading } from "./reading";

/** Аккорд подбора: выбор человека и то, как он прочитан. */
export interface FinderItem extends Reading {
  symbol: string;
  kind: string;
  rootPad: Pad;
}

export interface FinderState {
  /** выбранные пэды; первый — рут */
  selection: Pad[];
  lockPc: number | null;
  identification: Identification;
  /** индекс выбранного названия; -1 — названия нет */
  chosen: number;
  items: FinderItem[];
  /** какой аккорд подбора сейчас на сетке */
  current: number;
  /** только что добавленный — подсветить */
  added: number;
}

export type FinderAction =
  | { type: "clickPad"; pad: Pad }
  | { type: "chooseCandidate"; index: number }
  | { type: "clearGrid" }
  | { type: "addToCollection" }
  | { type: "openItem"; index: number }
  | { type: "removeItem"; index: number }
  | { type: "moveItem"; from: number; to: number }
  | { type: "clearItems" };

const EMPTY_IDENTIFICATION: Identification = { candidates: [], interval: "", padDegrees: null };
const distinctNotes = (pads: readonly Pad[]) => new Set(pads.map(padPc)).size;

export const isFull = (s: FinderState): boolean => distinctNotes(s.selection) >= MAX_CHORD_NOTES;

/** Пересчитать название: заголовок — только у аккорда от залоченного рута (или предпочтённый символ). */
function identify(selection: Pad[], lockPc: number | null, prefer?: string): Pick<FinderState, "selection" | "lockPc" | "identification" | "chosen"> {
  if (!selection.length) return { selection, lockPc: null, identification: EMPTY_IDENTIFICATION, chosen: -1 };
  const identification = identifyChord(selection.map(padMidi), lockPc);
  const { candidates } = identification;
  let chosen = prefer ? candidates.findIndex((c) => c.symbol === prefer) : -1;
  if (chosen < 0 && lockPc !== null) chosen = candidates.findIndex((c) => c.rootPc === lockPc);
  return { selection, lockPc, identification, chosen };
}

export const chosenCandidate = (s: FinderState): ChordCandidate | null => s.identification.candidates[s.chosen] ?? null;

export function currentReading(s: FinderState): Reading {
  const c = chosenCandidate(s);
  return { pads: s.selection, candidate: c, rootPc: c ? c.rootPc : s.lockPc, padDegrees: s.identification.padDegrees };
}

function openItem(s: FinderState, index: number): FinderState {
  const item = s.items[index];
  const root = item.pads.includes(item.rootPad) ? item.rootPad : item.pads[0];
  const selection = [root, ...item.pads.filter((p) => p !== root)];
  return { ...s, ...identify(selection, item.rootPc ?? padPc(root), item.symbol), current: index };
}

export function finderReducer(s: FinderState, action: FinderAction): FinderState {
  switch (action.type) {
    case "clickPad": {
      const { pad } = action;
      // сняли рут — снимаем всё: аккорд читается заново, а не пересчитывается
      if (s.selection[0] === pad) return { ...s, ...identify([], null), current: -1 };
      if (s.selection.includes(pad)) return { ...s, ...identify(s.selection.filter((p) => p !== pad), s.lockPc), current: -1 };
      if (isFull(s)) return s;
      const selection = [...s.selection, pad];
      return { ...s, ...identify(selection, selection.length === 1 ? padPc(pad) : s.lockPc), current: -1 };
    }
    case "chooseCandidate": {
      const c = s.identification.candidates[action.index];
      // выбрал вариант — рут стал его, и ступени пэдов теперь меряются от него
      const { padDegrees } = identifyChord(s.selection.map(padMidi), c.rootPc);
      return { ...s, chosen: action.index, lockPc: c.rootPc, identification: { ...s.identification, padDegrees } };
    }
    case "clearGrid":
      return { ...s, ...identify([], null), current: -1 };
    case "addToCollection": {
      if (!s.selection.length) return s;
      const c = chosenCandidate(s);
      const reading = currentReading(s);
      const item: FinderItem = {
        ...reading,
        pads: [...s.selection].sort((a, b) => padMidi(a) - padMidi(b)),
        symbol: c?.symbol ?? "?",
        kind: c?.kind ?? "",
        rootPad: s.selection[0],
      };
      const items = [...s.items, item];
      return { ...s, items, current: items.length - 1, added: items.length - 1 };
    }
    case "openItem":
      return openItem(s, action.index);
    case "removeItem": {
      const { index } = action;
      const current = s.current === index ? -1 : s.current > index ? s.current - 1 : s.current;
      return { ...s, items: s.items.filter((_, i) => i !== index), current, added: -1 };
    }
    case "moveItem": {
      const { from, to } = action;
      if (from === to) return s;
      const items = [...s.items];
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...s, items, current: s.current === from ? to : -1, added: -1 };
    }
    case "clearItems":
      return { ...s, items: [], current: -1, added: -1 };
  }
}

/** Сохранённый аккорд подбора -> как его читать. Ступени и запись нот не хранятся — пересчитываются. */
export function restoreItem(stored: CollectionChord): FinderItem {
  const rootPc = stored.rootPc ?? padPc(stored.rootPad);
  const identification = identifyChord(stored.pads.map(padMidi), rootPc);
  const { candidates } = identification;
  const candidate =
    candidates.find((c) => c.symbol === stored.symbol) ??
    candidates.find((c) => c.kind === stored.kind && c.rootPc === stored.rootPc) ??
    candidates[0] ??
    null;
  return {
    pads: stored.pads,
    candidate,
    rootPc: candidate ? candidate.rootPc : null,
    padDegrees: identification.padDegrees,
    symbol: stored.symbol || candidate?.symbol || "?",
    kind: candidate?.kind ?? stored.kind,
    rootPad: stored.rootPad,
  };
}

export const toStored = (item: FinderItem): CollectionChord => ({
  symbol: item.symbol,
  pads: [...item.pads],
  rootPad: item.rootPad,
  rootPc: item.rootPc,
  kind: item.kind,
});

export function initialFinderState(items: FinderItem[]): FinderState {
  const empty: FinderState = { ...identify([], null), items, current: -1, added: -1 };
  // первый аккорд подбора сразу на сетке
  return items.length ? openItem(empty, 0) : empty;
}
