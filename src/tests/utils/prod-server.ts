import events from "node:events";
import http, { type IncomingMessage } from "node:http";
import path from "node:path";
import serve from "serve-handler";
import * as vite from "vite";

export async function createProdServer(fixtureDir: string) {
  const getConfig: () => vite.UserConfig = (
    await import(`${fixtureDir}/config.ts`)
  ).default;
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
    render(req: IncomingMessage): string | Promise<string>;
  };

  return {
    async listen(port: number) {
      const server = http
        .createServer(async (req, res) => {
          const result = (await render(req))?.toString();
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
