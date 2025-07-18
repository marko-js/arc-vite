import Resolver from "arc-resolver";
import fs from "fs";
import path from "path";

import {
  compareFlaggedObject,
  type FlagSet,
  hasFlagSet,
  normalizeFlagSet,
} from "./flags";

export type Matches = { default: string; alternates: [Match, ...Match[]] };
export type Match = { flags: FlagSet; value: string };
export const resolver = new Resolver(fs);

type RawMatch = { flags: string[]; value: string };

const hasQuery = /\?.*$/;
export function getMatches(
  id: string,
  flagSets: FlagSet[],
): Matches | undefined {
  if (hasQuery.test(id) || !path.isAbsolute(id)) return;

  const raw = tryGetRawMatches(id);
  if (!raw) return;

  let i = raw.length - 1;
  if (i) {
    const defaultMatch = raw[i].value;
    let alternates: undefined | [Match, ...Match[]];
    for (; i--; ) {
      const match = normalizeMatch(raw[i]);
      if (hasFlagSet(flagSets, match.flags)) {
        if (alternates) {
          alternates.push(match);
        } else {
          alternates = [match];
        }
      }
    }

    if (alternates) {
      return {
        default: defaultMatch,
        alternates: alternates.sort(compareFlaggedObject),
      };
    }
  }
}

export function clearCache() {
  resolver.clearCache();
}

function tryGetRawMatches(id: string): RawMatch[] | undefined {
  try {
    return resolver.getMatchesSync(id).raw;
  } catch {
    // ignore
  }
}

function normalizeMatch(match: RawMatch): Match {
  return {
    flags: normalizeFlagSet(match.flags),
    value: match.value,
  };
}
