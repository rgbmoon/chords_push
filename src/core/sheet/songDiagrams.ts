import type { Pad } from "../grid/grid";
import { voiceProgression } from "../grid/voicing";
import { Chord, parseChord } from "../theory/chord";

export interface SongDiagram {
  chord: Chord;
  /** раскладка солвера */
  pads: Pad[];
}

/**
 * Одна схема на уникальный аккорд песни. Раскладка выбирается не в вакууме:
 * солвер прогоняется по всей цепочке песни, и схеме достаётся вариант, который
 * встретился в цепочке чаще всего (при равенстве — первый).
 */
export function songDiagrams(symbols: readonly string[]): SongDiagram[] {
  const seen = new Map<string, { chord: Chord; counts: Map<string, { pads: Pad[]; n: number }> }>();
  for (const v of voiceProgression(symbols.map(parseChord))) {
    const entry = seen.get(v.chord.symbol) ?? { chord: v.chord, counts: new Map() };
    seen.set(v.chord.symbol, entry);
    const key = v.pads.join(",");
    const c = entry.counts.get(key) ?? { pads: v.pads, n: 0 };
    entry.counts.set(key, { ...c, n: c.n + 1 });
  }
  return [...seen.values()].map(({ chord, counts }) => ({
    chord,
    pads: [...counts.values()].reduce((a, b) => (b.n > a.n ? b : a)).pads,
  }));
}
