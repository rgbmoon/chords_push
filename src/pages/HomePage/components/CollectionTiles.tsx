import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui";
import type { Collection } from "../../../storage";
import { count, timeAgo } from "../../../utils/format";
import { AddTile, Tile, Tiles } from "./Tile";

export function CollectionTiles({ collections, onDelete }: { collections: readonly Collection[]; onDelete: (id: string) => void }) {
  if (!collections.length)
    return (
      <EmptyState>
        Nothing yet. <Link to="/finder">Open the chord finder</Link> — click a chord on the grid, add it to a collection and save it under a
        name.
      </EmptyState>
    );
  return (
    <Tiles>
      {collections.map((c) => (
        <Tile
          key={c.id}
          to={`/finder/${c.id}`}
          title={c.name}
          // на плитке видна сама цепочка: по названию через неделю не вспомнить, что внутри
          subtitle={c.chords.slice(0, 9).map((x) => x.symbol).join(" · ") + (c.chords.length > 9 ? " …" : "")}
          meta={`${count(c.chords.length, "chord", "chords")} · ${timeAgo(c.updated)}`}
          kind="collection"
          onDelete={() => onDelete(c.id)}
        />
      ))}
      <AddTile to="/finder">+ new collection</AddTile>
    </Tiles>
  );
}
