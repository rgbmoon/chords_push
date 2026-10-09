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
  backText = "на главную",
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
  return <Message title="Нет такой страницы" text="Ссылка неверная или устарела." />;
}
