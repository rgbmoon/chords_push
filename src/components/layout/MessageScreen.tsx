import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { EmptyState } from "../ui";
import { PageHeader } from "./PageHeader";
import { PageContent, PageLayout } from "./PageLayout";

interface MessageScreenProps {
  title: string;
  text?: string;
  link?: { to: string; label: string };
}

/** Экран-сообщение: загрузка, «нет такого», ошибка хранилища. */
export function MessageScreen({ title, text, link = { to: "/", label: "home" } }: MessageScreenProps) {
  useDocumentTitle(title);
  return (
    <PageLayout header={<PageHeader title={title} />}>
      <PageContent>
        {text && (
          <EmptyState>
            {text} <Link to={link.to}>{link.label}</Link>
          </EmptyState>
        )}
      </PageContent>
    </PageLayout>
  );
}
