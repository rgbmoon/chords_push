/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  css: {
    modules: { localsConvention: "camelCaseOnly" },
    preprocessorOptions: {
      // токены и миксины доступны в любом модуле: @use "tokens" as *;
      scss: { loadPaths: [fileURLToPath(new URL("./src/styles", import.meta.url))] },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
