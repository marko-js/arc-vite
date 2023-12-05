import markoVite from "@marko/vite";
import { defineConfig } from "vite";
import arcVite from "../../..";
export default () =>
  defineConfig({
    plugins: [
      arcVite({
        flags: ["mobile"],
      }),
      markoVite(),
    ],
    build: {
      modulePreload: false,
      minify: false,
      target: "esnext",
      emptyOutDir: false,
    },
  });
