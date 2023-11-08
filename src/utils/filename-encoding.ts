import { Buffer } from "buffer";
const cwd = process.cwd();
const encodeCwdReg = new RegExp(`~|${escapeReg(cwd)}`, "g");
const decodeCwdReg = /_?~/g;

export function encodeFileName(str: string) {
  return Buffer.from(
    str.replace(encodeCwdReg, encodeReplace),
    "utf-8",
  ).toString("base64url");
}

export function decodeFileName(str: string) {
  return Buffer.from(str, "base64")
    .toString("utf-8")
    .replace(decodeCwdReg, decodeReplace);
}

function encodeReplace(match: string) {
  if (match === "~") {
    return "_~";
  }

  return "~";
}

function decodeReplace(match: string) {
  if (match === "~") {
    return cwd;
  }

  return "~";
}

function escapeReg(value: string) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
