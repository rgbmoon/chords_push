/**
 * Хранилище — IndexedDB этого браузера. Сервера нет, всё лежит у человека.
 *
 * В базе только выбор человека: источник разбора и накликанные пэды, имя
 * подбора и его пэды. Схемы, ступени и запись нот — производное: его дешевле
 * пересчитать при открытии, чем потом чинить разъехавшиеся копии.
 *
 * Всё, что приходит снаружи (из схемы, из файла бэкапа), проходит через те же
 * чистильщики, что и раньше на сервере: в базу попадают только пэды 0..63.
 */
import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { Saved } from "../view/live";

export type AnalysisKind = "sheet" | "progression";

export interface Analysis {
  id: string;
  kind: AnalysisKind;
  title: string;
  artist: string;
  /** исходный текст — ровно то, что человек вставил */
  source: string;
  /** накликанные аппликатуры: ключ — символ аккорда (песня) или «номер:символ» (последовательность) */
  state: Record<string, Saved>;
  /** для плитки на главной: аккорды со схемами */
  syms: string[];
  created: number;
  updated: number;
}

export interface PickChord {
  sym: string;
  pads: number[];
  root: number;
  root_pc: number | null;
  kind: string;
}

export interface Pick {
  id: string;
  name: string;
  chords: PickChord[];
  created: number;
  updated: number;
}

interface Schema extends DBSchema {
  analyses: { key: string; value: Analysis; indexes: { updated: number } };
  picks: { key: string; value: Pick; indexes: { updated: number } };
}

type StoreName = "analyses" | "picks";
type Rec<S extends StoreName> = S extends "analyses" ? Analysis : Pick;

/**
 * Где лежат данные. Обычно — IndexedDB. Если браузер её не даёт (запрещено
 * хранилище сайта, очень старый приватный режим), приложение не падает, а
 * держит всё в памяти вкладки и честно об этом говорит: разбирать можно,
 * сохранить — нет.
 */
interface Backend {
  mode: "idb" | "memory";
  get<S extends StoreName>(s: S, id: string): Promise<Rec<S> | undefined>;
  getAll<S extends StoreName>(s: S): Promise<Rec<S>[]>;
  put<S extends StoreName>(s: S, v: Rec<S>): Promise<void>;
  delete(s: StoreName, id: string): Promise<void>;
}

export const DB_NAME = "chords-push";
const DB_VERSION = 1;

function idbBackend(d: IDBPDatabase<Schema>): Backend {
  return {
    mode: "idb",
    get: (s, id) => d.get(s, id) as never,
    getAll: (s) => d.getAll(s) as never,
    put: async (s, v) => {
      await d.put(s, v as never);
    },
    delete: (s, id) => d.delete(s, id),
  };
}

function memoryBackend(): Backend {
  const m = { analyses: new Map<string, Analysis>(), picks: new Map<string, Pick>() };
  const copy = <T>(v: T): T => structuredClone(v);
  return {
    mode: "memory",
    get: async (s, id) => copy(m[s].get(id)) as never,
    getAll: async (s) => [...m[s].values()].map(copy) as never,
    put: async (s, v) => {
      (m[s] as Map<string, unknown>).set(v.id, copy(v));
    },
    delete: async (s, id) => {
      m[s].delete(id);
    },
  };
}

let bp: Promise<Backend> | null = null;
let opened: IDBPDatabase<Schema> | null = null;

function db(): Promise<Backend> {
  if (!bp) {
    bp = (async () => {
      try {
        if (typeof indexedDB === "undefined") throw new Error("нет IndexedDB");
        const d = await openDB<Schema>(DB_NAME, DB_VERSION, {
          upgrade(u) {
            u.createObjectStore("analyses", { keyPath: "id" }).createIndex("updated", "updated");
            u.createObjectStore("picks", { keyPath: "id" }).createIndex("updated", "updated");
          },
        });
        opened = d;
        return idbBackend(d);
      } catch {
        return memoryBackend();
      }
    })();
  }
  return bp;
}

/** "idb" — данные переживут перезагрузку; "memory" — только до закрытия вкладки. */
export async function storageMode(): Promise<Backend["mode"]> {
  return (await db()).mode;
}

