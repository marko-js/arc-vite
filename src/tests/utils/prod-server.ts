import path from "node:path";
import http, { type IncomingMessage } from "node:http";
import events from "node:events";
import { promises as fs } from "node:fs";
import * as vite from "vite";
import serve from "serve-handler";

export async function createProdServer(fixtureDir: string) {
  const { default: getConfig } = (await import(`${fixtureDir}/config.ts`)) as {
    default: () => vite.UserConfig;
  };
  const dist = path.join(fixtureDir, "dist");
  const config = getConfig();

  await vite.build(
    vite.mergeConfig(config, {
      root: fixtureDir,
      logLevel: "error",
      configFile: false,
      build: {
        ssr: path.join(fixtureDir, "src/entry-server.ts"),
      },
    }),
  );

  await vite.build(
    vite.mergeConfig(config, {
      root: fixtureDir,
      logLevel: "error",
      configFile: false,
    }),
  );

  const { render } = (await import(path.join(dist, "entry-server.js"))) as {
    render(html: string, req: IncomingMessage): string;
  };
  const html = await fs.readFile(path.join(dist, "index.html"), "utf8");

  return {
    async listen(port: number) {
      const server = http
        .createServer((req, res) => {
          const result = render(html, req);
          if (result) {
            res.statusCode = 200;
            res.end(result);
            return;
          }

          serve(req, res, { public: dist });
        })
        .listen(port);
      await events.once(server, "listening");
      return () =>
        new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
    },
  };
}
