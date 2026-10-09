import { useMemo, useRef, useState } from "react";
import { PageHeader, PageLayout, SplitPane } from "../../../components/layout";
import { PadGrid } from "../../../components/music";
import { Button, Status, StatusText, TextField } from "../../../components/ui";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { saveCollection } from "../../../storage";
import { useFinder } from "../hooks/useFinder";
import { currentReading, FinderItem, isFull, toStored } from "../lib/finderState";
import { readingCells } from "../lib/reading";
import { CollectionStrip } from "./CollectionStrip";
import styles from "./Finder.module.scss";
import { FinderResult } from "./FinderResult";

const ASIDE_MIN = 315 + 26;

interface FinderProps {
  collectionId: string | null;
  name: string;
  items: FinderItem[];
  /** подбор сохранён впервые — у него появился id */
  onCreated: (id: string) => void;
}

/** Слева — большая живая сетка и разбор, справа — собранный подбор. */
export function Finder({ collectionId, name: initialName, items, onCreated }: FinderProps) {
  const { state, dispatch, clickPad, hint } = useFinder(items);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [id, setId] = useState(collectionId);
  const [status, setStatus] = useState<Status | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  useDocumentTitle(savedName ? `${savedName} — collection` : "Chord finder");

  const cells = useMemo(() => readingCells(currentReading(state)), [state]);

  async function save() {
    if (!name.trim()) {
      nameField.current?.focus();
      return setStatus({ text: "name required", error: true });
    }
    try {
      const collection = await saveCollection({ id, name, chords: state.items.map(toStored) });
      setSavedName(collection.name);
      setStatus({ text: "saved" });
      if (collection.id !== id) {
        setId(collection.id);
        onCreated(collection.id);
      }
    } catch (e) {
      setStatus({ text: (e as Error).message, error: true });
    }
  }

  return (
    <PageLayout
      variant="fixed"
      scrollOnMobile
      header={
        <PageHeader
          title="Chord finder"
          actions={
            <>
              <TextField
                ref={nameField}
                className={styles.name}
                placeholder="collection name"
                aria-label="collection name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setStatus(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
              <Button variant="primary" onClick={save}>
                Save
              </Button>
              <StatusText status={status} />
            </>
          }
        />
      }
    >
      <SplitPane
        mobile="stacked"
        minAside={ASIDE_MIN}
        main={
          <div className={styles.main}>
            <div className={styles.grid}>
              <PadGrid
                cells={cells}
                onPadClick={clickPad}
                size="large"
                free
                hoverDegrees={state.lockPc !== null}
                full={isFull(state)}
                label="pad grid"
              />
            </div>
            <FinderResult state={state} dispatch={dispatch} hint={hint} />
          </div>
        }
        aside={
          <div className={styles.aside}>
            <CollectionStrip state={state} dispatch={dispatch} />
          </div>
        }
      />
    </PageLayout>
  );
}
