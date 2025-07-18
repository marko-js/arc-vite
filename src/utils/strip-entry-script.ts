import toHTML from "dom-serializer";
import type { Element, Node } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";

const { isTag, removeElement, filter } = DomUtils;

export function stripEntryScript(entryScriptURL: string, html: string) {
  const dom = parseDocument(html);
  for (const script of filter(isModule, dom) as Element[]) {
    if (script.attribs.src === entryScriptURL) {
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
