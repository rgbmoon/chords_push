import { ChangeEvent, useRef, useState } from "react";
import { Button, Status, StatusText } from "../../../components/ui";
import { useStorageInfo } from "../../../hooks/useStorageInfo";
import { exportBackup, importBackup } from "../../../storage";
import { downloadJson } from "../../../utils/download";
import { count, formatDate } from "../../../utils/format";
import styles from "./StoragePanel.module.scss";

const STATUS_TEXT = {
  memory: "Browser storage is unavailable — charts only last until the tab is closed.",
  persisted: "Charts are stored in this browser, permanently.",
  "best-effort": "Charts are stored in this browser. If the disk runs out of space, the browser may clear them.",
  unsupported: "Charts are stored in this browser.",
};

/** Где лежат данные, просьба не чистить их, бэкап. */
export function StoragePanel({ onImported }: { onImported: () => void }) {
  const { mode, persistence, askToPersist } = useStorageInfo();
  const [status, setStatus] = useState<Status | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function exportAll() {
    const backup = await exportBackup();
    downloadJson(backup, `chords-on-push-${formatDate(Date.now())}.json`);
    setStatus({ text: `exported: ${count(backup.charts.length, "chart", "charts")}, ${count(backup.collections.length, "collection", "collections")}` });
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const r = await importBackup(JSON.parse(await file.text()));
      setStatus({ text: `imported: ${r.added} new, ${r.updated} updated, ${r.skipped} skipped` });
      onImported();
    } catch (err) {
      setStatus({ text: `import failed: ${(err as Error).message}`, error: true });
    }
  }

  const text = mode === "memory" ? STATUS_TEXT.memory : STATUS_TEXT[persistence ?? "unsupported"];
  return (
    <>
      <p className={styles.text}>
        {text} There is no server: they won&apos;t be on your other devices — that&apos;s what the backup is for.
      </p>
      <div className={styles.actions}>
        {mode === "indexeddb" && persistence === "best-effort" && <Button onClick={askToPersist}>ask to keep permanently</Button>}
        <Button onClick={exportAll}>export backup</Button>
        <Button onClick={() => fileInput.current?.click()}>import backup</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
        <StatusText status={status} />
      </div>
    </>
  );
}
