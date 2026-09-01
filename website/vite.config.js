import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        en: resolve(root, "en/index.html"),
        "zh-tw": resolve(root, "zh-tw/index.html"),
        download: resolve(root, "download/index.html"),
      },
    },
  },
});
