import path from "path";
import { promises as fs } from "fs";
import type * as estree from "estree";
import type { Plugin } from "vite";
import { type InternalPluginOptions } from "../utils/options";
import { type Matches, getMatches } from "../utils/matches";
import { type FlagSet, compareFlaggedObject, hasFlags } from "../utils/flags";
import { indexToId } from "../utils/index-to-id";
import { decodeFileName, encodeFileName } from "../utils/filename-encoding";
import { isCssFile } from "../utils/is-css-file";
import {
  type DocManifest,
  generateDocManifest,
  generateInputDoc,
} from "../utils/manifest";
import { ensureArcPluginIsFirst } from "../utils/ensure-arc-plugin-is-first";

const arcPrefix = "\0arc-";
const arcJsSuffix = ".mjs";
const arcProxyPrefix = `${arcPrefix}proxy:`;
const arcInitPrefix = `${arcPrefix}init:`;
const arcHTMLChunkReg = /(.+)\.arc(?:\.(.+))?\.html$/;

export function pluginBuildWeb({
  runtimeId,
  flagSets,
  store,
}: InternalPluginOptions): Plugin[] {
  const globalIds = new Map<string, string>();
  const adaptiveImporters = new Map<string, Map<string, string>>();
  const adaptiveMatchesForId = new Map<string, Matches>();
  const bindingsByAdaptiveId = new Map<string, Set<string> | true>();
  const resolvedAdaptiveImportsForChunk = new Map<
    string,
    Map<string, string>
  >();
  const apply: Plugin["apply"] = (config, { command }) =>
    command === "build" && !config.build?.ssr;
  let proxyModuleId = 0;
  let initModuleId = 0;
  let basePath = "/";
  return [
    {
      name: "arc-vite:build-web",
      enforce: "pre",
      apply,
      config(config) {
        ensureArcPluginIsFirst(config.plugins!);
      },
      configResolved(config) {
        basePath = config.base;
      },
      closeBundle() {
        proxyModuleId = initModuleId = 0;
        globalIds.clear();
        adaptiveImporters.clear();
        adaptiveMatchesForId.clear();
        bindingsByAdaptiveId.clear();
        resolvedAdaptiveImportsForChunk.clear();
      },
      async resolveId(source, importer, options) {
        if (importer) {
          if (isArcId(source) || isArcId(importer)) {
            return source;
          }

          const resolved = await this.resolve(source, importer, {
            ...options,
            skipSelf: true,
          });
          if (resolved) {
            if (path.isAbsolute(resolved.id)) {
              const matches = getMatches(resolved.id, flagSets);

              if (matches) {
                adaptiveMatchesForId.set(resolved.id, matches);

                const adaptiveImportsForImporter =
                  adaptiveImporters.get(importer);
                if (adaptiveImportsForImporter) {
                  adaptiveImportsForImporter.set(source, resolved.id);
                } else {
                  adaptiveImporters.set(
                    importer,
                    new Map([[source, resolved.id]]),
                  );
                }

                return {
                  id: encodeArcProxyId(resolved.id),
                };
              }
            }
          }

          return resolved;
        } else if (resolvedAdaptiveImportsForChunk.has(source)) {
          return source;
        } else if (options.isEntry) {
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
                adaptiveImports.push(decodeArcProxyId(childId));
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
                      const adaptiveMatches =
                        adaptiveMatchesForId.get(adaptiveImport);

                      if (adaptiveMatches) {
                        let adaptedImport: string;
                        for (const {
                          flags,
                          value,
                        } of adaptiveMatches.alternates) {
                          if (hasFlags(flagSet, flags)) {
                            adaptedImport = value;
                            break;
                          }
                        }

                        adaptedImport ||= adaptiveMatches.default;
                        resolvedAdaptiveImports.set(
                          adaptiveImport,
                          adaptedImport,
                        );
                        await scanImports(
                          adaptedImport,
                          importsForFlagSet,
                          pendingAdaptiveImports,
                        );
                      }
                    }),
                  );
                }

                const id = `${resolved.id.replace(/\.[^.]+$/, "")}.arc${
                  flagSet.length ? `.${flagSet.join(".")}` : ""
                }.html`;

                resolvedAdaptiveImportsForChunk.set(
                  id,
                  resolvedAdaptiveImports,
                );
                return id;
              }),
            );

            for (const [
              importer,
              resolvedAdaptiveImports,
            ] of adaptiveImporters) {
              const info = await this.load({ id: importer });

              for (const child of (info.ast as unknown as estree.Program)
                .body) {
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
        const resolvedAdaptiveImports = resolvedAdaptiveImportsForChunk.get(id);
        if (resolvedAdaptiveImports) {
          let code = "";

          for (const [adaptiveImport, adaptedImport] of [
            ...resolvedAdaptiveImports,
          ].reverse()) {
            code += `import ${JSON.stringify(
              encodeArcInitId(adaptiveImport, adaptedImport),
            )};\n`;
          }

          code = generateInputDoc(code);

          return {
            code,
            moduleSideEffects: false,
          };
        }

        if (isArcProxyId(id)) {
          id = decodeArcProxyId(id);
          const info = await this.load({ id });
          if (info) {
            let code = "";
            let syntheticNamedExports: boolean | string = false;

            if (info.exports?.length) {
              const hasNamedExports =
                info.exports.length >= (info.hasDefaultExport ? 2 : 1);

              if (hasNamedExports || info.hasDefaultExport) {
                const arcId = getArcId(id);
                if (hasNamedExports) {
                  code += `export const {${arcId}} = ${runtimeId};\n`;
                  syntheticNamedExports = arcId;

                  if (info.hasDefaultExport) {
                    code += `export default ${arcId}.default;\n`;
                  }
                } else {
                  syntheticNamedExports = true;
                  code += `export default ${runtimeId}.${arcId};\n`;
                }
              }
            } else {
              code = "export {};\n";
            }

            return {
              code,
              syntheticNamedExports,
              moduleSideEffects: false,
            };
          }
        } else if (isArcInitId(id)) {
          const [adaptiveImport, adaptedImport] = decodeArcInitId(id);
          const bindings = bindingsByAdaptiveId.get(adaptiveImport);
          if (!bindings || isCssFile(adaptiveImport)) {
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

      banner(chunk) {
        if (chunk.isEntry) {
          if (
            chunk.facadeModuleId &&
            arcHTMLChunkReg.test(chunk.facadeModuleId)
          ) {
            return `window.${runtimeId}={};`;
          }

          return `window.${runtimeId}_d || await new Promise(r => window.${runtimeId}_d = r);`;
        }

        return "";
      },

      footer(chunk) {
        if (
          chunk.isEntry &&
          chunk.facadeModuleId &&
          arcHTMLChunkReg.test(chunk.facadeModuleId)
        ) {
          return `window.${runtimeId}_d?.();\nwindow.${runtimeId}_d = true;`;
        }

        return "";
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
            const arcHTMLChunkMatch = arcHTMLChunkReg.exec(chunk.fileName);
            if (!arcHTMLChunkMatch) continue;
            delete bundle[fileName];
            const [, entryName, flagSetStr] = arcHTMLChunkMatch;
            const flaggedManifest = {
              flags: (flagSetStr ? flagSetStr.split(".") : []) as FlagSet,
              manifest: await generateDocManifest(
                basePath,
                chunk.source.toString(),
              ),
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

          manifestCode += `:${JSON.stringify(defaultFlaggedAssets.manifest)}`;
        }

        manifestCode += `}return {"head": ["<script>console.error('Unable to load adaptive arc files, unknown entry was provided when asking for assets.')</script>"]}};\n`;

        await Promise.all(
          serverEntryFiles.map((file) => fs.appendFile(file, manifestCode)),
        );
      },
    },
  ];

  function encodeArcProxyId(id: string) {
    return `${arcProxyPrefix + (proxyModuleId++).toString(36)}:${
      encodeFileName(id) + arcJsSuffix
    }`;
  }

  function encodeArcInitId(adaptiveImport: string, adaptedImport: string) {
    return `${arcInitPrefix + (initModuleId++).toString(36)}:${
      (adaptiveImport === adaptedImport
        ? encodeFileName(adaptiveImport)
        : `${encodeFileName(adaptiveImport)},${encodeFileName(
            path.relative(path.dirname(adaptiveImport), adaptedImport),
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

function decodeArcProxyId(id: string) {
  return decodeFileName(
    id.slice(
      id.indexOf(":", arcProxyPrefix.length + 1) + 1,
      -arcJsSuffix.length,
    ),
  );
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
  const adaptedImport = path.join(
    adaptiveImport,
    "..",
    decodeFileName(id.slice(sepStart + 1, -arcJsSuffix.length)),
  );
  return [adaptiveImport, adaptedImport];
}
