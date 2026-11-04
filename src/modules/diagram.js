// Keep SVG geometry, paint and text. Only fragment references may survive.
// HTML labels in Mermaid are foreignObjects, which PDF's SVG engine cannot draw.
const namespace = "http://www.w3.org/2000/svg";
const tags = new Set(
  "svg g defs marker path rect circle ellipse line polyline polygon text tspan title desc clipPath linearGradient radialGradient stop use".split(
    " ",
  ),
);
const geometry = new Set(
  "id viewBox preserveAspectRatio transform d x y x1 y1 x2 y2 dx dy r rx ry cx cy points width height refX refY markerWidth markerHeight markerUnits orient offset gradientUnits gradientTransform spreadMethod".split(
    " ",
  ),
);
const paint =
  "fill stroke color stroke-width stroke-dasharray stroke-dashoffset stroke-linejoin stroke-linecap fill-rule fill-opacity stroke-opacity opacity text-anchor dominant-baseline font-size font-weight font-style marker-start marker-end marker-mid clip-path stop-color stop-opacity".split(
    " ",
  );
function local(value, base) {
  if (!value.includes("url(")) return value;
  const match = /^url\(["']?([^"')]+)["']?\)$/.exec(value);
  if (!match) return null;
  const url = new URL(match[1], base);
  return url.href.split("#")[0] === base.split("#")[0] && url.hash
    ? "url(" + url.hash + ")"
    : null;
}
export function diagramSVG(root) {
  const doc = root.ownerDocument,
    win = doc.defaultView;
  const box = root.viewBox?.baseVal;
  const width = box?.width || root.getBoundingClientRect().width;
  const height = box?.height || root.getBoundingClientRect().height;
  if (!(width > 0 && height > 0) || root.querySelectorAll("*").length > 12000)
    return null;
  function clone(node) {
    if (node.nodeType === 3) return doc.createTextNode(node.textContent);
    if (node.nodeType !== 1) return null;
    const css = win.getComputedStyle(node);
    if (css.display === "none" || css.visibility === "hidden") return null;
    if (node.localName === "foreignObject") {
      const group = doc.createElementNS(namespace, "g");
      const matrix = node.getScreenCTM()?.inverse();
      if (!matrix) return null;
      const walker = doc.createTreeWalker(node, 4);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        const style = win.getComputedStyle(n.parentElement);
        for (const match of n.textContent.matchAll(/\S+/gu)) {
          const range = doc.createRange();
          range.setStart(n, match.index);
          range.setEnd(n, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          if (!rect.width) continue;
          const p = new win.DOMPoint(
            rect.left,
            rect.bottom - rect.height * 0.19,
          ).matrixTransform(matrix);
          const t = doc.createElementNS(namespace, "text");
          t.setAttribute("x", p.x);
          t.setAttribute("y", p.y);
          t.setAttribute("font-size", style.fontSize);
          t.setAttribute("fill", style.color);
          t.textContent = match[0];
          group.append(t);
        }
      }
      return group;
    }
    if (!tags.has(node.localName)) return null;
    const copy = doc.createElementNS(namespace, node.localName);
    for (const a of node.attributes) {
      if (
        geometry.has(a.name) ||
        (a.localName === "href" && /^#[\w:.-]+$/.test(a.value))
      )
        copy.setAttribute(a.localName, a.value);
    }
    for (const prop of paint) {
      const value = local(css.getPropertyValue(prop) || "", doc.URL);
      // PDF dash arrays require strictly positive lengths. Mermaid uses 0 for solid strokes.
      if (
        prop === "stroke-dasharray" &&
        value !== "none" &&
        value?.split(/[ ,]+/).some((v) => !(parseFloat(v) > 0))
      )
        continue;
      if (value) copy.setAttribute(prop, value);
    }
    for (const child of node.childNodes) {
      const c = clone(child);
      if (c) copy.append(c);
    }
    return copy;
  }
  const svg = clone(root);
  if (!svg) return null;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  if (!box?.width) svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  return {
    type: "diagram",
    svg: new XMLSerializer().serializeToString(svg),
    width,
    height,
    text:
      root.getAttribute("aria-label") ||
      [...root.querySelectorAll("title,text,foreignObject")]
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200) ||
      "Diagram",
  };
}
