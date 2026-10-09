import type { ReactNode } from "react";
import { MessageScreen, PageContent, PageHeader, PageLayout } from "../../components/layout";
import { ButtonLink } from "../../components/ui";
import { ChartEditor } from "../../features/chartEditor/ChartEditor";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { ChartTiles } from "./components/ChartTiles";
import { CollectionTiles } from "./components/CollectionTiles";
import { StoragePanel } from "./components/StoragePanel";
import styles from "./HomePage.module.scss";
import { useLibrary } from "./hooks/useLibrary";

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>
        {title} {count !== undefined && <span className={styles.count}>{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function HomePage() {
  useDocumentTitle("Chords on Push");
  const library = useLibrary();
  if (library.status === "error") return <MessageScreen title="Couldn't open storage" text={library.error.message} />;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Chords on Push"
          back={null}
          sticky
          actions={
            <ButtonLink to="/finder" size="small">
              + new collection
            </ButtonLink>
          }
        />
      }
    >
      <PageContent>
        <Section title="New chart">
          <ChartEditor />
        </Section>
        {library.status === "ready" && (
          <>
            <Section title="Charts" count={library.data.charts.length}>
              <ChartTiles charts={library.data.charts} onDelete={library.removeChart} />
            </Section>
            <Section title="Collections" count={library.data.collections.length}>
              <CollectionTiles collections={library.data.collections} onDelete={library.removeCollection} />
            </Section>
          </>
        )}
        <Section title="Storage">
          <StoragePanel onImported={library.reload} />
        </Section>
      </PageContent>
    </PageLayout>
  );
}
