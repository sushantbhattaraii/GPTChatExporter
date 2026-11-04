// Keep SVG geometry, paint and text. Only fragment references may survive.
// HTML labels in Mermaid are foreignObjects, which PDF's SVG engine cannot draw.
export const svgNS = "http://www.w3.org/2000/svg";
export const svgTags = new Set(
  "svg g defs symbol marker pattern mask image path rect circle ellipse line polyline polygon text tspan textPath title desc clipPath linearGradient radialGradient stop use".split(
    " ",
  ),
);
export const svgGeometry = new Set(
  "id viewBox preserveAspectRatio transform d x y x1 y1 x2 y2 dx dy r rx ry cx cy fx fy points width height refX refY markerWidth markerHeight markerUnits orient offset gradientUnits gradientTransform spreadMethod clipPathUnits patternUnits patternContentUnits patternTransform maskUnits maskContentUnits textLength lengthAdjust startOffset rotate".split(
    " ",
  ),
);
export const svgPaint =
  "fill stroke color stroke-width stroke-dasharray stroke-dashoffset stroke-linejoin stroke-linecap stroke-miterlimit fill-rule fill-opacity stroke-opacity opacity text-anchor dominant-baseline font-size font-weight font-style font-family marker-start marker-end marker-mid clip-path clip-rule mask stop-color stop-opacity overflow".split(
    " ",
  );
function local(value, base) {
  if (!value.includes("url(")) return value;
  const match = /^url\(["']?([^"')]+)["']?\)$/.exec(value);
  if (!match) return null;
  try {
    const url = new URL(match[1], base);
    return url.href.split("#")[0] === base.split("#")[0] && url.hash
      ? "url(" + url.hash + ")"
      : null;
  } catch {
    return null;
  }
}
export function svgImageHref(value) {
  return (
    value.length <= 16000030 &&
    /^data:image\/(?:png;base64,\s*iVBORw0KGgo|jpeg;base64,\s*\/9j\/)[a-z\d+/=\s]*$/i.test(
      value,
    )
  );
}
let imageNumber = 0;
export function diagramSVG(
  root,
  { image = false, nestedImage, specifiedPaint } = {},
) {
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
    if (
      (css.display === "none" &&
        ![
          "defs",
          "symbol",
          "marker",
          "clipPath",
          "mask",
          "pattern",
          "linearGradient",
          "radialGradient",
        ].includes(node.localName)) ||
      css.visibility === "hidden"
    )
      return null;
    if (node.localName === "foreignObject") {
      const group = doc.createElementNS(svgNS, "g");
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
          const t = doc.createElementNS(svgNS, "text");
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
    if (!svgTags.has(node.localName)) return null;
    const nested = node.localName === "image" && nestedImage?.(node);
    if (
      node.localName === "image" &&
      !nested &&
      !svgImageHref(
        node.getAttribute("href") ||
          node.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
          "",
      )
    )
      return null;
    const copy = doc.createElementNS(svgNS, nested ? "svg" : node.localName);
    for (const a of node.attributes) {
      if (
        svgGeometry.has(a.name) ||
        (a.localName === "href" &&
          (/^#[\w:.-]+$/.test(a.value) ||
            (node.localName === "image" && svgImageHref(a.value))))
      )
        copy.setAttribute(
          a.localName,
          node.localName === "image" && a.localName === "href"
            ? a.value.replace(/\s+/g, "")
            : a.value,
        );
    }
    for (const prop of svgPaint) {
      const declared = specifiedPaint?.(node, prop);
      // A referenced symbol inherits paint from each <use>. Baking the
      // definition's default black into its children loses those colors.
      if (specifiedPaint && !declared) continue;
      const computed = css.getPropertyValue(prop);
      const value =
        /^currentcolor$/i.test(declared || "") &&
        /^(fill|stroke|stop-color)$/.test(prop) &&
        computed === css.color
          ? "currentColor"
          : local(computed || "", doc.URL);
      // PDF dash arrays require strictly positive lengths. Mermaid uses 0 for solid strokes.
      if (
        prop === "stroke-dasharray" &&
        value !== "none" &&
        value?.split(/[ ,]+/).some((v) => !(parseFloat(v) > 0))
      )
        continue;
      if (
        value &&
        (!["overflow", "font-family"].includes(prop) ||
          image ||
          node.hasAttribute(prop))
      )
        copy.setAttribute(prop, value);
    }
    if (
      image &&
      !node.hasAttribute("transform") &&
      css.transform &&
      css.transform !== "none"
    )
      copy.setAttribute("transform", css.transform);
    if (image) {
      const fields =
        {
          rect: ["x", "y", "width", "height", "rx", "ry"],
          circle: ["cx", "cy", "r"],
          ellipse: ["cx", "cy", "rx", "ry"],
        }[node.localName] || [];
      for (const field of fields) {
        const length = css.getPropertyValue(field);
        if (length && length !== "auto") copy.setAttribute(field, length);
      }
    }
    if (nested) {
      const inner = new win.DOMParser().parseFromString(
        nested.svg,
        "image/svg+xml",
      ).documentElement;
      copy.setAttribute("viewBox", `0 0 ${nested.width} ${nested.height}`);
      copy.setAttribute("overflow", "hidden");
      if (!copy.hasAttribute("width")) copy.setAttribute("width", nested.width);
      if (!copy.hasAttribute("height"))
        copy.setAttribute("height", nested.height);
      inner.setAttribute("width", nested.width);
      inner.setAttribute("height", nested.height);
      copy.append(doc.importNode(inner, true));
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
  if (image) {
    // The PDF placement supplies the displayed viewport. Isolate local IDs
    // when several independent SVG files share the same printed card.
    for (const key of ["x", "y", "width", "height"]) svg.removeAttribute(key);
    const prefix = "cge-svg-" + ++imageNumber + "-";
    for (const n of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...n.attributes]) {
        if (attr.name === "id") n.setAttribute("id", prefix + attr.value);
        else if (attr.name === "href" && attr.value.startsWith("#"))
          n.setAttribute("href", "#" + prefix + attr.value.slice(1));
        else if (attr.value.startsWith("url(#"))
          n.setAttribute(
            attr.name,
            attr.value.replace("url(#", "url(#" + prefix),
          );
      }
    }
  }
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
