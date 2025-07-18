import path from "path";
import type { Plugin, Rollup } from "vite";

import { isAssetFile, isGlobalCSSFile } from "../utils/file-types";
import { indexToId } from "../utils/index-to-id";
import { clearCache, getMatches, type Matches } from "../utils/matches";
import type { InternalPluginOptions } from "../utils/options";
import { toPosix } from "../utils/to-posix";
interface ProxyMeta {
  resolved: Rollup.ResolvedId;
  matches: Matches;
}

const virtualArcServerModuleId = "\0arc-server-virtual";
const arcPrefix = "\0arc-";
const arcJsSuffix = ".mjs";
const arcProxyPrefix = `${arcPrefix}proxy:`;

// TODO: with some tweaks this plugin might work in a test env.

export function pluginBuildSSR({
  store,
  flagSets,
  forceFlagSet,
}: InternalPluginOptions): Plugin {
  let root: string;
  let proxyModuleId = 0;
  let metaForProxy = new Map<string, ProxyMeta>();
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
          return source;
        }

        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved && !resolved.external) {
          const { id } = resolved;
          const matches = getMatches(id, flagSets);
          if (matches) {
            const proxyId = nextProxyId();
            metaForProxy.set(proxyId, { resolved, matches });
            return proxyId;
          }
        }

        return resolved;
      }

      return null;
    },
    async load(id) {
      if (id === virtualArcServerModuleId) {
        return {
          code: `import arc from "arc-server";
globalThis.__ARC_FLAGS__ = arc.getFlags;
${
  forceFlagSet
    ? `const forcedFlags = {${forceFlagSet.map(
        (name) => `${JSON.stringify(name)}:true`,
      )}};
export default { getAssets, getFlags: arc.getFlags, setFlags: () => arc.setFlags(forcedFlags), withFlags: (_, fn) => arc.withFlags(forcedFlags, fn) };`
    : "export default { getAssets, getFlags: arc.getFlags, setFlags: arc.setFlags, withFlags: arc.withFlags };"
}
function getAssets(entry, { base = import.meta.env.BASE_URL, injectAttrs = "" } = {}) {
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
          syntheticNamedExports: true,
        };
      }

      if (isArcProxyId(id)) {
        const { resolved, matches } = metaForProxy.get(id)!;
        let code = "";

        if (isGlobalCSSFile(resolved.id)) {
          for (const { value } of matches.alternates) {
            code += `import ${JSON.stringify(value)};\n`;
          }

          code += `import ${JSON.stringify(matches.default)};\n`;

          return {
            code,
            moduleSideEffects: "no-treeshake",
          };
        }

        let matchCode = "";
        let matchCodeSep = "";
        let i = 0;

        for (const { flags, value } of matches.alternates) {
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
          matches.default,
        )};\n`;
        matchCode += `:${defaultId}`;

        let syntheticNamedExports: string | boolean = false;
        let hasNamedExports = false;
        let hasDefaultExport = false;

        if (isAssetFile(resolved.id)) {
          hasDefaultExport = true;
        } else {
          let info = this.getModuleInfo(resolved.id);
          if (!info?.ast) {
            info = await this.load(resolved);
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
      }

      return null;
    },
    closeBundle() {
      clearCache();
      proxyModuleId = 0;
      metaForProxy = new Map();
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

  function nextProxyId() {
    return arcProxyPrefix + (proxyModuleId++).toString(36) + arcJsSuffix;
  }
}

function isArcId(id: string) {
  return id.startsWith(arcPrefix);
}

function isArcProxyId(id: string) {
  return id.startsWith(arcProxyPrefix);
}
