import { useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MessageScreen } from "../../components/layout";
import { useAsync } from "../../hooks/useAsync";
import { Collection, getCollection } from "../../storage";
import { Finder } from "./components/Finder";
import { restoreItem } from "./lib/finderState";

/**
 * Определение аккорда и подбор. Один маршрут на новый и сохранённый подбор.
 * Каждый переход открывает свежий экран — кроме одного случая: после первого
 * сохранения адрес меняется на /finder/:id, а экран остаётся тем же и сетку
 * не сбрасывает.
 */
export function FinderPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const created = useRef<{ id: string; screen: string } | null>(null);

  const keepScreen = id !== undefined && created.current?.id === id;
  const screen = keepScreen ? created.current!.screen : location.key;
  const loadId = keepScreen ? null : (id ?? null);

  const collection = useAsync<Collection | null | undefined>(() => (loadId ? getCollection(loadId) : Promise.resolve(null)), [loadId]);
  const data = collection.status === "ready" ? collection.data : null;
  const items = useMemo(() => data?.chords.map(restoreItem) ?? [], [data]);

  if (loadId && collection.status === "loading") return <MessageScreen title="Opening…" />;
  if (loadId && !data) return <MessageScreen title="No such collection" text="It may have been deleted, or saved in another browser." />;

  return (
    <Finder
      key={screen}
      collectionId={data?.id ?? null}
      name={data?.name ?? ""}
      items={items}
      onCreated={(newId) => {
        created.current = { id: newId, screen };
        navigate(`/finder/${newId}`, { replace: true });
      }}
    />
  );
}
