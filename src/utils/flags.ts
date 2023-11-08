declare const FLAG_SET: unique symbol;
export type FlagSet = string[] & { readonly [FLAG_SET]: true };

export function createFlagSets(flags: (string | string[])[]): FlagSet[] {
  const flagSets = [[]] as string[][];

  for (const group of flags) {
    const { length } = flagSets;
    for (const flag of Array.isArray(group) ? group : [group]) {
      for (let i = length; i--; ) {
        flagSets.push(flagSets[i].concat(flag));
      }
    }
  }

  return normalizeFlagSets(flagSets as FlagSet[]);
}

export function hasFlagSet(flagSets: FlagSet[], flagSet: FlagSet) {
  let max = flagSets.length;
  let pos = 0;

  while (pos < max) {
    const mid = (pos + max) >>> 1;
    const compared = compareFlagSets(flagSets[mid], flagSet);
    if (compared === 0) return true;
    if (compared > 0) max = mid;
    else pos = mid + 1;
  }

  return false;
}

export function hasFlag(flagSet: FlagSet, flag: string) {
  let max = flagSet.length;
  let pos = 0;

  while (pos < max) {
    const mid = (pos + max) >>> 1;
    const compared = compareFlags(flagSet[mid], flag);
    if (compared === 0) return true;
    if (compared > 0) max = mid;
    else pos = mid + 1;
  }

  return false;
}

export function hasFlags(flagSet: FlagSet, flags: string[]) {
  for (const flag of flags) {
    if (!hasFlag(flagSet, flag)) {
      return false;
    }
  }

  return true;
}

export function compareFlagSets(a: FlagSet, b: FlagSet) {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === bLen) {
    for (let i = aLen; i--; ) {
      const compared = compareFlags(a[i], b[i]);
      if (compared === 0) continue;
      return compared;
    }
  }

  return bLen - aLen;
}

export function normalizeFlagSets(rawFlagSets: string[][]): FlagSet[] {
  if (!rawFlagSets.length) return rawFlagSets as FlagSet[];

  const sortedFlagSets = rawFlagSets
    .map(normalizeFlagSet)
    .sort(compareFlagSets);
  let prev = [] as unknown as FlagSet;
  const uniqueFlagSets = [prev];
  for (let i = 0; i < sortedFlagSets.length; i++) {
    if (compareFlagSets(prev, sortedFlagSets[i]) !== 0) {
      uniqueFlagSets.push((prev = sortedFlagSets[i]));
    }
  }
  return uniqueFlagSets;
}

export function normalizeFlagSet(flags: string[]): FlagSet {
  return [...new Set(flags)].sort(compareFlags) as FlagSet;
}

export function compareFlaggedObject(
  a: { flags: FlagSet },
  b: { flags: FlagSet },
) {
  return compareFlagSets(a.flags, b.flags);
}

function compareFlags(a: string, b: string) {
  return a.localeCompare(b);
}
