import path from "path";
import type { Rollup } from "vite";
import { decodeFileName, encodeFileName } from "./filename-encoding";
import { normalizeFlagSets, type FlagSet } from "./flags";
import { getMatches, type Match } from "./matches";

const arcPrefix = "\0arc-";
const arcVirtualMatchPrefix = `${arcPrefix}match:`;
const isBuiltinModuleType =
  /\.(?:[mc]?[tj]s|json|css|less|sass|scss|styl|stylus|pcss|postcss|sss)(\?|$)/;

export async function getVirtualMatches(
  ctx: Rollup.PluginContext,
  flagSets: FlagSet[],
  resolved: { id: string },
) {
  const { id } = resolved;
  if (path.isAbsolute(id)) {
    const matches = getMatches(id, flagSets);
    if (matches) return matches;
  }

  if (isBuiltinModuleType.test(id)) return;

  let info = ctx.getModuleInfo(id);
  if (!info?.ast) info = await ctx.load(resolved);
  const { meta } = info;
  if (Array.isArray(meta.arcScanIds)) {
    if (typeof meta.arcSourceCode !== "string") {
      ctx.error(
        "arc-vite: when providing 'arcScanIds' you must also provide the original source code as 'arcSourceCode'.",
      );
    }
    const matchesFlagSets: FlagSet[] = [];
    await Promise.all(
      meta.arcScanIds.map(async (id) => {
        const matches = await getVirtualMatches(ctx, flagSets, { id });
        if (matches) {
          for (const alternate of matches.alternates) {
            matchesFlagSets.push(alternate.flags);
          }
        }
      }),
    );

    let alternates: undefined | [Match, ...Match[]];
    for (const flagSet of normalizeFlagSets(matchesFlagSets)) {
      if (!flagSet.length) continue;

      const alternate: Match = {
        flags: flagSet,
        value: encodeArcVirtualMatch(id, flagSet),
      };

      if (alternates) {
        alternates.push(alternate);
      } else {
        alternates = [alternate];
      }
    }

    if (alternates) {
      return {
        default: id,
        alternates,
      };
    }
  }
}

export function isArcVirtualMatch(id: string) {
  return id.startsWith(arcVirtualMatchPrefix);
}

export function decodeArcVirtualMatch(
  id: string,
): readonly [adaptiveImport: string, flagSet: FlagSet] {
  const prefixEnd = id.indexOf(":", arcVirtualMatchPrefix.length + 1) + 1;
  const adaptiveImport = decodeFileName(
    id.slice(arcVirtualMatchPrefix.length, prefixEnd - 1),
  );
  const flagSet = decodeFileName(id.slice(prefixEnd)).split(".") as FlagSet;
  return [adaptiveImport, flagSet];
}

function encodeArcVirtualMatch(id: string, flagSet: FlagSet) {
  return (
    arcVirtualMatchPrefix +
    encodeFileName(id) +
    ":" +
    encodeFileName(flagSet.join("."))
  );
}
