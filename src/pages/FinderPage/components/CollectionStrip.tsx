import { useEffect, useRef, useState } from "react";
import { CardButton, DiagramCard, DiagramList, PadGrid } from "../../../components/music";
import { Button } from "../../../components/ui";
import { count } from "../../../utils/format";
import type { FinderAction, FinderState } from "../lib/finderState";
import { readingCells, readingText } from "../lib/reading";
import styles from "./CollectionStrip.module.scss";

/** Подбор: аккорды, добавленные с большой сетки. Клик — вернуть на сетку, перетаскивание — порядок. */
export function CollectionStrip({ state, dispatch }: { state: FinderState; dispatch: (action: FinderAction) => void }) {
  const [dragging, setDragging] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const { items } = state;

  useEffect(() => {
    if (state.added >= 0) list.current?.children[state.added]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [state.added]);

  return (
    <>
      <div className={styles.head}>
        <b>{items.length ? `Collection: ${count(items.length, "chord", "chords")}` : "Collection is empty"}</b>
        <Button
          size="small"
          disabled={!items.length}
          onClick={() => confirm("Remove all chords from the collection?") && dispatch({ type: "clearItems" })}
        >
          clear all
        </Button>
      </div>
      {!items.length && (
        <p className={styles.empty}>Build a chord on the grid on the left and press “Add to collection” — diagrams will line up here.</p>
      )}
      <DiagramList ref={list} aria-label="collection" onDragOver={(e) => e.preventDefault()}>
        {items.map((item, i) => (
          <DiagramCard
            key={`${i}:${item.symbol}:${item.pads.join(",")}`}
            className={styles.card}
            title={item.symbol || "?"}
            {...readingText(item)}
            aria-current={i === state.current}
            data-added={i === state.added || undefined}
            data-dragging={i === dragging || undefined}
            draggable
            onClick={() => dispatch({ type: "openItem", index: i })}
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", item.symbol);
            }}
            onDragEnd={() => setDragging(-1)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging >= 0) dispatch({ type: "moveItem", from: dragging, to: i });
              setDragging(-1);
            }}
            actions={
              <CardButton
                title="remove"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: "removeItem", index: i });
                }}
              >
                &times;
              </CardButton>
            }
          >
            <PadGrid cells={readingCells(item)} inert />
          </DiagramCard>
        ))}
      </DiagramList>
    </>
  );
}
