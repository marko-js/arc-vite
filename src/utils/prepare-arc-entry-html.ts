import toHTML from "dom-serializer";
import { type Node, Element, Text } from "domhandler";
import { parseDocument, DomUtils, ElementType } from "htmlparser2";
import type { Rollup } from "vite";

const { isTag, filter, appendChild, prepend } = DomUtils;
const parserOptions = { decodeEntities: false, encodeEntities: false };
const emptyScriptReg = /^(?:[\s;]+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*$/;

export function prepareArcEntryHTML(
  runtimeId: string,
  html: string,
  renderAssetURL: (fileName: string) => string,
  originalChunk: Rollup.OutputChunk,
  adaptedChunk: Rollup.OutputChunk,
) {
  const originalChunkURL = renderAssetURL(originalChunk.fileName);

  if (emptyScriptReg.test(adaptedChunk.code)) {
    return [
      {
        tag: "script",
        attrs: {
          type: "module",
          async: true,
          crossorigin: true,
          src: originalChunkURL,
        },
      },
    ];
  }

  const dom = parseDocument(html, parserOptions);
  const originalChunkIsEmpty = emptyScriptReg.test(originalChunk.code);
  const adaptedChunkURL = renderAssetURL(adaptedChunk.fileName);

  for (const script of filter(isModule, dom) as Element[]) {
    if (script.attribs.src === adaptedChunkURL) {
      if (originalChunkIsEmpty) {
        prepend(
          script,
          new Element(
            "script",
            {},
            [new Text(`${runtimeId}={}`)],
            ElementType.Script,
          ),
        );
      } else {
        delete script.attribs.src;
        prepend(
          script,
          new Element(
            "script",
            {},
            [new Text(`${runtimeId}={}`)],
            ElementType.Script,
          ),
        );
        appendChild(
          script,
          new Text(
            `import ${JSON.stringify(adaptedChunkURL)}\nimport ${JSON.stringify(
              originalChunkURL,
            )}`,
          ),
        );
      }
    }
  }

  return toHTML(dom, parserOptions);
}

function isModule(node: Node): node is Element {
  return (
    isTag(node) &&
    node.tagName === "script" &&
    node.attribs.type === "module" &&
    !!node.attribs.src
  );
}