/** Только для тестов: начать с чистого листа. */
export async function resetForTests(): Promise<void> {
  // сначала дождаться подключения, которое ещё открывается: иначе оно откроется
  // уже после удаления базы и повесит следующее открытие
  const old = bp;
  bp = null;
  await old?.catch(() => null);
  opened?.close();
  opened = null;
  await new Promise<void>((ok) => {
    const rq = indexedDB.deleteDatabase(DB_NAME);
    rq.onsuccess = rq.onerror = rq.onblocked = () => ok();
  });
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

// ------------------------------------------------------------- чистильщики --

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Пэды 0..63 без повторов, по возрастанию номера. */
export function cleanPads(raw: unknown): number[] {
  const out: number[] = [];
  for (const v of Array.isArray(raw) ? raw.slice(0, 64) : []) {
    if (!isNum(v)) continue;
    const i = Math.trunc(v);
    if (i >= 0 && i < 64 && !out.includes(i)) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/** Из правок схем берём только пэды — всё остальное схема пересчитает сама. */
export function cleanState(raw: unknown): Record<string, Saved> {
  const out: Record<string, Saved> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [sym, st] of Object.entries(raw as Record<string, unknown>).slice(0, 256)) {
    if (!st || typeof st !== "object") continue;
    const s = st as { pads?: unknown; extra?: unknown };
    const pads = cleanPads(s.pads);
    if (pads.length) out[sym.slice(0, 40)] = { pads, extra: cleanPads(s.extra) };
  }
  return out;
}

/** Сохраняем ПЭДЫ, а не только символ: иначе теряется аппликатура. */
export function cleanChords(raw: unknown): PickChord[] {
  const out: PickChord[] = [];
  for (const it of Array.isArray(raw) ? raw.slice(0, 512) : []) {
    if (!it || typeof it !== "object") continue;
    const c = it as Record<string, unknown>;
    const pads = [
      ...new Set((Array.isArray(c.pads) ? c.pads : []).filter(isNum).map(Math.trunc).filter((p) => p >= 0 && p < 64)),
    ].sort((a, b) => a - b);
    if (!pads.length) continue;
    // какой пэд был рутом, тоже храним: подбор открывается с ним же, иначе
    // при загрузке карточки рут пересчитался бы по-своему
    const root = isNum(c.root) && pads.includes(Math.trunc(c.root)) ? Math.trunc(c.root) : pads[0];
    out.push({
      sym: String(c.sym || "?").slice(0, 24),
      pads,
      root,
      root_pc: isNum(c.root_pc) ? ((Math.trunc(c.root_pc) % 12) + 12) % 12 : null,
      kind: String(c.kind || "").slice(0, 24),
    });
  }
  return out;
}

const MAX_SOURCE = 200_000; // символов: длиннее песен не бывает, а базу не раздуть

export class StoreError extends Error {}

// ----------------------------------------------------------------- разборы --

export async function listAnalyses(): Promise<Analysis[]> {
  const all = await (await db()).getAll("analyses");
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getAnalysis(id: string): Promise<Analysis | undefined> {
  return (await db()).get("analyses", id);
}

export interface AnalysisInput {
  id?: string;
  kind: AnalysisKind;
  title: string;
  artist: string;
  source: string;
  syms: string[];
}

/** Новый разбор или правка источника старого. Правки схем при этом сохраняются. */
export async function saveAnalysis(input: AnalysisInput): Promise<Analysis> {
  const source = String(input.source);
  if (!source.trim()) throw new StoreError("пустой источник");
  if (source.length > MAX_SOURCE) throw new StoreError("слишком длинный текст");
  const d = await db();
  const old = input.id ? await d.get("analyses", input.id) : undefined;
  const now = Date.now();
  const rec: Analysis = {
    id: old?.id ?? input.id ?? newId(),
    kind: input.kind,
    title: String(input.title || "").trim().slice(0, 120) || "Без названия",
    artist: String(input.artist || "").trim().slice(0, 120),
    source,
    state: old?.state ?? {},
    syms: input.syms.slice(0, 64).map((s) => String(s).slice(0, 40)),
    created: old?.created ?? now,
    updated: now,
  };
  await d.put("analyses", rec);
  return rec;
}

/** Правки схем разбора: пишется целиком, как раньше state.json. */
export async function saveAnalysisState(id: string, state: Record<string, Saved | null>): Promise<void> {
  const d = await db();
  const rec = await d.get("analyses", id);
  if (!rec) throw new StoreError("нет такого разбора");
  rec.state = cleanState(state);
  await d.put("analyses", rec);
}

export async function deleteAnalysis(id: string): Promise<void> {
  await (await db()).delete("analyses", id);
}

// ----------------------------------------------------------------- подборы --

export async function listPicks(): Promise<Pick[]> {
  const all = await (await db()).getAll("picks");
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getPick(id: string): Promise<Pick | undefined> {
  return (await db()).get("picks", id);
}

export async function savePick(input: { id?: string | null; name: string; chords: unknown }): Promise<Pick> {
  const name = String(input.name || "").trim().slice(0, 80);
  if (!name) throw new StoreError("нужно название");
  const chords = cleanChords(input.chords);
  if (!chords.length) throw new StoreError("подбор пуст");
  const d = await db();
  const old = input.id ? await d.get("picks", input.id) : undefined;
  const now = Date.now();
  const rec: Pick = { id: old?.id ?? newId(), name, chords, created: old?.created ?? now, updated: now };
  await d.put("picks", rec);
  return rec;
}

export async function deletePick(id: string): Promise<void> {
  await (await db()).delete("picks", id);
}

// -------------------------------------------------------- постоянство базы --

export type Persistence = "persisted" | "best-effort" | "unsupported";

/** Браузер может молча очистить базу, если место кончается. persist() это запрещает. */
export async function persistence(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persisted) return "unsupported";
    return (await navigator.storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "unsupported";
  }
}

export async function requestPersist(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    return (await navigator.storage.persist()) ? "persisted" : "best-effort";
  } catch {
    return "unsupported";
  }
}

// ------------------------------------------------------------------- бэкап --

export interface Backup {
  app: "chords-push";
  version: 1;
  exported: string;
  analyses: Analysis[];
  picks: Pick[];
}

export async function exportAll(): Promise<Backup> {
  return {
    app: "chords-push",
    version: 1,
    exported: new Date().toISOString(),
    analyses: await listAnalyses(),
    picks: await listPicks(),
  };
}

const str = (v: unknown, n: number): string => (typeof v === "string" ? v.slice(0, n) : "");
const ts = (v: unknown): number => (isNum(v) && v > 0 ? v : Date.now());

function cleanAnalysis(raw: unknown): Analysis | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const id = str(a.id, 80);
  const source = str(a.source, MAX_SOURCE);
  if (!id || !source.trim() || (a.kind !== "sheet" && a.kind !== "progression")) return null;
  return {
    id,
    kind: a.kind,
    title: str(a.title, 120) || "Без названия",
    artist: str(a.artist, 120),
    source,
    state: cleanState(a.state),
    syms: Array.isArray(a.syms) ? a.syms.slice(0, 64).map((s) => String(s).slice(0, 40)) : [],
    created: ts(a.created),
    updated: ts(a.updated),
  };
}

function cleanPick(raw: unknown): Pick | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = str(p.id, 80);
  const name = str(p.name, 80).trim();
  const chords = cleanChords(p.chords);
  if (!id || !name || !chords.length) return null;
  return { id, name, chords, created: ts(p.created), updated: ts(p.updated) };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Слияние по id: из двух версий одной записи побеждает более свежая. */
export async function importAll(raw: unknown): Promise<ImportResult> {
  if (!raw || typeof raw !== "object" || (raw as { app?: unknown }).app !== "chords-push")
    throw new StoreError("это не бэкап «Аккордов на Push»");
  const b = raw as { analyses?: unknown; picks?: unknown };
  const res: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const d = await db();
  const merge = async <S extends StoreName>(store: S, items: unknown, clean: (x: unknown) => Rec<S> | null) => {
    for (const it of Array.isArray(items) ? items : []) {
      const rec = clean(it);
      if (!rec) {
        res.skipped++;
        continue;
      }
      const old = await d.get(store, rec.id);
      if (old && old.updated >= rec.updated) {
        res.skipped++;
        continue;
      }
      await d.put(store, rec);
      if (old) res.updated++;
      else res.added++;
    }
  };
  await merge("analyses", b.analyses, cleanAnalysis as (x: unknown) => Rec<"analyses"> | null);
  await merge("picks", b.picks, cleanPick as (x: unknown) => Rec<"picks"> | null);
  return res;
}
