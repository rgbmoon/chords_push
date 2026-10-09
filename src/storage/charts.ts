import type { DiagramState } from "../core/diagram/diagram";
import { getStore, newId } from "./db";
import { cleanEdits, MAX_SOURCE_LENGTH } from "./sanitize";
import type { Chart, ChartDraft } from "./types";

export class StorageError extends Error {}

const newestFirst = <T extends { updated: number }>(items: T[]): T[] => items.sort((a, b) => b.updated - a.updated);

export const listCharts = async (): Promise<Chart[]> => newestFirst(await (await getStore()).getAll("charts"));

export const getChart = async (id: string): Promise<Chart | undefined> => (await getStore()).get("charts", id);

/** Новый разбор или правка источника старого. Правки схем при этом сохраняются. */
export async function saveChart(draft: ChartDraft): Promise<Chart> {
  if (!draft.source.trim()) throw new StorageError("empty source");
  if (draft.source.length > MAX_SOURCE_LENGTH) throw new StorageError("text is too long");
  const store = await getStore();
  const old = draft.id ? await store.get("charts", draft.id) : undefined;
  const now = Date.now();
  const chart: Chart = {
    id: old?.id ?? newId(),
    kind: draft.kind,
    title: draft.title.trim().slice(0, 120) || "Untitled",
    artist: draft.artist.trim().slice(0, 120),
    source: draft.source,
    edits: old?.edits ?? {},
    chords: draft.chords.slice(0, 64).map((s) => s.slice(0, 40)),
    created: old?.created ?? now,
    updated: now,
  };
  await store.put("charts", chart);
  return chart;
}

/** Правки схем разбора — пишутся целиком. */
export async function saveChartEdits(id: string, edits: Record<string, DiagramState>): Promise<void> {
  const store = await getStore();
  const chart = await store.get("charts", id);
  if (!chart) throw new StorageError("no such chart");
  await store.put("charts", { ...chart, edits: cleanEdits(edits) });
}

export const deleteChart = async (id: string): Promise<void> => (await getStore()).delete("charts", id);
