/** Подписи на экране: число с существительным и «сколько времени назад». */

/** 1 chord, 2 chords. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export const count = (n: number, one: string, many: string): string => `${n} ${plural(n, one, many)}`;

/** «just now», «5 minutes ago», «2 days ago», дальше месяца — дата. */
export function ago(ms: number, now = Date.now()): string {
  const d = Math.max(0, (now - ms) / 1000);
  if (d < 3600) {
    const n = Math.floor(d / 60);
    return n < 1 ? "just now" : `${count(n, "minute", "minutes")} ago`;
  }
  if (d < 86400) return `${count(Math.floor(d / 3600), "hour", "hours")} ago`;
  const n = Math.floor(d / 86400);
  if (n < 30) return `${count(n, "day", "days")} ago`;
  return fmtDate(ms);
}

/** 2026-10-09 — по местному времени: однозначно в любой стране. */
export function fmtDate(ms: number): string {
  const t = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
