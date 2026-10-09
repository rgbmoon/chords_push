/** Страница-сообщение: загрузка, «нет такого», ошибка хранилища. */
import { Link } from "react-router-dom";
import { Header, PageStyle, useTitle } from "../components/Frame";
import { APP_CSS_HOME } from "../styles/app";
import { HOME_CSS } from "../styles/css";

export function Message({
  title,
  text,
  loading = false,
  back = "/",
  backText = "home",
}: {
  title: string;
  text: string;
  loading?: boolean;
  back?: string;
  backText?: string;
}) {
  useTitle(title);
  return (
    <>
      <PageStyle css={HOME_CSS + APP_CSS_HOME} />
      <Header title={title} />
      <div className="wrap">
        {loading ? null : (
          <div className="empty">
            {text} <Link to={back}>{backText}</Link>
          </div>
        )}
      </div>
    </>
  );
}

export function NotFound() {
  return <Message title="Page not found" text="The link is wrong or outdated." />;
}
