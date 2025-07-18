import path from "node:path";
import * as t from "node:test";
import url from "node:url";

import { expect } from "@playwright/test";
import type { Page } from "playwright";

import { createDevServer } from "./utils/dev-server";
import { getPage } from "./utils/get-page";
import { createProdServer } from "./utils/prod-server";

const fixture = path.join(
  url.fileURLToPath(import.meta.url),
  "../fixtures/basic",
);

t.test("basic", async (t) => {
  t.beforeEach(() => {
    delete process.env.FLAGS;
  });

  await t.test("dev", async (t) => {
    await t.test("FLAGS=", async (t) => {
      process.env.FLAGS = "";
      const [{ page, port }, server] = await Promise.all([
        getPage(t),
        createDevServer(fixture),
      ]);

      t.after(await server.listen(port));

      await page.goto("/");

      await t.test("has desktop content", async () => {
        await assertHasDesktopContent(page);
      });
    });

    await t.test("FLAGS=mobile", async (t) => {
      process.env.FLAGS = "mobile";
      const [{ page, port }, server] = await Promise.all([
        getPage(t),
        createDevServer(fixture),
      ]);

      t.after(await server.listen(port));

      await page.goto("/");

      await t.test("has mobile content", async () => {
        await assertHasMobileContent(page);
      });
    });
  });

  await t.test("prod", async (t) => {
    const [{ page, port }, server] = await Promise.all([
      getPage(t),
      createProdServer(fixture),
    ]);

    t.after(await server.listen(port));

    await t.test("FLAGS=", async (t) => {
      await page.goto("/");
      await t.test("has desktop content", async () => {
        await assertHasDesktopContent(page);
      });
    });

    await t.test("FLAGS=mobile", async (t) => {
      await page.goto("/?mobile");
      await t.test("has mobile content", async () => {
        await assertHasMobileContent(page);
      });
    });
  });
});

async function assertHasDesktopContent(page: Page) {
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  const heading = page.getByText("a, b");
  await expect(heading).toBeAttached();
  await expect(heading).toHaveCSS("color", "rgb(0, 0, 0)");
}

async function assertHasMobileContent(page: Page) {
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 255, 255)",
  );
  const heading = page.getByText("a[mobile], b[mobile]");
  await expect(heading).toBeAttached();
  await expect(heading).toHaveCSS("color", "rgb(0, 128, 0)");
}
