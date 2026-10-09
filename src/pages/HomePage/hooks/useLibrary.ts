import { useAsync } from "../../../hooks/useAsync";
import { deleteChart, deleteCollection, listCharts, listCollections } from "../../../storage";

/** Разборы и подборы для главной. */
export function useLibrary() {
  const library = useAsync(async () => ({ charts: await listCharts(), collections: await listCollections() }), []);
  return {
    ...library,
    removeChart: (id: string) => deleteChart(id).then(library.reload),
    removeCollection: (id: string) => deleteCollection(id).then(library.reload),
  };
}
