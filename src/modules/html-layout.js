// Print a bounded HTML illustration/card from its live boxes and text ranges.
// Ordinary prose and tables still use the flowing, paginated document renderer.
import { diagramSVG } from "./diagram.js";
import { rgba } from "./pdf-style.js";
import { linkOn } from "./links.js";
import { imagePlacement, rasterViewport } from "./image-box.js";
import { visuallyClipped } from "./visibility.js";
import { selectFonts } from "./unicode.js";
import { imageRef, imageSource } from "./media.js";
const NS = "http://www.w3.org/2000/svg";
const skip =
  "script,style,template,nav,aside,[data-cge],.turn-action-controls,[hidden],[data-testid*=reasoning i],[data-testid*=thought i]";
const num = (v) => Math.round(v * 100) / 100;
const escaped = (t) =>
  String(t)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function eligible(el, box, css) {
  const scope = el.shadowRoot || el;
  if (
    (!el.shadowRoot && !el.matches("div,section,article,figure,main")) ||
    el.matches(
      ".markdown,[data-message-author-role],[data-markdown-text-style]",
    ) ||
    scope.querySelector(
      "table,pre,code[class*=language-],.cm-editor,.cm-content,.CodeMirror,.monaco-editor,[data-code-block],.katex,mjx-container,[data-message-author-role],input,textarea,select,iframe",
    ) ||
    box.width < 110 ||
    box.height < 36 ||
    box.height > box.width * 2.8
  )
    return false;
  if (
    [...scope.querySelectorAll("code")].some((code) =>
      code.textContent.includes("\n"),
    )
  )
    return false;
  if (
    el.matches(
      "[data-testid*=flowchart i],[data-testid*=job-card i],[data-component*=flowchart i],[data-component*=job-card i],[aria-roledescription=flowchart i]",
    )
  )
    return true;
  const framed =
    parseFloat(css.borderTopWidth) > 0 && css.borderTopStyle !== "none";
  const action = scope.querySelector(
    "a[href],button,[role=button],[role=link]",
  );
  const win = el.ownerDocument.defaultView;
  // Flowcharts use a framed or flex/grid stack of painted stages and branch rows.
  if (!framed && !/grid|flex/.test(css.display)) return false;
  if (
    framed &&
    action &&
    scope.children.length > 0 &&
    (el.innerText || scope.textContent).trim().length > 45
  )
    return true;
  // A search result may have no frame: a thumbnail sits beside a column of
  // selectable text and links. Keep each row independent for pagination.
  if (action && /grid|flex/.test(css.display)) {
    const thumb = scope
      .querySelector("img,canvas,[role=img]")
      ?.getBoundingClientRect();
    if (
      thumb &&
      thumb.width >= 32 &&
      thumb.width < box.width / 2 &&
      thumb.height >= 24 &&
      [...scope.children].some((child) => {
        const r = child.getBoundingClientRect();
        return (
          r.left >= thumb.right - 1 &&
          r.width > thumb.width &&
          r.top < thumb.bottom &&
          (child.innerText || "").trim().length > 20
        );
      })
    )
      return true;
  }
  const painted = [...scope.querySelectorAll("div,section")].filter((n) => {
    const style = win.getComputedStyle(n);
    return (
      n.children.length < 5 &&
      n.textContent.trim() &&
      parseFloat(style.borderRadius) > 1 &&
      (parseFloat(style.borderTopWidth) > 0 ||
        (rgba(style.backgroundColor, el.ownerDocument)?.[3] || 0) > 0)
    );
  });
  return (
    painted.length >= 3 &&
    Boolean(
      scope.querySelector("svg,img,[class*=arrow i],[class*=connector i]") ||
        /[↓↑→←⬇⬆]/.test(el.innerText || scope.textContent) ||
        [...scope.children].some(
          (n) =>
            /grid|flex/.test(win.getComputedStyle(n).display) &&
            n.children.length >= 2,
        ),
    )
  );
}
export function readHtmlLayout(root) {
  if (
    (!root.shadowRoot && !root.matches("div,section,article,figure,main")) ||
    !(root.shadowRoot || root).children.length
  )
    return null;
  const doc = root.ownerDocument,
    win = doc.defaultView,
    box = root.getBoundingClientRect();
  if (
    !box.width ||
    !eligible(root, box, win.getComputedStyle(root)) ||
    (root.shadowRoot || root).querySelectorAll("*").length > 1600
  )
    return null;
  const create = (tag, attrs = {}) => {
    const n = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
      if (v != null) n.setAttribute(k, v);
    return n;
  };
  const out = create("svg", {
    viewBox: `0 0 ${num(box.width)} ${num(box.height)}`,
    width: num(box.width),
    height: num(box.height),
  });
  const assets = [],
    words = [];
  const defs = create("defs");
  out.append(defs);
  const colorCache = new Map();
  function paint(color) {
    if (!colorCache.has(color)) {
      const v = rgba(color, doc);
      colorCache.set(
        color,
        v?.[3]
          ? {
              color: `rgb(${v.slice(0, 3).map(Math.round).join(",")})`,
              alpha: v[3],
            }
          : null,
      );
    }
    return colorCache.get(color);
  }
  function shape(g, r, s) {
    const x = num(r.left - box.left),
      y = num(r.top - box.top),
      w = num(r.width),
      h = num(r.height);
    const bg = paint(s.backgroundColor),
      rad = Math.min(parseFloat(s.borderTopLeftRadius) || 0, h / 2, w / 2);
    if (bg)
      g.append(
        create("rect", {
          x,
          y,
          width: w,
          height: h,
          rx: rad,
          fill: bg.color,
          "fill-opacity": bg.alpha,
        }),
      );
    const sides = ["Top", "Right", "Bottom", "Left"];
    const widths = sides.map((k) => parseFloat(s["border" + k + "Width"]) || 0);
    const colors = sides.map((k) => s["border" + k + "Color"]);
    if (
      widths[0] > 0 &&
      widths.every((v) => v === widths[0]) &&
      colors.every((v) => v === colors[0])
    ) {
      const b = widths[0],
        c = paint(colors[0]);
      if (c && w >= b && h >= b)
        g.append(
          create("rect", {
            x: x + b / 2,
            y: y + b / 2,
            width: w - b,
            height: h - b,
            rx: Math.max(0, rad - b / 2),
            fill: "none",
            stroke: c.color,
            "stroke-opacity": c.alpha,
            "stroke-width": b,
          }),
        );
    } else {
      const lines = [
        [x, y, x + w, y],
        [x + w, y, x + w, y + h],
        [x, y + h, x + w, y + h],
        [x, y, x, y + h],
      ];
      widths.forEach((v, i) => {
        const c = v && paint(colors[i]);
        if (!c) return;
        const [x1, y1, x2, y2] = lines[i];
        g.append(
          create("line", {
            x1,
            y1,
            x2,
            y2,
            stroke: c.color,
            "stroke-opacity": c.alpha,
            "stroke-width": v,
          }),
        );
      });
    }
  }
  const ctx = doc.createElement("canvas").getContext("2d"),
    metrics = new Map();
  function textLine(g, text, rect, s) {
    if (!text || !rect.width || !rect.height) return;
    const c = paint(s.color);
    if (!c) return;
    const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    if (!metrics.has(font)) {
      ctx.font = font;
      const m = ctx.measureText("Mg");
      metrics.set(
        font,
        m.fontBoundingBoxAscent - m.fontBoundingBoxDescent ||
          parseFloat(s.fontSize) * 0.6,
      );
    }
    const t = create("text", {
      x: num(rect.left - box.left),
      y: num(rect.top - box.top + (rect.height + metrics.get(font)) / 2),
      textLength: num(rect.width),
      lengthAdjust: "spacingAndGlyphs",
      fill: c.color,
      "fill-opacity": c.alpha,
      "font-family": "sans",
      "font-size": s.fontSize,
      "font-weight": s.fontWeight,
      "font-style": s.fontStyle,
      "text-decoration":
        s.textDecorationLine === "none" ? undefined : s.textDecorationLine,
    });
    const runs = selectFonts({ text }, "sans");
    if (runs.length === 1) {
      t.setAttribute("font-family", runs[0].font);
      t.textContent = text;
    } else
      for (const run of runs) {
        const part = create("tspan", { "font-family": run.font });
        part.textContent = run.text;
        t.append(part);
      }
    g.append(t);
    words.push(text);
  }
  function lines(n, g, s) {
    const range = doc.createRange();
    let first, last, rect;
    function flush() {
      if (rect)
        textLine(g, n.data.slice(first, last).replace(/\s+/gu, " "), rect, s);
      rect = null;
    }
    function add(start, end, r) {
      if (!r.width || !r.height) return;
      if (rect && Math.abs(r.top - rect.top) > 1) flush();
      if (!rect) {
        first = start;
        rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      } else {
        const right = Math.max(rect.left + rect.width, r.right);
        rect.left = Math.min(rect.left, r.left);
        rect.width = right - rect.left;
      }
      last = end;
    }
    for (const m of n.data.matchAll(/\S+/gu)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const rects = range.getClientRects();
      if (rects.length === 1) add(m.index, m.index + m[0].length, rects[0]);
      else if (rects.length > 1) {
        // Even an unspaced word can wrap across several lines in a narrow card.
        let start = m.index;
        for (const char of m[0]) {
          range.setStart(n, start);
          range.setEnd(n, start + char.length);
          add(start, start + char.length, range.getBoundingClientRect());
          start += char.length;
        }
      }
    }
    flush();
  }
  function draw(el, parent) {
    if (el.matches(skip)) return;
    const r = el.getBoundingClientRect(),
      s = win.getComputedStyle(el);
    if (
      s.display === "none" ||
      s.visibility === "hidden" ||
      s.contentVisibility === "hidden" ||
      visuallyClipped(s) ||
      Number(s.opacity) === 0
    )
      return;
    const url =
        el.matches("a,[href],[role=link],[data-href],[data-url]") && linkOn(el),
      g = create("g");
    if (Number(s.opacity) < 1) g.setAttribute("opacity", s.opacity);
    parent.append(g);
    // Use the actual hit boxes even for a transparent thumbnail link. An
    // accessibility label is not painted content, and a cropped bitmap may
    // extend beyond the link's hit area underneath its clipping viewport.
    if (url)
      for (const hit of el.getClientRects()) {
        if (!hit.width || !hit.height) continue;
        const link = create("a", { href: url });
        link.append(
          create("rect", {
            x: num(hit.left - box.left),
            y: num(hit.top - box.top),
            width: num(hit.width),
            height: num(hit.height),
            fill: "none",
          }),
        );
        g.append(link);
      }
    const clipX = /hidden|clip|auto|scroll/.test(s.overflowX),
      clipY = /hidden|clip|auto|scroll/.test(s.overflowY);
    if ((clipX || clipY) && r.width && r.height) {
      const id = "box-" + defs.children.length;
      const clip = create("clipPath", { id });
      clip.append(
        create("rect", {
          x: clipX ? num(r.left - box.left) : 0,
          y: clipY ? num(r.top - box.top) : 0,
          width: num(clipX ? r.width : box.width),
          height: num(clipY ? r.height : box.height),
        }),
      );
      defs.append(clip);
      g.setAttribute("clip-path", `url(#${id})`);
    }
    if (el.matches("svg")) {
      const diagram = diagramSVG(el);
      if (diagram) {
        const svg = new win.DOMParser().parseFromString(
          diagram.svg,
          "image/svg+xml",
        ).documentElement;
        svg.setAttribute("x", num(r.left - box.left));
        svg.setAttribute("y", num(r.top - box.top));
        svg.setAttribute("width", num(r.width));
        svg.setAttribute("height", num(r.height));
        // CSS rotation is common on reusable arrow icons. The measured center already
        // includes translation; apply the linear transform to the unrotated icon.
        if (s.transform && s.transform !== "none") {
          const t = new win.DOMMatrix(s.transform),
            w = parseFloat(s.width),
            h = parseFloat(s.height);
          if (t.is2D && w > 0 && h > 0) {
            g.setAttribute(
              "transform",
              `translate(${num(r.left - box.left + r.width / 2)} ${num(r.top - box.top + r.height / 2)}) matrix(${t.a} ${t.b} ${t.c} ${t.d} 0 0) translate(${-w / 2} ${-h / 2})`,
            );
            svg.setAttribute("x", "0");
            svg.setAttribute("y", "0");
            svg.setAttribute("width", w);
            svg.setAttribute("height", h);
          }
        }
        g.append(doc.importNode(svg, true));
        return;
      }
    }
    shape(g, r, s);
    const bitmap = el.matches("img,canvas");
    if (bitmap || (s.backgroundImage.includes("url(") && imageSource(el))) {
      const asset = imageRef(el, s, r).image;
      if (!asset.display || asset.display.hidden) {
        if (bitmap) return;
      } else {
        const index =
          assets.push({
            ...asset,
            x: num(r.left - box.left + asset.display.left),
            y: num(r.top - box.top + asset.display.top),
          }) - 1;
        g.append(doc.createComment("asset-" + index));
        if (bitmap) return;
      }
    }
    const children =
      el.matches("slot") && el.assignedNodes().length
        ? el.assignedNodes({ flatten: true })
        : (el.shadowRoot || el).childNodes;
    for (const n of children) {
      if (n.nodeType === 1) draw(n, g);
      else if (n.nodeType === 3 && n.textContent.trim()) lines(n, g, s);
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = win.getComputedStyle(el, pseudo);
      const m = /^["']([↓↑→←⬇⬆▼▲›»]+)["']$/.exec(ps.content);
      if (!m) continue;
      // An empty connector element commonly paints its centered arrow via content.
      ctx.font = ps.font || `${ps.fontSize} sans-serif`;
      const w = ctx.measureText(m[1]).width;
      textLine(
        g,
        m[1],
        {
          left: r.left + (r.width - w) / 2,
          top: r.top,
          width: w,
          height: r.height || parseFloat(ps.lineHeight) || 16,
        },
        ps,
      );
    }
  }
  draw(root, out);
  if (!words.length) return null;
  return {
    type: "layout",
    text: words.join(" "),
    width: num(box.width),
    height: num(box.height),
    svg: new win.XMLSerializer().serializeToString(out),
    assets,
  };
}
export function printableLayoutSVG(block) {
  return block.svg.replace(/<!--asset-(\d+)-->/g, (_, n) => {
    const a = block.assets[n];
    if (!a) return "";
    const box = a.display || a;
    if (a.data && !a.display)
      return `<image x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" preserveAspectRatio="${a.fit}" href="${a.data}"/>`;
    if (a.data)
      return rasterViewport(
        a.x,
        a.y,
        box,
        imagePlacement(box, a.rasterWidth, a.rasterHeight),
        a.data,
      );
    // A long alternative or a tiny broken favicon must never paint over the
    // next column. Draw the unavailable-image indicator inside its own bounds.
    const size = Math.min(14, box.width, box.height);
    return `<svg x="${a.x + (box.width - size) / 2}" y="${a.y + (box.height - size) / 2}" width="${size}" height="${size}" viewBox="0 0 16 16"><title>${escaped(a.alt)}</title><g fill="none" stroke="#888" stroke-width="1"><rect x="1" y="2" width="14" height="12" rx="1"/><path d="m2 12 4-5 3 3 2-2 3 4"/></g></svg>`;
  });
}
