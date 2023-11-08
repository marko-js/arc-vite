import type { IncomingMessage } from "http";
import { getAssets, withFlags } from "arc-server";
import renderApp from "./entry-web";

export function render(html: string, req: IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  if (url.pathname !== "/") return;

  return withFlags({ mobile: url.searchParams.has("mobile") }, () => {
    const assets = getAssets("index");
    return html
      .replace("<!-- app -->", renderApp())
      .replace("<head>", `<head>${assets["head-prepend"] || ""}`)
      .replace("</head>", `</head>${assets["head"] || ""}`)
      .replace("<body>", `<body>${assets["body-prepend"] || ""}`)
      .replace("</body>", `</body>${assets["body"] || ""}`);
  });
}
