import path from "path";
import type { Plugin } from "vite";
import { getArcFS } from "../utils/arc-fs";
import { ensureArcPluginIsFirst } from "../utils/ensure-arc-plugin-is-first";
import { decodeFileName, encodeFileName } from "../utils/filename-encoding";
import { indexToId } from "../utils/index-to-id";
import { isCssFile } from "../utils/is-css-file";
import { type Matches, clearCache } from "../utils/matches";
import { type InternalPluginOptions } from "../utils/options";
import { toPosix } from "../utils/to-posix";
import {
  decodeArcVirtualMatch,
  getVirtualMatches,
  isArcVirtualMatch,
} from "../utils/virtual-matches";

const virtualArcServerModuleId = "\0arc-server-virtual";
const arcPrefix = "\0arc-";
const arcSuffix = ".mjs";
const arcProxyPrefix = `${arcPrefix}proxy:`;

// TODO: with some tweaks this plugin might work in a test env.

export function pluginBuildSSR({
  store,
  flagSets,
  forceFlagSet,
}: InternalPluginOptions): Plugin {
  const adaptiveMatchesForId = new Map<string, Matches>();
  let root: string;
  return {
    name: "arc-vite:build-ssr",
    enforce: "pre",
    api: {
      getMarkoAssetCodeForEntry(id: string) {
        return `__ARC_ASSETS__(${JSON.stringify(
          toPosix(path.relative(root, id)),
        )})`;
      },
    },
    apply(config, { command }) {
      return command === "build" && !!config.build?.ssr;
    },
    config(config) {
      ensureArcPluginIsFirst(config.plugins!);
    },
    configResolved(config) {
      root = config.root;
    },
    async resolveId(source, importer, options) {
      if (importer) {
        switch (source) {
          case "arc-server":
            return importer === virtualArcServerModuleId
              ? this.resolve(source, undefined, options)
              : { id: virtualArcServerModuleId };
          case "arc-server/proxy":
            return null;
        }

        if (isArcId(source)) {
          return source;
        }

        if (isArcId(importer)) {
          if (isArcVirtualMatch(importer)) {
            return this.resolve(
              source,
              this.getModuleInfo(importer)?.meta.arcSourceId,
              options,
            );
          }

          return source;
        }

        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved && !resolved.external) {
          const matches = await getVirtualMatches(this, flagSets, resolved);
          if (matches) {
            const { id } = resolved;
            if (!this.getModuleInfo(id)?.ast) {
              await this.load(resolved);
            }

            adaptiveMatchesForId.set(id, matches);
            return { id: encodeArcProxyId(id) };
          }
        }

        return resolved;
      }

      return null;
    },
    async load(id) {
      if (id === virtualArcServerModuleId) {
        return {
          code: `import * as arc from "arc-server";\nexport * from "arc-server";
globalThis.__ARC_FLAGS__ = arc.getFlags;
${
  forceFlagSet
    ? `const forcedFlags = {${forceFlagSet.map(
        (name) => `${JSON.stringify(name)}:true`,
      )}};
export function setFlags() { return arc.setFlags(forcedFlags); }
export function withFlags(_, fn) { return arc.withFlags(forcedFlags, fn); }`
    : ""
}
export function getAssets(entry, { base = import.meta.env.BASE_URL, injectAttrs = "" } = {}) {
  const manifest = __ARC_ASSETS__(entry);
  return {
    "head-prepend": partsToString(manifest["head-prepend"], base, injectAttrs),
    head: partsToString(manifest["head"], base, injectAttrs),
    "body-prepend": partsToString(manifest["body-prepend"], base, injectAttrs),
    body: partsToString(manifest["body"], base, injectAttrs)
  };
};\n
function partsToString(parts, base, injectAttrs) {
  if (!parts) return;
  let html = "";
  for (const part of parts) {
    html += part === 0 ? injectAttrs : part === 1 ? base : part;
  }
  return html;
}\n`,
          moduleSideEffects: true,
        };
      }

      if (isArcProxyId(id)) {
        id = decodeArcProxyId(id);
        const adaptiveMatches = adaptiveMatchesForId.get(id);
        if (adaptiveMatches) {
          if (isCssFile(id)) {
            let code = "";
            for (const { value } of adaptiveMatches.alternates) {
              code += `import ${JSON.stringify(value)};\n`;
            }

            code += `import ${JSON.stringify(adaptiveMatches.default)};\n`;

            return {
              code,
              moduleSideEffects: "no-treeshake",
            };
          }

          const info = this.getModuleInfo(id);
          if (info) {
            let code = "";
            let matchCode = "";
            let matchCodeSep = "";
            let i = 0;

            for (const { flags, value } of adaptiveMatches.alternates) {
              const adaptedImportId = `_${indexToId(i++)}`;
              code += `import * as ${adaptedImportId} from ${JSON.stringify(
                value,
              )};\n`;

              matchCode +=
                matchCodeSep +
                flags.map((flag) => `f.${flag}`).join("&&") +
                "?" +
                adaptedImportId;

              matchCodeSep = ":";
            }

            const defaultId = `_${indexToId(i)}`;
            code += `import * as ${defaultId} from ${JSON.stringify(
              adaptiveMatches.default,
            )};\n`;
            matchCode += `:${defaultId}`;

            let syntheticNamedExports: string | boolean = false;
            if (info.exports?.length) {
              const hasNamedExports =
                info.exports.length >= (info.hasDefaultExport ? 2 : 1);

              if (hasNamedExports || info.hasDefaultExport) {
                const proxyCode = `/*@__PURE__*/createAdaptiveProxy({default:${defaultId},match(f){return ${matchCode}}})`;
                code += `import createAdaptiveProxy from "arc-server/proxy";\n`;

                if (hasNamedExports) {
                  syntheticNamedExports = "_";
                  code += `export const _ = ${proxyCode};\n`;

                  if (info.hasDefaultExport) {
                    code += "export default _.default;\n";
                  }
                } else {
                  code += `export default ${proxyCode}.default;\n`;
                }
              }
            } else {
              code += "export {};\n";
            }

            return {
              code,
              syntheticNamedExports,
              moduleSideEffects: "no-treeshake",
            };
          }
        }
      } else if (isArcVirtualMatch(id)) {
        const [arcSourceId, arcFlagSet] = decodeArcVirtualMatch(id);
        const { meta, moduleSideEffects, syntheticNamedExports } =
          this.getModuleInfo(arcSourceId)!;
        const code = meta.arcSourceCode as string;
        const arcFS = getArcFS(arcFlagSet);
        return {
          code,
          moduleSideEffects,
          syntheticNamedExports,
          meta: {
            ...meta,
            arcSourceId,
            arcFlagSet,
            arcFS,
          },
        };
      }

      return null;
    },
    buildEnd() {
      clearCache();
      adaptiveMatchesForId.clear();
    },
    generateBundle(outputOptions, bundle, isWrite) {
      if (!isWrite) {
        this.error("arc-vite-build-ssr requires write=true");
      }

      const serverEntryFiles: string[] = [];
      const cwd = process.cwd();
      const dir = outputOptions.dir
        ? path.resolve(outputOptions.dir)
        : path.resolve(outputOptions.file!, "..");

      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (
          chunk.type === "chunk" &&
          chunk.isEntry &&
          (chunk.imports.includes("arc-server") ||
            chunk.moduleIds.includes(virtualArcServerModuleId))
        ) {
          serverEntryFiles.push(
            path.relative(cwd, path.resolve(dir, fileName)),
          );
        }
      }

      if (!serverEntryFiles.length) {
        this.error("arc-vite: the server code did not import 'arc-server'");
      }
      store.write({ serverEntryFiles });
    },
  };
}

function isArcId(id: string) {
  return id.startsWith(arcPrefix);
}

function isArcProxyId(id: string) {
  return id.startsWith(arcProxyPrefix);
}

function encodeArcProxyId(id: string) {
  return arcProxyPrefix + encodeFileName(id) + arcSuffix;
}

function decodeArcProxyId(id: string) {
  return decodeFileName(id.slice(arcProxyPrefix.length, -arcSuffix.length));
}
