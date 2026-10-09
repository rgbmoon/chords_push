import { useParams } from "react-router-dom";
import { MessageScreen, PageContent, PageHeader, PageLayout } from "../../components/layout";
import { ChartEditor } from "../../features/chartEditor/ChartEditor";
import { useAsync } from "../../hooks/useAsync";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { getChart } from "../../storage";

/** Правка источника разбора: то же поле, что на главной, но с текстом и в тот же разбор. */
export function EditChartPage() {
  const { id = "" } = useParams();
  const chart = useAsync(() => getChart(id), [id]);
  const title = chart.status === "ready" && chart.data ? `Edit: ${chart.data.title}` : "Edit";
  useDocumentTitle(title);

  if (chart.status === "loading") return <MessageScreen title="Opening…" />;
  if (chart.status === "error" || !chart.data)
    return <MessageScreen title="No such chart" text="It may have been deleted, or saved in another browser." />;
  return (
    <PageLayout header={<PageHeader title={title} back={{ to: `/charts/${id}`, label: "back to chart" }} />}>
      <PageContent>
        <ChartEditor initial={chart.data} />
      </PageContent>
    </PageLayout>
  );
}
