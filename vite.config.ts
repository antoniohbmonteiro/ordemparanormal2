import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      fileName: () => "main.js",
      formats: ["es"],
    },
    minify: false,
    outDir: "dist",
    sourcemap: true,
    target: "esnext",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
