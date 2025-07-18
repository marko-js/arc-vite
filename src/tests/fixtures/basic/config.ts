import { defineConfig } from "vite";

import arcVite from "../../..";
export default () =>
  defineConfig({
    plugins: [
      arcVite({
        flags: ["mobile"],
      }),
    ],
    build: {
      modulePreload: false,
      minify: false,
      target: "esnext",
      emptyOutDir: false,
    },
  });
