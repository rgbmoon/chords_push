import type { DiagramState } from "../core/diagram/diagram";

export type ChartKind = "sheet" | "progression";

/** Разбор: текст, который вставил человек, и его правки схем. Схемы пересчитываются при открытии. */
export interface Chart {
  id: string;
  kind: ChartKind;
  title: string;
  artist: string;
  source: string;
  /** правки схем; ключ — символ аккорда (песня) или «номер:символ» (последовательность) */
  edits: Record<string, DiagramState>;
  /** аккорды со схемами — для плитки на главной */
  chords: string[];
  created: number;
  updated: number;
}

export interface CollectionChord {
  symbol: string;
  pads: number[];
  /** какой пэд человек назвал рутом */
  rootPad: number;
  /** рут выбранного варианта названия; null — названия нет */
  rootPc: number | null;
  kind: string;
}

/** Подбор: аккорды, накликанные на странице определения. */
export interface Collection {
  id: string;
  name: string;
  chords: CollectionChord[];
  created: number;
  updated: number;
}

export interface ChartDraft {
  id?: string;
  kind: ChartKind;
  title: string;
  artist: string;
  source: string;
  chords: string[];
}

export interface CollectionDraft {
  id?: string | null;
  name: string;
  chords: readonly CollectionChord[];
}
