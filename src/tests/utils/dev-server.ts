import events from "node:events";
import type { IncomingMessage } from "node:http";

import * as vite from "vite";

import { getPort } from "./get-port";

export async function createDevServer(fixtureDir: string) {
  const getConfig: () => vite.UserConfig = (
    await import(`${fixtureDir}/config.ts`)
  ).default;
  const devServer = await vite.createServer(
    vite.mergeConfig(getConfig(), {
      root: fixtureDir,
      appType: "custom",
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: await getPort() }, // avoid port conflict by picking a random hmr port
      },
    }),
  );

  const app = devServer.middlewares.use(async (req, res, next) => {
    try {
      const { render } = (await devServer.ssrLoadModule(
        "./src/entry-server.ts",
      )) as {
        render(req: IncomingMessage): string | Promise<string>;
      };
      const result = (await render(req))?.toString();
      if (result) {
        res.statusCode = 200;
        res.end(result);
        return;
      }
    } catch (err) {
      devServer.ssrFixStacktrace(err as Error);
      return next(err);
    }

    return next();
  });

  return {
    async listen(port: number) {
      const server = app.listen(port);
      await events.once(server, "listening");
      return async () => {
        await Promise.all([
          devServer.close(),
          new Promise<void>((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve())),
          ),
        ]);
      };
    },
  };
}
