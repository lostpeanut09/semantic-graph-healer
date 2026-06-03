/* eslint-disable import/no-nodejs-modules */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser", "development"],
    alias: {
      obsidian: fileURLToPath(new URL("./tests/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    server: {
      deps: {
        inline: ["obsidian"],
      },
    },
    setupFiles: ["@vitest/web-worker", "./vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/node_modules_bak/**",
      "**/.kilo/**",
      "**/.agent/**",
      "**/*-docs/**",
    ],
  },
});
