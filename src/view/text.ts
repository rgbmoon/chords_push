/** Русские подписи: склонение и «сколько времени назад». */

/** Русское склонение: 1 нота, 2-4 ноты, 5+ нот. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return few;
  return many;
}

/** «только что», «5 минут назад», «2 дня назад», дальше месяца — дата. */
export function ago(ms: number, now = Date.now()): string {
  const d = Math.max(0, (now - ms) / 1000);
  if (d < 3600) {
    const n = Math.floor(d / 60);
    return n < 1 ? "только что" : `${n} ${plural(n, "минуту", "минуты", "минут")} назад`;
  }
  if (d < 86400) {
    const n = Math.floor(d / 3600);
    return `${n} ${plural(n, "час", "часа", "часов")} назад`;
  }
  const n = Math.floor(d / 86400);
  if (n < 30) return `${n} ${plural(n, "день", "дня", "дней")} назад`;
  return fmtDate(ms);
}

/** 09.10.2026 — по местному времени, как писал Python (time.localtime). */
export function fmtDate(ms: number): string {
  const t = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(t.getDate())}.${p(t.getMonth() + 1)}.${t.getFullYear()}`;
}
