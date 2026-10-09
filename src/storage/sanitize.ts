/**
 * Всё, что приходит снаружи — из схемы или из файла бэкапа, — проходит через
 * эти функции: в базу попадают только пэды 0..63, строки обрезаются, мусор
 * выбрасывается.
 */
import type { DiagramState } from "../core/diagram/diagram";
import { PAD_COUNT } from "../core/grid/grid";
import type { Chart, Collection, CollectionChord } from "./types";

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const timestamp = (v: unknown): number => (isFiniteNumber(v) && v > 0 ? v : Date.now());
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const MAX_SOURCE_LENGTH = 200_000;

/** Пэды 0..63 без повторов, по возрастанию. */
export function cleanPads(raw: unknown): number[] {
  const pads = (Array.isArray(raw) ? raw.slice(0, PAD_COUNT) : []).filter(isFiniteNumber).map(Math.trunc);
  return [...new Set(pads.filter((p) => p >= 0 && p < PAD_COUNT))].sort((a, b) => a - b);
}

export function cleanEdits(raw: unknown): Record<string, DiagramState> {
  if (!isRecord(raw)) return {};
  const out: Record<string, DiagramState> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 256)) {
    if (!isRecord(value)) continue;
    const pads = cleanPads(value.pads);
    if (pads.length) out[key.slice(0, 40)] = { pads, extra: cleanPads(value.extra) };
  }
  return out;
}

export function cleanCollectionChords(raw: unknown): CollectionChord[] {
  const out: CollectionChord[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, 512) : []) {
    if (!isRecord(item)) continue;
    const pads = cleanPads(item.pads);
    if (!pads.length) continue;
    const rootPad = isFiniteNumber(item.rootPad) && pads.includes(Math.trunc(item.rootPad)) ? Math.trunc(item.rootPad) : pads[0];
    out.push({
      symbol: text(item.symbol, 24) || "?",
      pads,
      rootPad,
      rootPc: isFiniteNumber(item.rootPc) ? ((Math.trunc(item.rootPc) % 12) + 12) % 12 : null,
      kind: text(item.kind, 24),
    });
  }
  return out;
}

export function cleanChart(raw: unknown): Chart | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, 80);
  const source = text(raw.source, MAX_SOURCE_LENGTH);
  if (!id || !source.trim() || (raw.kind !== "sheet" && raw.kind !== "progression")) return null;
  return {
    id,
    kind: raw.kind,
    title: text(raw.title, 120) || "Untitled",
    artist: text(raw.artist, 120),
    source,
    edits: cleanEdits(raw.edits),
    chords: Array.isArray(raw.chords) ? raw.chords.slice(0, 64).map((s) => String(s).slice(0, 40)) : [],
    created: timestamp(raw.created),
    updated: timestamp(raw.updated),
  };
}

export function cleanCollection(raw: unknown): Collection | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, 80);
  const name = text(raw.name, 80).trim();
  const chords = cleanCollectionChords(raw.chords);
  if (!id || !name || !chords.length) return null;
  return { id, name, chords, created: timestamp(raw.created), updated: timestamp(raw.updated) };
}
