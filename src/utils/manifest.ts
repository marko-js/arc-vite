import type { Comment, Element, Node, Text } from "domhandler";
import { DomUtils, ElementType, parseDocument } from "htmlparser2";

type Serialized = ReturnType<typeof serialize>;
export type DocManifest = {
  "head-prepend"?: Serialized;
  head?: Serialized;
  "body-prepend"?: Serialized;
  body?: Serialized;
};

enum InjectType {
  AssetAttrs = 0,
  PublicPath = 1,
}

const { isComment, isTag } = DomUtils;
const markerComment = "ARC_VITE";
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function generatManifest(basePath: string, html: string): DocManifest {
  const dom = parseDocument(html);
  const headPrepend: Node[] = [];
  const head: Node[] = [];
  const bodyPrepend: Node[] = [];
  const body: Node[] = [];

  for (const node of dom.childNodes) {
    if (isTag(node) && node.tagName === "html") {
      for (const child of node.childNodes) {
        if (isTag(child)) {
          switch (child.tagName) {
            case "head":
              splitNodesByMarker(child.childNodes, headPrepend, head);
              break;
            case "body":
              splitNodesByMarker(child.childNodes, bodyPrepend, body);
              break;
          }
        }
      }
    }
  }

  return {
    "head-prepend": serializeOrUndefined(basePath, headPrepend),
    head: serializeOrUndefined(basePath, head),
    "body-prepend": serializeOrUndefined(basePath, bodyPrepend),
    body: serializeOrUndefined(basePath, body),
  };
}

export function generateHTML(code: string) {
  return `<!DOCTYPE html><html><head><!--${markerComment}--></head><body><!--${markerComment}--><script async type="module">${code}</script></body></html>`;
}

function serialize(
  basePath: string,
  nodes: Node[],
  parts?: (string | InjectType)[],
) {
  let curString = parts ? (parts.pop() as string) : "";
  parts ??= [];

  for (const node of nodes) {
    switch (node.type) {
      case ElementType.Tag:
      case ElementType.Style:
      case ElementType.Script: {
        const tag = node as Element;
        const { name } = tag;
        let urlAttr: undefined | string;
        curString += `<${name}`;

        switch (tag.tagName) {
          case "script":
            parts.push(curString, InjectType.AssetAttrs);
            urlAttr = "src";
            curString = "";
            break;
          case "style":
            parts.push(curString, InjectType.AssetAttrs);
            curString = "";
            break;
          case "link":
            urlAttr = "href";
            if (
              tag.attribs.rel === "stylesheet" ||
              tag.attribs.rel === "modulepreload" ||
              tag.attribs.as === "style" ||
              tag.attribs.as === "script"
            ) {
              parts.push(curString, InjectType.AssetAttrs);
              curString = "";
            }
            break;
        }

        for (const attr of tag.attributes) {
          if (attr.value === "") {
            curString += ` ${attr.name}`;
          } else if (attr.name === urlAttr) {
            curString += ` ${attr.name}="`;
            parts.push(
              curString,
              InjectType.PublicPath,
              stripBasePath(basePath, attr.value)
                .replace(/^\.\//, "")
                .replace(/"/g, "&#39;") + '"',
            );
            curString = "";
          } else {
            curString += ` ${attr.name}="${attr.value.replace(/"/g, "&#39;")}"`;
          }
        }

        curString += ">";

        if (tag.children.length) {
          parts.push(curString);
          serialize(basePath, tag.children, parts);
          curString = parts.pop() as string;
        }

        if (!voidElements.has(name)) {
          curString += `</${name}>`;
        }

        break;
      }
      case ElementType.Text: {
        const text = (node as Text).data;

        if (!/^\s*$/.test(text)) {
          curString += text;
        }

        break;
      }
      case ElementType.Comment:
        curString += `<!--${(node as Comment).data}-->`;
        break;
    }
  }

  if (curString) {
    parts.push(curString);
  }

  return parts;
}

function serializeOrUndefined(basePath: string, nodes: Node[]) {
  const result = serialize(basePath, nodes);
  if (result.length) {
    return result;
  }
}

function splitNodesByMarker(nodes: Node[], before: Node[], after: Node[]) {
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];

    if (isComment(node) && node.data === markerComment) {
      i++;
      for (; i < nodes.length; i++) {
        node = nodes[i];
        after.push(node);
      }

      break;
    }

    before.push(node);
  }
}

function stripBasePath(basePath: string, path: string) {
  if (path.startsWith(basePath)) return path.slice(basePath.length);
  return path;
}
