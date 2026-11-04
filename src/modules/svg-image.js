import {
  diagramSVG,
  svgNS,
  svgTags,
  svgGeometry,
  svgPaint,
  svgImageHref,
} from "./diagram.js";
import { svgDataURL, svgDataText } from "./svg-source.js";

const styleProps = new Set([
  ...svgPaint,
  "display",
  "visibility",
  "transform",
  "x",
  "y",
  "r",
  "rx",
  "ry",
  "cx",
  "cy",
  "width",
  "height",
  "white-space",
  "line-height",
  "text-align",
  "vertical-align",
  "box-sizing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
]);
const htmlNS = "http://www.w3.org/1999/xhtml";
const labelTags = new Set(
  "div span p b strong i em br small sub sup".split(" "),
);
function safeStyle(style) {
  const kept = [];
  for (const prop of style) {
    if (!styleProps.has(prop) && !prop.startsWith("--")) continue;
    const value = style.getPropertyValue(prop);
    if (
      /[\\<>@]/.test(value) ||
      /(?:image-set|image|attr|src|paint)\s*\(/i.test(value) ||
      (/url\s*\(/i.test(value) &&
        !/^url\(\s*["']?#[\w:.-]+["']?\s*\)$/i.test(value))
    )
      continue;
    kept.push(
      prop +
        ":" +
        value +
        (style.getPropertyPriority(prop) ? " !important" : ""),
    );
  }
  return kept.join(";");
}
function px(length) {
  const m = /^\s*(\d*\.?\d+)\s*(px|pt|pc|in|cm|mm)?\s*$/i.exec(length || "");
  return (
    m &&
    Number(m[1]) *
      { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[
        m[2]?.toLowerCase() || "px"
      ]
  );
}
function fitsVectorBudget(root) {
  if (root.querySelectorAll("*").length > 12000) return false;
  // Count referenced subtrees too. A small set of nested <use> definitions
  // can expand to many more drawing commands than there are source elements.
  const costs = new Map(),
    visiting = new Set(),
    limit = 60000;
  function cost(node, depth) {
    if (depth > 128 || visiting.has(node)) return limit + 1;
    if (costs.has(node)) return costs.get(node);
    visiting.add(node);
    let total = 1;
    if (node.localName === "use") {
      const href =
        node.getAttribute("href") ||
        node.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      const target =
        href?.startsWith("#") &&
        root.ownerDocument.getElementById(href.slice(1));
      if (target) total += cost(target, depth + 1);
    }
    for (const child of node.children) {
      if (total > limit) break;
      total += cost(child, depth + 1);
    }
    visiting.delete(node);
    costs.set(node, total);
    return total;
  }
  return cost(root, 0) <= limit;
}
function nestedVector(href, doc, depth) {
  if (depth >= 4 || !svgDataURL.test(href || "")) return null;
  try {
    const graphic = readSVGImage(
      svgDataText(href),
      { ownerDocument: doc },
      depth + 1,
    );
    return graphic?.svg ? graphic : null;
  } catch {
    return null;
  }
}
export function renderedSVG(root) {
  return diagramSVG(root, {
    nestedImage: (node) =>
      nestedVector(
        node.getAttribute("href") ||
          node.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
        root.ownerDocument,
        0,
      ),
  });
}
export function readSVGImage(text, el, depth = 0) {
  if (
    !text ||
    text.length > 12000000 ||
    /<!ENTITY\s|<!DOCTYPE[^>]*\[/i.test(text)
  )
    return null;
  // Parse XML inertly. The source tree is never inserted into the chat.
  const xml = new DOMParser().parseFromString(
    text.replace(/<!DOCTYPE\s+svg\b[^>]*>/i, ""),
    "image/svg+xml",
  );
  const root = xml.documentElement;
  if (
    root.localName !== "svg" ||
    root.namespaceURI !== svgNS ||
    root.querySelector("parsererror")
  )
    return null;
  const vb = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const ratio = vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : 0;
  const w = px(root.getAttribute("width")),
    h = px(root.getAttribute("height"));
  const width = el.naturalWidth || w || (h && ratio ? h * ratio : vb[2]) || 300;
  const height =
    el.naturalHeight || h || (w && ratio ? w / ratio : vb[3]) || 150;
  if (
    !(
      width > 0 &&
      height > 0 &&
      Number.isFinite(width) &&
      Number.isFinite(height)
    )
  )
    return null;
  if (!fitsVectorBudget(root)) return { width, height, rasterRoot: root };
  const doc = el.ownerDocument,
    win = doc.defaultView,
    sheet = new win.CSSStyleSheet();
  const nestedImages = new WeakMap();
  let unsupported = !!root.querySelector("switch,textPath[method=stretch]");
  function cssRules(node) {
    const source = new win.CSSStyleSheet();
    source.replaceSync(node.textContent);
    for (const rule of source.cssRules) {
      if (
        rule.type === CSSRule.FONT_FACE_RULE ||
        rule.type === CSSRule.MEDIA_RULE
      )
        unsupported = true;
      if (
        !rule.selectorText ||
        /:(?:host|host-context)|::(?:slotted|part)/i.test(rule.selectorText)
      )
        continue;
      if (rule.style.getPropertyValue("filter") && rule.style.filter !== "none")
        unsupported = true;
      const css = safeStyle(rule.style);
      if (css)
        sheet.insertRule(
          rule.selectorText.replace(/:root\b/g, "svg") + "{" + css + "}",
          sheet.cssRules.length,
        );
    }
  }
  function copy(node, label = false) {
    if (node.nodeType === 3 || node.nodeType === 4)
      return doc.createTextNode(node.textContent);
    if (node.nodeType !== 1) return null;
    if (label && node.namespaceURI === htmlNS) {
      if (!labelTags.has(node.localName)) {
        if (
          !["script", "style", "link", "iframe", "object", "embed"].includes(
            node.localName,
          )
        )
          unsupported = true;
        return null;
      }
      // Only inert text markup is measurable. Never import HTML attributes,
      // event handlers or resource-bearing elements from a foreignObject.
      const n = doc.createElementNS(htmlNS, node.localName);
      for (const name of ["id", "class", "dir"])
        if (node.hasAttribute(name))
          n.setAttribute(name, node.getAttribute(name));
      if (node.hasAttribute("style"))
        n.setAttribute("style", safeStyle(node.style));
      for (const child of node.childNodes) {
        const clean = copy(child, true);
        if (clean) n.append(clean);
      }
      return n;
    }
    if (label) {
      unsupported = true;
      return null;
    }
    if (node.namespaceURI !== svgNS) return null;
    if (node.localName === "style") {
      cssRules(node);
      return null;
    }
    const tag = node.localName === "a" ? "g" : node.localName;
    if (!svgTags.has(tag) && tag !== "foreignObject") return null;
    if (
      (node.hasAttribute("filter") && node.getAttribute("filter") !== "none") ||
      (node.style?.filter && node.style.filter !== "none")
    )
      unsupported = true;
    const n = doc.createElementNS(svgNS, tag);
    for (const a of node.attributes) {
      const v = a.value;
      if (a.localName === "href") {
        if (tag === "g") continue;
        if (tag === "image" && /^data:image\//i.test(v) && !svgImageHref(v)) {
          const nested = nestedVector(v, doc, depth);
          if (nested) nestedImages.set(n, nested);
          else unsupported = true;
        }
        if (
          /^#[\w:.-]+$/.test(v) ||
          (node.localName === "image" && svgImageHref(v))
        )
          n.setAttribute("href", v);
      } else if (svgGeometry.has(a.name) || a.name === "class")
        n.setAttribute(a.name, v);
      else if (
        svgPaint.includes(a.name) &&
        !/[\\<>@]/.test(v) &&
        (!/url\s*\(/i.test(v) || /^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(v))
      )
        n.setAttribute(a.name, v);
    }
    if (node.hasAttribute("style"))
      n.setAttribute("style", safeStyle(node.style));
    for (const child of node.childNodes) {
      const safe = copy(child, tag === "foreignObject");
      if (safe) n.append(safe);
    }
    return n;
  }
  const clean = copy(root);
  if (!clean) return null;
  const result = { width, height };
  if (unsupported) return { ...result, rasterRoot: root };
  // Resolve class rules/currentColor with browser CSS, isolated from chat styles.
  const host = doc.createElement("div");
  host.dataset.cge = "svg-source";
  host.style.cssText = `all:initial;position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;contain:strict;pointer-events:none;color:black`;
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.adoptedStyleSheets = [sheet];
  clean.setAttribute("width", width);
  clean.setAttribute("height", height);
  shadow.append(clean);
  doc.body.append(host);
  try {
    const matches = new WeakMap();
    for (const rule of sheet.cssRules) {
      for (const node of shadow.querySelectorAll(rule.selectorText)) {
        if (!matches.has(node)) matches.set(node, new Map());
        for (const prop of rule.style)
          matches.get(node).set(prop, rule.style.getPropertyValue(prop));
      }
    }
    const vector = diagramSVG(clean, {
      image: true,
      nestedImage: (n) => nestedImages.get(n),
      specifiedPaint: (node, prop) =>
        node.style?.getPropertyValue(prop) ||
        matches.get(node)?.get(prop) ||
        node.getAttribute(prop),
    });
    return vector
      ? { ...result, svg: vector.svg }
      : { ...result, rasterRoot: root };
  } finally {
    host.remove();
  }
}
