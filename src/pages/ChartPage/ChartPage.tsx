import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { MessageScreen } from "../../components/layout";
import { analyzeInput } from "../../core/sheet/analyze";
import { useAsync } from "../../hooks/useAsync";
import type { Chart } from "../../storage";
import { getChart } from "../../storage";
import { ProgressionView } from "./components/ProgressionView";
import { SheetView } from "./components/SheetView";

/**
 * Разбор. В базе лежит только источник и правки человека, поэтому схемы
 * собираются заново при каждом открытии: солвер укладывается в миллисекунды,
 * а схемы никогда не разъедутся с текстом.
 */
export function ChartPage() {
  const { id = "" } = useParams();
  const chart = useAsync(() => getChart(id), [id]);
  if (chart.status === "loading") return <MessageScreen title="Opening…" />;
  if (chart.status === "error") return <MessageScreen title="Couldn't open" text={`Storage didn't respond: ${chart.error.message}`} />;
  if (!chart.data) return <MessageScreen title="No such chart" text="It may have been deleted, or saved in another browser." />;
  return <ChartView key={chart.data.id} chart={chart.data} />;
}

function ChartView({ chart }: { chart: Chart }) {
  const analysis = useMemo(() => analyzeInput(chart.source), [chart.source]);
  switch (analysis.kind) {
    case "empty":
      return <MessageScreen title={chart.title} text="No chords found in the source." link={{ to: `/charts/${chart.id}/edit`, label: "edit source" }} />;
    case "progression":
      return <ProgressionView chart={chart} analysis={analysis} />;
    case "sheet":
      return <SheetView chart={chart} analysis={analysis} />;
  }
}
