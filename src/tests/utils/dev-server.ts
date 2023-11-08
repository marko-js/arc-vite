import path from "node:path";
import events from "node:events";
import { promises as fs } from "node:fs";
import type { IncomingMessage } from "node:http";
import * as vite from "vite";

export async function createDevServer(fixtureDir: string) {
  const [html, devServer] = await Promise.all([
    fs.readFile(path.join(fixtureDir, "index.html"), "utf8"),
    import(`${fixtureDir}/config.ts`).then(
      ({ default: getConfig }: { default: () => vite.UserConfig }) =>
        vite.createServer(
          vite.mergeConfig(getConfig(), {
            root: fixtureDir,
            appType: "custom",
            configFile: false,
            server: {
              middlewareMode: true,
            },
          }),
        ),
    ),
  ]);

  const app = devServer.middlewares.use(async (req, res, next) => {
    try {
      const { render } = (await devServer.ssrLoadModule(
        "./src/entry-server.ts",
      )) as {
        render(html: string, req: IncomingMessage): string;
      };
      const result = render(html, req);
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
