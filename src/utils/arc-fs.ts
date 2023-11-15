import fs from "fs";
import type { FlagSet } from "./flags";
import { getMatches } from "./matches";

const arcFlagReg = /\[/;
const fsByFlagSet = new Map<string, typeof fs>();

export function getArcFS(flagSet: FlagSet) {
  const flags = flagSet.join(".");
  let fileSystem = fsByFlagSet.get(flags);
  if (!fileSystem) {
    fileSystem = createAdaptiveFS(flagSet);
    fsByFlagSet.set(flags, fileSystem);
  }

  return fileSystem;
}

export function patchFS(flagSet: FlagSet, afs: any) {
  const flagSets = [flagSet];

  // Sync api
  const { readFileSync, statSync, readlinkSync, accessSync, readdirSync } = fs;
  afs.readFileSync = (id: string, ...args: any[]) =>
    readFileSync(getMatch(id), ...args);
  afs.statSync = (id: string, ...args: any[]) =>
    statSync(getMatch(id), ...args);
  afs.readlinkSync = (id: string, ...args: any[]) =>
    readlinkSync(getMatch(id), ...args);
  afs.accessSync = (id: string, ...args: any[]) =>
    accessSync(getMatch(id), ...args);
  afs.readdirSync = (id: string, ...args: any[]) => {
    const match = getMatch(id);
    const entries = readdirSync(id, ...args);
    return match === id ? entries : ignoreAdaptiveEntries(entries);
  };

  // Callback api
  const { readFile, stat, readlink, access, readdir } = fs as any;
  afs.readFile = (id: string, ...args: any[]) =>
    readFile(getMatch(id), ...args);
  afs.stat = (id: string, ...args: any[]) => stat(getMatch(id), ...args);
  afs.readlink = (id: string, ...args: any[]) =>
    readlink(getMatch(id), ...args);
  afs.access = (id: string, ...args: any[]) => access(getMatch(id), ...args);
  afs.readdir = (id: string, ...args: any[]) => {
    const match = getMatch(id);
    if (match === id) return readdir(id, ...args);
    const cb = args.pop();
    readdir(id, ...args, (err: any, entries: string[]) => {
      if (err) return cb(err);
      cb(null, ignoreAdaptiveEntries(entries));
    });
  };

  // Promise api
  const {
    promises: {
      readFile: readFilePromise,
      stat: statPromise,
      readlink: readlinkPromise,
      access: accessPromise,
      readdir: readdirPromise,
    },
  } = fs;
  afs.promises.readFile = (id: string, ...args: any[]) =>
    readFilePromise(getMatch(id), ...args);
  afs.promises.stat = (id: string, ...args: any[]) =>
    statPromise(getMatch(id), ...args);
  afs.promises.readlink = (id: string, ...args: any[]) =>
    readlinkPromise(getMatch(id), ...args);
  afs.promises.access = (id: string, ...args: any[]) =>
    accessPromise(getMatch(id), ...args);
  afs.promises.readdir = (id: string, ...args: any[]) => {
    const match = getMatch(id);
    const entriesPromise = readdirPromise(id, ...args);
    return match === id
      ? entriesPromise
      : entriesPromise.then(ignoreAdaptiveEntries);
  };

  return () => {
    afs.readFileSync = readFileSync;
    afs.statSync = statSync;
    afs.readlinkSync = readlinkSync;
    afs.accessSync = accessSync;
    afs.readdirSync = readdirSync;

    afs.readFile = readFile;
    afs.stat = stat;
    afs.readlink = readlink;
    afs.access = access;
    afs.readdir = readdir;

    afs.promises.readFile = readFilePromise;
    afs.promises.stat = statPromise;
    afs.promises.readlink = readlinkPromise;
    afs.promises.access = accessPromise;
    afs.promises.readdir = readdirPromise;
  };

  function getMatch(id: unknown): string {
    if (typeof id !== "string") return id as string;
    const match = getMatches(id, flagSets);
    return match ? match.alternates[0].value : id;
  }
}

function createAdaptiveFS(flagSet: FlagSet) {
  const afs = { ...fs, promises: { ...fs.promises } } as any;
  patchFS(flagSet, afs);
  return afs as typeof fs;
}

function ignoreAdaptiveEntries(entries: string[]) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (arcFlagReg.test(entry)) {
      const uniqueEntries = entries.slice(0, i);
      for (; i < entries.length; i++) {
        const entry = entries[i];
        if (!arcFlagReg.test(entry)) {
          uniqueEntries.push(entry);
        }
      }

      return uniqueEntries;
    }
  }
  return entries;
}
