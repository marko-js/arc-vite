import { defineConfig } from "vite";
import markoVite from "@marko/vite";
import arcVite from "../../..";
export default () =>
  defineConfig({
    plugins: [
      markoVite(),
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