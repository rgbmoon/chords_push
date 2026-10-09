/** Мелкая арифметика, нужная теории: модуль, сравнение, перебор сочетаний. */

/** Остаток, который не бывает отрицательным: mod(-1, 12) === 11. Нужен для классов высот. */
export const mod = (a: number, n: number): number => ((a % n) + n) % n;

export const byNumber = (a: number, b: number): number => a - b;

/** Лексикографическое сравнение числовых векторов: сначала первый ключ, при равенстве — второй… */
export function compareVectors(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** Все сочетания «по одному элементу из каждого списка», в порядке списков. */
export function* cartesian<T>(lists: readonly (readonly T[])[]): Generator<T[]> {
  if (!lists.length || lists.some((l) => !l.length)) return;
  const idx = lists.map(() => 0);
  for (;;) {
    yield idx.map((k, i) => lists[i][k]);
    let i = lists.length - 1;
    while (i >= 0 && ++idx[i] === lists[i].length) idx[i--] = 0;
    if (i < 0) return;
  }
}

/** Индекс минимального элемента; при равенстве — первый. */
export function indexOfMin(values: readonly number[]): number {
  return values.reduce((best, v, i) => (v < values[best] ? i : best), 0);
}
