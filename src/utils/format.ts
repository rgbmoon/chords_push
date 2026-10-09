/** Подписи на экране: число с существительным, «сколько времени назад», дата. */

/** count(2, "chord", "chords") -> "2 chords" */
export const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function timeAgo(ms: number, now = Date.now()): string {
  const seconds = Math.max(0, (now - ms) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${count(Math.floor(seconds / 60), "minute", "minutes")} ago`;
  if (seconds < 86400) return `${count(Math.floor(seconds / 3600), "hour", "hours")} ago`;
  const days = Math.floor(seconds / 86400);
  return days < 30 ? `${count(days, "day", "days")} ago` : formatDate(ms);
}

/** 2026-10-09 — по местному времени: однозначно в любой стране. */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
}
