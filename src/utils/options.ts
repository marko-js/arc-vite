import {
  type FlagSet,
  createFlagSets,
  normalizeFlagSet,
  normalizeFlagSets,
} from "./flags";
import { ReadOncePersistedStore } from "./read-once-persisted-store";

export type Options = {
  runtimeId?: string;
} & (
  | {
      flags: (string | string[])[];
    }
  | {
      flagSets: FlagSet[];
    }
);

export interface InternalPluginOptions {
  runtimeId: string;
  flagSets: FlagSet[];
  forceFlagSet: FlagSet | undefined;
  store: ReadOncePersistedStore<{ serverEntryFiles: string[] }>;
}

export function getInternalPluginOptions(
  options: Options,
): InternalPluginOptions {
  const runtimeId = `arc${options.runtimeId ? `_${options.runtimeId}` : ""}`;
  const { FLAGS } = process.env;
  return {
    runtimeId,
    store: new ReadOncePersistedStore(`vite-${runtimeId}`),
    forceFlagSet:
      FLAGS === undefined
        ? undefined
        : FLAGS === ""
        ? ([] as unknown as FlagSet)
        : normalizeFlagSet(FLAGS.split(".")),
    flagSets:
      "flags" in options
        ? createFlagSets(options.flags)
        : normalizeFlagSets(options.flagSets),
  };
}
