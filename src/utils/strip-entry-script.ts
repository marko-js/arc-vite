import toHTML from "dom-serializer";
import type { Node, Element } from "domhandler";
import { parseDocument, DomUtils } from "htmlparser2";

const { isTag, removeElement, filter } = DomUtils;

export function stripEntryScript(
  basePath: string,
  fileName: string,
  html: string,
) {
  const dom = parseDocument(html);
  for (const script of filter(isModule, dom) as Element[]) {
    if (stripBasePath(basePath, script.attribs.src) === fileName) {
      removeElement(script);
    }
  }

  return toHTML(dom);
}

function isModule(node: Node): node is Element {
  return (
    isTag(node) &&
    node.tagName === "script" &&
    node.attribs.type === "module" &&
    !!node.attribs.src
  );
}

function stripBasePath(basePath: string, path: string) {
  if (path.startsWith(basePath)) return path.slice(basePath.length);
  return path;
}
