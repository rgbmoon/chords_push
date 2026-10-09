/**
 * Без persist() браузер может молча очистить базу, если кончится место на диске.
 * Просим его об этом после первого сохранения; статус показываем человеку.
 */
export type Persistence = "persisted" | "best-effort" | "unsupported";

async function ask(method: "persisted" | "persist"): Promise<Persistence> {
  try {
    const fn = navigator.storage?.[method];
    if (!fn) return "unsupported";
    return (await fn.call(navigator.storage)) ? "persisted" : "best-effort";
  } catch {
    return "unsupported";
  }
}

export const getPersistence = (): Promise<Persistence> => ask("persisted");
export const requestPersistence = (): Promise<Persistence> => ask("persist");
