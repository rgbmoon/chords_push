import { listCharts, StorageError } from "./charts";
import { listCollections } from "./collections";
import { getStore, StoreName } from "./db";
import { cleanChart, cleanCollection } from "./sanitize";
import type { Chart, Collection } from "./types";

const APP = "chords-on-push";

export interface Backup {
  app: typeof APP;
  version: 1;
  exported: string;
  charts: Chart[];
  collections: Collection[];
}

export async function exportBackup(): Promise<Backup> {
  return { app: APP, version: 1, exported: new Date().toISOString(), charts: await listCharts(), collections: await listCollections() };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Слияние по id: из двух версий одной записи побеждает более свежая. Мусор пропускается. */
export async function importBackup(raw: unknown): Promise<ImportResult> {
  if (!raw || typeof raw !== "object" || (raw as { app?: unknown }).app !== APP)
    throw new StorageError("this is not a Chords on Push backup");
  const backup = raw as { charts?: unknown; collections?: unknown };
  const store = await getStore();
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };

  async function merge<T extends Chart | Collection>(name: StoreName, items: unknown, clean: (x: unknown) => T | null) {
    for (const item of Array.isArray(items) ? items : []) {
      const record = clean(item);
      const old = record && (await store.get(name, record.id));
      if (!record || (old && old.updated >= record.updated)) {
        result.skipped++;
        continue;
      }
      await store.put(name, record as never);
      result[old ? "updated" : "added"]++;
    }
  }
  await merge("charts", backup.charts, cleanChart);
  await merge("collections", backup.collections, cleanCollection);
  return result;
}
