/**
 * Питоновская семантика там, где JS ведёт себя иначе.
 *
 * Ядро переписано с Python, и расходиться с ним оно не имеет права: на этом
 * держатся эталонные фикстуры. Ловушки, ради которых этот файл существует:
 *   - `%` в JS — остаток, а не модуль: -1 % 12 === -1, в Python это 11;
 *   - `//` в Python округляет вниз, `Math.trunc` — к нулю;
 *   - кортежи сравниваются поэлементно, а в JS массивы через `<` — строками;
 *   - `Array.prototype.sort()` без компаратора сортирует числа как строки.
 */

/** Модуль с питоновским знаком: mod(-1, 12) === 11. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Целочисленное деление с округлением вниз: floorDiv(-1, 12) === -1. */
export function floorDiv(a: number, n: number): number {
  return Math.floor(a / n);
}

/** Сравнение кортежей как в Python: поэлементно, короткий меньше. */
export function cmpTuple(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

/** Числовая сортировка — копия, исходный массив не трогаем. */
export function sortNum(xs: readonly number[]): number[] {
  return xs.slice().sort((a, b) => a - b);
}

/** Стабильная сортировка по ключу-кортежу (как sorted(key=...)). */
export function sortByKey<T>(xs: readonly T[], key: (x: T) => readonly (number | string)[]): T[] {
  const keyed = xs.map((x, i) => ({ x, k: key(x), i }));
  keyed.sort((a, b) => cmpTuple(a.k, b.k) || a.i - b.i);
  return keyed.map((e) => e.x);
}

/** Индекс первого минимума — как min(range(n), key=...). */
export function argMin(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[best]) best = i;
  return best;
}

/** itertools.product: декартово произведение в том же порядке, что и в Python. */
export function* product<T>(lists: readonly (readonly T[])[]): Generator<T[]> {
  if (lists.some((l) => l.length === 0)) return;
  const idx = new Array<number>(lists.length).fill(0);
  for (;;) {
    yield idx.map((k, i) => lists[i][k]);
    let i = lists.length - 1;
    while (i >= 0) {
      idx[i]++;
      if (idx[i] < lists[i].length) break;
      idx[i] = 0;
      i--;
    }
    if (i < 0) return;
  }
}

/**
 * Формат `%.Ng` из Python: N значащих цифр, хвостовые нули срезаются,
 * экспонента — если порядок меньше -4 или не меньше N.
 */
export function fmtG(x: number, precision = 6): string {
  const p = precision === 0 ? 1 : precision;
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : x < 0 ? "-inf" : "nan";
  const exp = Number(x.toExponential(p - 1).split("e")[1]);
  if (exp < -4 || exp >= p) {
    const [m, e] = x.toExponential(p - 1).split("e");
    const mant = m.includes(".") ? m.replace(/\.?0+$/, "") : m;
    const en = Number(e);
    return `${mant}e${en < 0 ? "-" : "+"}${String(Math.abs(en)).padStart(2, "0")}`;
  }
  const s = x.toFixed(Math.max(0, p - 1 - exp));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/**
 * Подстановка в шаблон с питоновскими плейсхолдерами `%(name)s`, `%(name)d`,
 * `%(name).3g` и `%%`. Нужна, чтобы CSS из Python переехал дословно, а не
 * переписывался руками с риском разъехаться в мелочах.
 */
export function pyFormat(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/%(?:\((\w+)\)(?:\.(\d+))?([sdg])|%)/g, (m, name, prec, conv) => {
    if (m === "%%") return "%";
    const v = vars[name];
    if (v === undefined) throw new Error(`no value for %(${name})`);
    if (conv === "s") return String(v);
    if (conv === "d") return String(Math.trunc(Number(v)));
    return fmtG(Number(v), prec === undefined ? 6 : Number(prec));
  });
}

/**
 * Пробельные символы Python (str.isspace). У JS `\s` набор другой: в нём есть
 * U+FEFF, но нет \x1c-\x1f и \x85. Разбор текста песни обязан совпадать с
 * Python до символа — поэтому strip/split здесь свои.
 */
export const PY_WS_CHARS = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
export const PY_WS_RE = new RegExp(`[${PY_WS_CHARS}]`);
const LEAD_RE = new RegExp(`^[${PY_WS_CHARS}]+`);
const TRAIL_RE = new RegExp(`[${PY_WS_CHARS}]+$`);
const RUN_RE = new RegExp(`[${PY_WS_CHARS}]+`);
export const NON_WS_RUN_RE = new RegExp(`[^${PY_WS_CHARS}]+`, "g");

export const pyLstrip = (s: string): string => s.replace(LEAD_RE, "");
export const pyRstrip = (s: string): string => s.replace(TRAIL_RE, "");
export const pyStrip = (s: string): string => pyRstrip(pyLstrip(s));

/** str.split() без аргументов: по любым пробелам, пустых кусков нет. */
export function pySplit(s: string): string[] {
  const t = pyStrip(s);
  return t ? t.split(RUN_RE) : [];
}

/** str.splitlines(): те же разделители строк, что в Python, без хвостового пустого. */
export function pySplitLines(s: string): string[] {
  if (!s) return [];
  const parts = s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Срез по кодовым точкам, как s[a:b] в Python (JS режет по UTF-16). */
export function cpSlice(cps: readonly string[], a: number, b?: number): string {
  return cps.slice(a, b).join("");
}
