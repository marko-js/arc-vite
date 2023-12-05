import { createRequire } from "module";
import path from "path";
import type { Plugin } from "vite";
import { type FlagSet, hasFlags } from "../utils/flags";
import { getMatches } from "../utils/matches";
import { type InternalPluginOptions } from "../utils/options";

// TODO: support forced flagset for build plugins

export function pluginServe({
  flagSets,
  forceFlagSet,
}: InternalPluginOptions): Plugin {
  const flagSet = forceFlagSet?.length ? forceFlagSet : undefined;
  return {
    name: "arc-vite:serve",
    enforce: "pre",
    apply(_, { command }) {
      return command === "serve";
    },
    async config(config) {
      // Stub getAssets for dev mode which does not use it.
      Object.assign(createRequire(import.meta.url)("arc-server"), {
        getAssets() {
          return {};
        },
      });

      if (!flagSet) return;

      config.cacheDir = path.resolve(
        `node_modules/.vite/arc/${flagSet.join(".")}`,
      );
      config.optimizeDeps ??= {};
      config.optimizeDeps.esbuildOptions ??= {};
      config.optimizeDeps.esbuildOptions.plugins ??= [];
      config.optimizeDeps.esbuildOptions.plugins.unshift({
        name: "arc-vite:serve:esbuild",
        setup(build) {
          const arcProxyPrefix = "arc-proxy:";
          build.onResolve(
            { filter: new RegExp(`^${arcProxyPrefix}`) },
            (args) => {
              return {
                path: args.path.slice(arcProxyPrefix.length),
              };
            },
          );
          build.onLoad({ filter: /./ }, (args) => {
            const adaptedImport = getAdaptedMatch(args.path, flagSets, flagSet);
            if (adaptedImport) {
              const proxiedImportCode = JSON.stringify(
                arcProxyPrefix + adaptedImport,
              );
              return {
                loader: "js",
                contents: `module.exports = require(${proxiedImportCode});\n`,
              };
            }
          });
        },
      });
    },
    async resolveId(source, importer, options) {
      if (importer && flagSet) {
        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved) {
          return getAdaptedMatch(resolved.id, flagSets, flagSet) || resolved;
        }
      }

      return null;
    },
  };
}

function getAdaptedMatch(id: string, flagSets: FlagSet[], flagSet: FlagSet) {
  if (path.isAbsolute(id)) {
    const matches = getMatches(id, flagSets);
    if (matches) {
      let adaptedImport: string;

      for (const { flags, value } of matches.alternates) {
        if (hasFlags(flagSet, flags)) {
          adaptedImport = value;
          break;
        }
      }

      adaptedImport ||= matches.default;

      if (adaptedImport !== id) {
        return adaptedImport;
      }
    }
  }
}
