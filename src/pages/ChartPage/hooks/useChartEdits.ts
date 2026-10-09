import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramState } from "../../../core/diagram/diagram";
import { Chart, saveChartEdits } from "../../../storage";

const SAVE_DELAY_MS = 120;

/**
 * Правки схем уходят в базу с задержкой: перенос голоса и следующий клик
 * ложатся одной записью. Уходя со страницы — дописываем сразу.
 */
export function useChartEdits(chart: Chart) {
  const edits = useRef<Record<string, DiagramState>>({ ...chart.edits });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(() => {
    timer.current = null;
    saveChartEdits(chart.id, edits.current).then(
      () => setFailed(false),
      () => setFailed(true),
    );
  }, [chart.id]);

  useEffect(
    () => () => {
      if (timer.current === null) return;
      clearTimeout(timer.current);
      flush();
    },
    [flush],
  );

  const change = useCallback(
    (key: string, state: DiagramState | null) => {
      if (state) edits.current[key] = state;
      else delete edits.current[key];
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  return { saved: chart.edits, change, failed };
}
