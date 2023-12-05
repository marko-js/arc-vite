import type { Rollup } from "vite";
import { decodeFileName, encodeFileName } from "./filename-encoding";
import { normalizeFlagSets, type FlagSet } from "./flags";
import { getMatches, type Match } from "./matches";

const arcPrefix = "\0arc-";
const arcVirtualMatchPrefix = `${arcPrefix}match:`;
const scriptFileReg = /\.(?:[mc]?[tj]s|json)(\?|$)/
const assetFileReg = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss|a?png|jpe?g|jfif|pipeg|pjp|gif|svg|ico|web[pm]|avif|mp4|ogg|mp3|wav|flac|aac|opus|woff2?|eot|[ot]tf|webmanifest|pdf|txt)(\?|$)/

export function isAssetFile(id: string) {
  return assetFileReg.test(id);
}

export function shouldCheckVirtualMatch(id: string) {
  return !scriptFileReg.test(id) && !assetFileReg.test(id);
}

export function getVirtualMatches(
  info: Rollup.ModuleInfo,
  flagSets: FlagSet[],
) {
  const { id, meta } = info;
  if (typeof meta.arcSourceCode !== "string" || !Array.isArray(meta.arcScanIds)) {
    return;
  }

  const matchesFlagSets: FlagSet[] = [];
  for (const scanId of meta.arcScanIds) {
    const matches = getMatches(scanId, flagSets);
    if (matches) {
      for (const alternate of matches.alternates) {
        matchesFlagSets.push(alternate.flags);
      }
    }
  }

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
