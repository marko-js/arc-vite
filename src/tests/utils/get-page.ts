import net from "node:net";
import { after } from "node:test";
import * as playwright from "playwright";

// https://github.com/esbuild-kit/tsx/issues/113
const { toString } = Function.prototype;
Function.prototype.toString = function () {
  return toString.call(this).replace(/\b__name\(([^,]+),[^)]+\)/g, "$1");
};

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

function getPort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server
      .unref()
      .on("error", reject)
      .listen(0, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
  });
}
