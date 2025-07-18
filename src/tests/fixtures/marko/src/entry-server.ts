import { setFlags } from "arc-server";
import type { IncomingMessage } from "http";

import template from "./index.marko";

export function render(req: IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  if (url.pathname !== "/") return;

  setFlags({ mobile: url.searchParams.has("mobile") });
  return template.render({});
}
