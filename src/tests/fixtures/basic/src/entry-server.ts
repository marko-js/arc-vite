import arc from "arc-server";
import { promises as fs } from "fs";
import type { IncomingMessage } from "http";
import path from "path";
import url from "url";

import renderApp from "./entry-web";

const dirname = path.join(url.fileURLToPath(import.meta.url), "..");
const html = await fs.readFile(path.join(dirname, "../index.html"), "utf-8");

export function render(req: IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  if (url.pathname !== "/") return;

  return arc.withFlags({ mobile: url.searchParams.has("mobile") }, () => {
    const assets = arc.getAssets("index");
    return html
      .replace("<!-- app -->", renderApp())
      .replace("<head>", `<head>${assets["head-prepend"] || ""}`)
      .replace("</head>", `</head>${assets["head"] || ""}`)
      .replace("<body>", `<body>${assets["body-prepend"] || ""}`)
      .replace("</body>", `</body>${assets["body"] || ""}`);
  });
}
