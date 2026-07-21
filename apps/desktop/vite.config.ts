import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  base: "./",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/renderer", import.meta.url)),
    emptyOutDir: true
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}", "../main/**/*.test.{ts,tsx}"],
    setupFiles: [
      fileURLToPath(new URL("./src/renderer/test-setup.ts", import.meta.url))
    ]
  }
});
