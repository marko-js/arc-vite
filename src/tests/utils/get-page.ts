import { after } from "node:test";
import * as playwright from "playwright";
import { getPort } from "./get-port";

export type TestContext = (typeof import("node:test"))["test"] extends (
  fn: (t: infer T) => any,
) => any
  ? T
  : never;

const browser = await playwright.chromium.launch();
after(() => browser.close());

export async function getPage(t: TestContext | typeof import("node:test")) {
  const port = await getPort();
  const page = await browser.newPage({ baseURL: `http://localhost:${port}` });
  t.after(() => page.close());
  return { page, port };
}
