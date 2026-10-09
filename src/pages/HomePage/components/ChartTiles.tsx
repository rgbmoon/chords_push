import { EmptyState } from "../../../components/ui";
import type { Chart } from "../../../storage";
import { count, timeAgo } from "../../../utils/format";
import { Tile, Tiles } from "./Tile";

function subtitle(chart: Chart): string {
  const parts = chart.artist ? [chart.artist] : [];
  if (chart.kind === "progression") parts.push(chart.chords.slice(0, 9).join(" · ") + (chart.chords.length > 9 ? " …" : ""));
  else if (chart.chords.length) parts.push(count(chart.chords.length, "diagram", "diagrams"));
  return parts.join(" · ");
}

export function ChartTiles({ charts, onDelete }: { charts: readonly Chart[]; onDelete: (id: string) => void }) {
  if (!charts.length) return <EmptyState>Nothing yet. Paste chords or lyrics into the box above and press “Create chart”.</EmptyState>;
  return (
    <Tiles>
      {charts.map((c) => (
        <Tile key={c.id} to={`/charts/${c.id}`} title={c.title} subtitle={subtitle(c)} meta={timeAgo(c.updated)} kind="chart" onDelete={() => onDelete(c.id)} />
      ))}
    </Tiles>
  );
}
