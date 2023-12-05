import { promises as fs } from "fs";
import path from "path";
import type * as estree from "estree";
import type { Plugin, Rollup } from "vite";
import { isAssetFile, isGlobalCSSFile } from "../utils/file-types";
import { decodeFileName, encodeFileName } from "../utils/filename-encoding";
import { type FlagSet, compareFlaggedObject, hasFlags } from "../utils/flags";
import { indexToId } from "../utils/index-to-id";
import {
  type DocManifest,
  generatManifest,
  generateHTML,
} from "../utils/manifest";
import { getMatches, type Matches } from "../utils/matches";
import { type InternalPluginOptions } from "../utils/options";
import { prepareArcEntryHTML } from "../utils/prepare-arc-entry-html";
import { stripEntryScript } from "../utils/strip-entry-script";

interface ProxyMeta {
  resolved: Rollup.ResolvedId;
  matches: Matches;
}

const arcPrefix = "\0arc-";
const arcJsSuffix = ".mjs";
const arcInitPrefix = `${arcPrefix}init:`;
const arcProxyPrefix = `${arcPrefix}proxy:`;
const arcChunkFileNameReg = /(.+)\.arc(?:\.(.+))?\.html$/;
export function pluginBuildWeb({
  runtimeId,
  flagSets,
  store,
}: InternalPluginOptions): Plugin[] {
  const apply: Plugin["apply"] = (config, { command }) =>
    command === "build" && !config.build?.ssr;
  let globalIds = new Map<string, string>();
  let metaForProxy = new Map<string, ProxyMeta>();
  let adaptiveImporters = new Map<string, Map<string, string>>();
  let bindingsByAdaptiveId = new Map<string, Set<string> | true>();
  let metaForAdaptiveChunk = new Map<
    string,
    {
      entryId: string;
      adaptiveImports: Map<string, string>;
    }
  >();
  let proxyModuleId = 0;
  let initModuleId = 0;
  let basePath = "/";
  let resolveAssetURL: (fileName: string, from: string) => string = (
    fileName: string,
  ) => basePath + fileName;
  return [
    {
      name: "arc-vite:build-web",
      enforce: "pre",
      apply,
      configResolved(config) {
        basePath = config.base;
        const { renderBuiltUrl: originalRenderBuiltURL } = config.experimental;
        if (originalRenderBuiltURL) {
          resolveAssetURL = (fileName, from) => {
            const url = originalRenderBuiltURL(fileName, {
              ssr: false,
              type: "asset",
              hostId: from,
              hostType: "html",
            });
            if (typeof url !== "string") {
              throw new Error(
                `renderBuiltURL must return a string for html assets`,
              );
            }

            return url;
          };
        }
      },
      closeBundle() {
        proxyModuleId = initModuleId = 0;
        globalIds = new Map();
        adaptiveImporters = new Map();
        bindingsByAdaptiveId = new Map();
        metaForAdaptiveChunk = new Map();
        metaForProxy = new Map();
      },
      async resolveId(source, importer, options) {
        if (importer) {
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
              const adaptiveImportsForImporter =
                adaptiveImporters.get(importer);
              if (adaptiveImportsForImporter) {
                adaptiveImportsForImporter.set(source, id);
              } else {
                adaptiveImporters.set(importer, new Map([[source, id]]));
              }

              const proxyId = nextProxyId();
              metaForProxy.set(proxyId, { resolved, matches });
              return proxyId;
            }
          }

          return resolved;
        } else if (metaForAdaptiveChunk.has(source)) {
          return source;
        } else if (options.isEntry && !isArcId(source)) {
          const resolved = await this.resolve(source, importer, {
            ...options,
            skipSelf: true,
          });

          if (resolved) {
            const importsForEntry = new Set<string>();
            const adaptiveImportsForEntry: string[] = [];
            const scanImports = async (
              childId: string,
              seenImports: Set<string>,
              adaptiveImports: string[],
            ) => {
              if (seenImports.has(childId)) return;
              seenImports.add(childId);

              if (isArcProxyId(childId)) {
                adaptiveImports.push(childId);
              } else {
                const info = await this.load({
                  id: childId,
                  resolveDependencies: true,
                });

                if (info) {
                  await Promise.all(
                    info.importedIdResolutions.map(
                      (resolvedChild) =>
                        !resolvedChild.external &&
                        scanImports(
                          resolvedChild.id,
                          seenImports,
                          adaptiveImports,
                        ),
                    ),
                  );
                }
              }
            };

            await scanImports(
              resolved.id,
              importsForEntry,
              adaptiveImportsForEntry,
            );

            const flagSetChunkIds = await Promise.all(
              flagSets.map(async (flagSet) => {
                const importsForFlagSet = new Set(importsForEntry);
                const resolvedAdaptiveImports = new Map<string, string>();
                let pendingAdaptiveImports = adaptiveImportsForEntry;

                while (pendingAdaptiveImports.length) {
                  const pending = pendingAdaptiveImports;
                  pendingAdaptiveImports = [];
                  await Promise.all(
                    pending.map(async (adaptiveImport) => {
                      const { matches } = metaForProxy.get(adaptiveImport)!;
                      let adaptedImport: string;
                      for (const { flags, value } of matches.alternates) {
                        if (hasFlags(flagSet, flags)) {
                          adaptedImport = value;
                          break;
                        }
                      }

                      adaptedImport ||= matches.default;
                      resolvedAdaptiveImports.set(
                        adaptiveImport,
                        adaptedImport,
                      );
                      await scanImports(
                        adaptedImport,
                        importsForFlagSet,
                        pendingAdaptiveImports,
                      );
                    }),
                  );
                }

                const id = `${resolved.id.replace(/\.[^.]+$/, "")}.arc${
                  flagSet.length ? `.${flagSet.join(".")}` : ""
                }.html`;

                metaForAdaptiveChunk.set(id, {
                  entryId: resolved.id,
                  adaptiveImports: resolvedAdaptiveImports,
                });
                return id;
              }),
            );

            for (const [
              importer,
              resolvedAdaptiveImports,
            ] of adaptiveImporters) {
              const ast = (this.getModuleInfo(importer)?.ast ||
                (await this.load({ id: importer }))
                  .ast) as unknown as estree.Program;

              for (const child of ast.body) {
                if (child.type === "ImportDeclaration") {
                  const id = resolvedAdaptiveImports.get(
                    child.source.value as string,
                  );
                  if (!id) continue;

                  let bindings = bindingsByAdaptiveId.get(id);
                  if (bindings === true) continue;

                  for (const specifier of child.specifiers) {
                    switch (specifier.type) {
                      case "ImportNamespaceSpecifier":
                        bindingsByAdaptiveId.set(id, true);
                        continue;
                      case "ImportDefaultSpecifier":
                        if (bindings) {
                          bindings.add("default");
                        } else {
                          bindings = new Set(["default"]);
                          bindingsByAdaptiveId.set(id, bindings);
                        }
                        break;
                      case "ImportSpecifier":
                        if (bindings) {
                          bindings.add(specifier.imported.name);
                        } else {
                          bindings = new Set([specifier.imported.name]);
                          bindingsByAdaptiveId.set(id, bindings);
                        }
                        break;
                    }
                  }
                }
              }
            }

            for (const id of flagSetChunkIds) {
              this.emitFile({
                type: "chunk",
                id,
              });
            }
          }

          return resolved;
        }

        return null;
      },

      async load(id) {
        const adaptiveChunkMeta = metaForAdaptiveChunk.get(id);

        if (adaptiveChunkMeta) {
          let code = "";
          const adaptiveImports = [...adaptiveChunkMeta.adaptiveImports];
          for (let i = adaptiveImports.length; i--; ) {
            const [adaptiveImport, adaptedImport] = adaptiveImports[i];
            code += `import ${JSON.stringify(
              encodeArcInitId(adaptiveImport, adaptedImport),
            )};\n`;
          }

          code = generateHTML(code);

          return {
            code,
            moduleSideEffects: "no-treeshake",
          };
        } else if (isArcProxyId(id)) {
          const { resolved } = metaForProxy.get(id)!;
          let code = "";

          if (isGlobalCSSFile(resolved.id)) {
            return { code: "" };
          }

          let hasNamedExports = false;
          let hasDefaultExport = false;
          let syntheticNamedExports: boolean | string = false;

          if (isAssetFile(resolved.id)) {
            hasDefaultExport = true;
          } else {
            let info = this.getModuleInfo(resolved.id);
            if (!info?.ast) {
              info = await this.load(resolved);
            }

            if (info.exports) {
              hasDefaultExport = info.hasDefaultExport === true;
              hasNamedExports =
                info.exports.length >= (hasDefaultExport ? 2 : 1);
            }
          }

          if (hasNamedExports || hasDefaultExport) {
            const arcId = getArcId(id);
            if (hasNamedExports) {
              code += `export const {${arcId}} = ${runtimeId};\n`;
              syntheticNamedExports = arcId;

              if (hasDefaultExport) {
                code += `export default ${arcId}.default;\n`;
              }
            } else {
              code += `export default ${runtimeId}.${arcId}.default;\n`;
            }
          } else {
            code = "export {};\n";
          }

          return {
            code,
            syntheticNamedExports,
            moduleSideEffects: false,
          };
        } else if (isArcInitId(id)) {
          const [adaptiveImport, adaptedImport] = decodeArcInitId(id);
          const bindings = bindingsByAdaptiveId.get(adaptiveImport);
          if (!bindings || isGlobalCSSFile(adaptiveImport)) {
            return {
              code: `import ${JSON.stringify(adaptedImport)};\n`,
              moduleSideEffects: "no-treeshake",
            };
          }

          const arcId = getArcId(adaptiveImport);
          return {
            code: `import * as _${arcId} from ${JSON.stringify(
              adaptedImport,
            )}\n${runtimeId}.${arcId}=${
              bindings === true
                ? `_${arcId}`
                : `{${Array.from(
                    bindings,
                    (binding) =>
                      `${JSON.stringify(binding)}:_${arcId}[${JSON.stringify(
                        binding,
                      )}]`,
                  ).join(",")}}`
            };\n`,
            moduleSideEffects: "no-treeshake",
          };
        }

        return null;
      },
      transformIndexHtml(html, { chunk, bundle }) {
        if (!bundle) return;
        const moduleId = chunk?.facadeModuleId;
        if (!moduleId) return;
        const adaptiveChunkMeta = metaForAdaptiveChunk.get(moduleId);

        if (adaptiveChunkMeta) {
          const { entryId } = adaptiveChunkMeta;
          for (const curFile in bundle) {
            const curChunk = bundle[curFile];
            if (
              curChunk.type === "chunk" &&
              curChunk.isEntry &&
              curChunk.facadeModuleId === entryId
            ) {
              return prepareArcEntryHTML(
                runtimeId,
                html,
                (fileName: string) => resolveAssetURL(fileName, entryId),
                curChunk,
                chunk,
              );
            }
          }

          return;
        }

        return stripEntryScript(
          resolveAssetURL(chunk.fileName, moduleId),
          html,
        );
      },
    },
    {
      name: "arc-vite:build-web:post",
      enforce: "post",
      apply,
      async generateBundle(_, bundle, isWrite) {
        if (!isWrite) {
          this.error(
            "arc-vite: generateBundle cannot be called with isWrite=false",
          );
        }

        const { serverEntryFiles } = await store.read().catch((): never => {
          this.error(
            "arc-vite: failed to read manifest code. This likely means that the server bundle was not created before browser bundle.",
          );
        });

        const flaggedManifestByEntry = new Map<
          string,
          {
            flags: FlagSet;
            manifest: DocManifest;
          }[]
        >();

        for (const fileName in bundle) {
          const chunk = bundle[fileName];
          if (chunk.type === "asset") {
            const arcHTMLChunkMatch = arcChunkFileNameReg.exec(chunk.fileName);
            if (!arcHTMLChunkMatch) continue;
            delete bundle[fileName];
            const [, entryName, flagSetStr] = arcHTMLChunkMatch;
            const flaggedManifest = {
              flags: (flagSetStr ? flagSetStr.split(".") : []) as FlagSet,
              manifest: generatManifest(basePath, chunk.source.toString()),
            };
            const flaggedAssetsForEntry = flaggedManifestByEntry.get(entryName);
            if (flaggedAssetsForEntry) {
              flaggedAssetsForEntry.push(flaggedManifest);
              flaggedManifestByEntry.set(entryName, flaggedAssetsForEntry);
            } else {
              flaggedManifestByEntry.set(entryName, [flaggedManifest]);
            }
          }
        }

        let manifestCode = `;function __ARC_ASSETS__(entry) {const f = __ARC_FLAGS__() || {};switch(entry) {`;
        for (const [
          entryName,
          flaggedAssetsForEntry,
        ] of flaggedManifestByEntry) {
          const defaultFlaggedAssets = flaggedAssetsForEntry
            .sort(compareFlaggedObject)
            .pop()!;
          let matchCodeSep = "";

          manifestCode += `case ${JSON.stringify(entryName)}:return `;
          for (const { flags, manifest } of flaggedAssetsForEntry) {
            manifestCode +=
              matchCodeSep +
              flags.map((flag) => `f.${flag}`).join("&&") +
              "?" +
              JSON.stringify(manifest);
            matchCodeSep = ":";
          }

          manifestCode += `:${JSON.stringify(defaultFlaggedAssets.manifest)};`;
        }

        manifestCode += `}return {"head": ["<script>console.error('Unable to load adaptive arc files, unknown entry was provided when asking for assets.')</script>"]}};\n`;

        await Promise.all(
          serverEntryFiles.map((file) => fs.appendFile(file, manifestCode)),
        );
      },
    },
  ];

  function nextProxyId() {
    return arcProxyPrefix + (proxyModuleId++).toString(36) + arcJsSuffix;
  }

  function encodeArcInitId(adaptiveImport: string, adaptedImport: string) {
    return `${arcInitPrefix + (initModuleId++).toString(36)}:${
      (adaptiveImport === adaptedImport
        ? encodeFileName(adaptiveImport)
        : `${encodeFileName(adaptiveImport)},${encodeFileName(
            adaptedImport[0] === "\0"
              ? adaptedImport
              : path.relative(path.dirname(adaptiveImport), adaptedImport),
          )}`) + arcJsSuffix
    }`;
  }

  function getArcId(source: string) {
    let id = globalIds.get(source);
    if (id === undefined) {
      id = indexToId(globalIds.size);
      globalIds.set(source, id);
    }

    return id;
  }
}

function isArcId(id: string) {
  return id.startsWith(arcPrefix);
}

function isArcProxyId(id: string) {
  return id.startsWith(arcProxyPrefix);
}

function isArcInitId(id: string) {
  return id.startsWith(arcInitPrefix);
}

function decodeArcInitId(id: string) {
  const prefixEnd = id.indexOf(":", arcInitPrefix.length + 1) + 1;
  const sepStart = id.indexOf(",", prefixEnd);
  if (sepStart === -1) {
    const adaptedImport = decodeFileName(
      id.slice(prefixEnd, -arcJsSuffix.length),
    );
    return [adaptedImport, adaptedImport];
  }

  const adaptiveImport = decodeFileName(id.slice(prefixEnd, sepStart));
  const relativeAdaptedImport = decodeFileName(
    id.slice(sepStart + 1, -arcJsSuffix.length),
  );
  const adaptedImport =
    relativeAdaptedImport[0] === "\0"
      ? relativeAdaptedImport
      : path.join(adaptiveImport, "..", relativeAdaptedImport);
  return [adaptiveImport, adaptedImport];
}
