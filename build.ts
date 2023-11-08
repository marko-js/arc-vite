import { build } from "esbuild";

await build({
  outdir: "dist",
  entryPoints: ["src/index.ts"],
  platform: "node",
  target: ["node18"],
  define: {
    "process.env.NODE_ENV": "'production'",
  },
  format: "esm",
  bundle: true,
  splitting: true,
  packages: "external",
});
