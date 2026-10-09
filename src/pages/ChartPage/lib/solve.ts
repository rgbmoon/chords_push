import { VoicingError } from "../../../core/grid/voicing";

/** Прогнать солвер; аккорд, не влезающий в сетку, — сообщение, а не падение страницы. */
export function solve<T>(run: () => T): [T | null, string | null] {
  try {
    return [run(), null];
  } catch (e) {
    if (e instanceof VoicingError) return [null, e.message];
    throw e;
  }
}
