/**
 * Где лежат данные: IndexedDB этого браузера. Сервера нет.
 *
 * Если браузер базу не даёт (хранилище сайта запрещено), приложение не падает,
 * а держит всё в памяти вкладки — и честно об этом говорит (storageMode()).
 */
import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { Chart, Collection } from "./types";

interface Schema extends DBSchema {
  charts: { key: string; value: Chart };
  collections: { key: string; value: Collection };
}

export type StoreName = "charts" | "collections";
type Value<S extends StoreName> = S extends "charts" ? Chart : Collection;

export interface Store {
  mode: "indexeddb" | "memory";
  get<S extends StoreName>(store: S, id: string): Promise<Value<S> | undefined>;
  getAll<S extends StoreName>(store: S): Promise<Value<S>[]>;
  put<S extends StoreName>(store: S, value: Value<S>): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
}

const DB_NAME = "chords-on-push";
const DB_VERSION = 1;

function indexedDbStore(db: IDBPDatabase<Schema>): Store {
  // idb типизирует get/getAll по конкретному имени хранилища, а Store — по
  // параметру S; связь «имя -> тип записи» одна и та же, приведение безопасно
  return {
    mode: "indexeddb",
    get: (store, id) => db.get(store, id) as never,
    getAll: (store) => db.getAll(store) as never,
    put: async (store, value) => {
      await db.put(store, value);
    },
    delete: (store, id) => db.delete(store, id),
  };
}

function memoryStore(): Store {
  const data: { [S in StoreName]: Map<string, Value<S>> } = { charts: new Map(), collections: new Map() };
  return {
    mode: "memory",
    get: async (store, id) => structuredClone(data[store].get(id)),
    getAll: async (store) => [...data[store].values()].map((v) => structuredClone(v)),
    put: async (store, value) => {
      (data[store] as Map<string, typeof value>).set(value.id, structuredClone(value));
    },
    delete: async (store, id) => {
      data[store].delete(id);
    },
  };
}

let connection: IDBPDatabase<Schema> | null = null;
let opening: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  opening ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("charts", { keyPath: "id" });
      db.createObjectStore("collections", { keyPath: "id" });
    },
  }).then(
    (db) => {
      connection = db;
      return indexedDbStore(db);
    },
    () => memoryStore(),
  );
  return opening;
}

export async function storageMode(): Promise<Store["mode"]> {
  return (await getStore()).mode;
}

/** Только для тестов: начать с чистой базы. */
export async function resetStoreForTests(): Promise<void> {
  // дождаться открытия, которое ещё идёт: иначе оно завершится после удаления
  // базы и подвесит следующее открытие
  await opening;
  connection?.close();
  connection = null;
  opening = null;
  await new Promise<void>((resolve) => {
    const rq = indexedDB.deleteDatabase(DB_NAME);
    rq.onsuccess = rq.onerror = rq.onblocked = () => resolve();
  });
}

export const newId = (): string => crypto.randomUUID();
