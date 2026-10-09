import { StorageError } from "./charts";
import { getStore, newId } from "./db";
import { cleanCollectionChords } from "./sanitize";
import type { Collection, CollectionDraft } from "./types";

export const listCollections = async (): Promise<Collection[]> =>
  (await (await getStore()).getAll("collections")).sort((a, b) => b.updated - a.updated);

export const getCollection = async (id: string): Promise<Collection | undefined> => (await getStore()).get("collections", id);

/** Подбор хранит ПЭДЫ, а не только символ: иначе теряется аппликатура и выбранный рут. */
export async function saveCollection(draft: CollectionDraft): Promise<Collection> {
  const name = draft.name.trim().slice(0, 80);
  if (!name) throw new StorageError("name required");
  const chords = cleanCollectionChords(draft.chords);
  if (!chords.length) throw new StorageError("collection is empty");
  const store = await getStore();
  const old = draft.id ? await store.get("collections", draft.id) : undefined;
  const now = Date.now();
  const collection: Collection = { id: old?.id ?? newId(), name, chords, created: old?.created ?? now, updated: now };
  await store.put("collections", collection);
  return collection;
}

export const deleteCollection = async (id: string): Promise<void> => (await getStore()).delete("collections", id);
