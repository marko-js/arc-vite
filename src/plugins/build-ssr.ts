import path from "path";
import type { Plugin, Rollup } from "vite";
import { getArcFS } from "../utils/arc-fs";
import { decodeFileName, encodeFileName } from "../utils/filename-encoding";
import { indexToId } from "../utils/index-to-id";
import {
  isAssetFile,
  isBuiltInFile,
  isGlobalCSSFile,
} from "../utils/file-types";
import { type Matches, clearCache, getMatches } from "../utils/matches";
import { type InternalPluginOptions } from "../utils/options";
import { toPosix } from "../utils/to-posix";
import {
  decodeArcVirtualMatch,
  getVirtualMatches,
  isArcVirtualMatch,
  shouldCheckVirtualMatch,
} from "../utils/virtual-matches";

const virtualArcServerModuleId = "\0arc-server-virtual";
const arcPrefix = "\0arc-";
const arcSuffix = ".mjs";
const arcProxyPrefix = `${arcPrefix}proxy:`;
const arcLazyProxyPrefix = `${arcPrefix}lazy-proxy:`;

type ArcProxyMeta = {
  arcResolved: Rollup.ResolvedId;
  arcMatches: Matches;
};

type ArcLazyProxyMeta = {
  arcResolved: Rollup.ResolvedId;
}

// TODO: with some tweaks this plugin might work in a test env.

export function pluginBuildSSR({
  store,
  flagSets,
  forceFlagSet,
}: InternalPluginOptions): Plugin {
  let root: string;
  let proxyModuleId = 0;
  let lazyProxyModuleId = 0;
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
          const { id } = resolved;
          const matches = getMatches(id, flagSets);

          if (!isBuiltInFile(id)) {
            return {
              id: encodeArcLazyProxyId(),
              meta: {
                arcResolved: resolved,
              } satisfies ArcLazyProxyMeta,
            };
          }

          if (matches) {
            return {
              id: encodeArcProxyId(),
              meta: {
                arcResolved: resolved,
                arcMatches: matches,
              } satisfies ArcProxyMeta,
            };
          }
        }

        return resolved;
      }

      return null;
    },
    async load(rawId) {
      let id = rawId;
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
        const { arcResolved, arcMatches } = (this.getModuleInfo(id)?.meta ||
          {}) as ArcProxyMeta;
        let code = "";

        if (isGlobalCSSFile(arcResolved.id)) {
          for (const { value } of arcMatches!.alternates) {
            code += `import ${JSON.stringify(value)};\n`;
          }

          code += `import ${JSON.stringify(arcMatches!.default)};\n`;

          return {
            code,
            moduleSideEffects: "no-treeshake",
          };
        }

        let matchCode = "";
        let matchCodeSep = "";
        let i = 0;

        for (const { flags, value } of arcMatches.alternates) {
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
          arcMatches.default,
        )};\n`;
        matchCode += `:${defaultId}`;

        let syntheticNamedExports: string | boolean = false;
        let hasNamedExports = false;
        let hasDefaultExport = false;

        if (isAssetFile(arcResolved.id)) {
          hasDefaultExport = true;
        } else {
          let info = this.getModuleInfo(arcResolved.id)!;
          if (!info.ast) {
            info = await this.load(arcResolved);
          }

          if (info.exports) {
            hasDefaultExport = info.hasDefaultExport === true;
            hasNamedExports = info.exports.length >= (hasDefaultExport ? 2 : 1);
          }
        }

        if (hasNamedExports || hasDefaultExport) {
          const proxyCode = `/*@__PURE__*/createAdaptiveProxy({default:${defaultId},match(f){return ${matchCode}}})`;
          code += `import createAdaptiveProxy from "arc-server/proxy";\n`;

          if (hasNamedExports) {
            syntheticNamedExports = "_";
            code += `export const _ = ${proxyCode};\n`;

            if (hasDefaultExport) {
              code += "export default _.default;\n";
            }
          } else {
            code += `export default ${proxyCode}.default;\n`;
          }
        } else {
          code += "export {};\n";
        }

        return {
          code,
          syntheticNamedExports,
          moduleSideEffects: "no-treeshake",
        };
      } else if (isArcLazyProxyId(id)) {
        const { arcResolved } = (this.getModuleInfo(id)?.meta ||
        {}) as ArcLazyProxyMeta;
        // TODO: need to merge arc matches with virtual matches
        // each alternate match needs a virtual match scan, but it probably could be filtered or something?
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
      proxyModuleId = lazyProxyModuleId = 0;
      clearCache();
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

  function encodeArcProxyId() {
    return arcProxyPrefix + proxyModuleId++ + arcSuffix;
  }

  function encodeArcLazyProxyId() {
    return arcProxyPrefix + lazyProxyModuleId++ + arcSuffix;
  }
}

function isArcId(id: string) {
  return id.startsWith(arcPrefix);
}

function isArcProxyId(id: string) {
  return id.startsWith(arcProxyPrefix);
}

function isArcLazyProxyId(id: string) {
  return id.startsWith(arcLazyProxyPrefix);
}

