/**
 * Эталоны, снятые с Python-версии (tools/dump_fixtures.py в коммите порта).
 * Python удалён — эталоны заморожены: TS обязан отвечать так же.
 *
 * Одно исключение: подписи. Python писал названия типов, интервалов и «ступени»
 * по-русски, интерфейс теперь английский. Эталоны при этом не переписаны —
 * ожидание переводится здесь, по ключу (тип аккорда, число полутонов), так что
 * теория по-прежнему сверяется с Python, а меняются только слова.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHORDS, INTERVALS } from "../src/core/data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixture(name: string): any {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf-8"));
}

const RU_INTERVAL = new Map<string, number>(
  (fixture("data.json").intervals as [string, { name: string }][]).map(([n, v]) => [v.name, Number(n)]),
);

const en = (ru: string): string => {
  const n = RU_INTERVAL.get(ru);
  if (n === undefined) throw new Error(`нет перевода для «${ru}»`);
  return INTERVALS.get(n)!.name;
};

/** Название интервала из Python-эталона — по-английски, в том же составном формате. */
export function enInterval(ru: string): string {
  if (!ru) return ru;
  if (RU_INTERVAL.has(ru)) return en(ru);
  const words: Record<string, string> = { "две октавы": "two octaves", "три октавы": "three octaves" };
  if (words[ru]) return words[ru];
  let m = /^(\d+) октав$/.exec(ru);
  if (m) return `${m[1]} octaves`;
  m = /^(.+) через октаву$/.exec(ru);
  if (m) return `${en(m[1])} plus an octave`;
  m = /^(.+) через (\d+) октавы$/.exec(ru);
  if (m) return `${en(m[1])} plus ${m[2]} octaves`;
  throw new Error(`нет перевода для «${ru}»`);
}

/** Ответ identify из эталона — с английскими названиями типа и интервала. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function enIdentify(out: any): any {
  return {
    ...out,
    interval: enInterval(out.interval),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candidates: out.candidates.map((c: any) => ({ ...c, name: CHORDS.get(c.kind)!.name })),
  };
}

/** «ступени 1 · b3 · 5» -> «degrees 1 · b3 · 5». */
export const enPgm = (s: string | null): string | null => (s === null ? s : s.replace(/^ступени /, "degrees "));
