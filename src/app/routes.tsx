import type { RouteObject } from "react-router-dom";
import { MessageScreen } from "../components/layout";
import { ChartPage } from "../pages/ChartPage/ChartPage";
import { EditChartPage } from "../pages/EditChartPage/EditChartPage";
import { FinderPage } from "../pages/FinderPage/FinderPage";
import { HomePage } from "../pages/HomePage/HomePage";

export const routes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
  { path: "/charts/:id", element: <ChartPage /> },
  { path: "/charts/:id/edit", element: <EditChartPage /> },
  { path: "/finder/:id?", element: <FinderPage /> },
  { path: "*", element: <MessageScreen title="Page not found" text="The link is wrong or outdated." /> },
];
