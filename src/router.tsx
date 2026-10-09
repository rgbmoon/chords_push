import { createBrowserRouter } from "react-router-dom";
import { AnalysisPage } from "./pages/Analysis";
import { FindPage } from "./pages/Find";
import { EditPage, HomePage } from "./pages/Home";
import { NotFound } from "./pages/Message";

export const routes = [
  { path: "/", element: <HomePage /> },
  { path: "/edit/:id", element: <EditPage /> },
  { path: "/a/:id", element: <AnalysisPage /> },
  // один маршрут на «новый» и «сохранённый» подбор: после сохранения адрес
  // меняется, а страница остаётся та же и сетку не сбрасывает
  { path: "/find/:id?", element: <FindPage /> },
  { path: "*", element: <NotFound /> },
];

export const router = createBrowserRouter(routes);
