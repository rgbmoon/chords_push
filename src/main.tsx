import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { APP_CSS } from "./styles/app";
import { baseCss, gridCss } from "./styles/css";

// общий CSS — один раз на всё приложение; страничный вставляет сама страница
const style = document.createElement("style");
style.textContent = baseCss() + gridCss() + APP_CSS;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
