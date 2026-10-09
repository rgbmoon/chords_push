import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { analyzeInput } from "../../core/sheet/analyze";
import { Chart, requestPersistence, saveChart } from "../../storage";
import { draftProblem, toChartDraft } from "./draft";

/**
 * Черновик разбора: текст, название, исполнитель. Шапка текста (@title,
 * @artist) заполняет поля, пока человек их не трогал.
 */
export function useChartDraft(initial?: Chart) {
  const [source, setSource] = useState(initial?.source ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [artist, setArtist] = useState(initial?.artist ?? "");
  const touched = useRef({ title: !!initial, artist: !!initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // разбор текста и прогон солвера — не на каждую букву, а когда React свободен
  const deferredSource = useDeferredValue(source);
  const analysis = useMemo(() => analyzeInput(deferredSource), [deferredSource]);
  const problem = useMemo(() => draftProblem(analysis), [analysis]);

  useEffect(() => {
    if (!touched.current.title) setTitle(analysis.meta.title ?? "");
    if (!touched.current.artist) setArtist(analysis.meta.artist ?? "");
  }, [analysis.meta.title, analysis.meta.artist]);

  async function save(): Promise<Chart | null> {
    if (problem || analysis.kind === "empty") {
      setError(problem);
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const chart = await saveChart(toChartDraft(analysis, { id: initial?.id, title, artist, source }));
      void requestPersistence(); // первое сохранение — самое время попросить браузер не чистить базу
      return chart;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    source,
    setSource: (text: string) => {
      setSource(text);
      setError(null);
    },
    title,
    setTitle: (t: string) => {
      touched.current.title = true;
      setTitle(t);
    },
    artist,
    setArtist: (a: string) => {
      touched.current.artist = true;
      setArtist(a);
    },
    insertExample: (text: string) => {
      touched.current.title = false;
      setSource(text);
    },
    analysis,
    problem,
    error,
    saving,
    save,
  };
}
