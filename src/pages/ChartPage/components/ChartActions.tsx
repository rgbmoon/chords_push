import { useNavigate } from "react-router-dom";
import { Button, ButtonLink, StatusText } from "../../../components/ui";
import { useStorageInfo } from "../../../hooks/useStorageInfo";
import { Chart, deleteChart } from "../../../storage";

/** Справа в шапке разбора: статус сохранения, «edit», «delete». */
export function ChartActions({ chart, saveFailed }: { chart: Chart; saveFailed: boolean }) {
  const navigate = useNavigate();
  const { mode } = useStorageInfo();
  const remove = async () => {
    if (!confirm(`Delete chart "${chart.title}"?`)) return;
    await deleteChart(chart.id);
    navigate("/");
  };
  return (
    <>
      {mode === "memory" && <StatusText status={{ text: "storage unavailable — edits last until the tab is closed", error: true }} />}
      {saveFailed && <StatusText status={{ text: "edit not saved", error: true }} />}
      <ButtonLink to={`/charts/${chart.id}/edit`} size="small">
        edit
      </ButtonLink>
      <Button size="small" onClick={remove}>
        delete
      </Button>
    </>
  );
}
