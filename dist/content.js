(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/modules/media.js
  function beginImages() {
    session = /* @__PURE__ */ new Map();
  }
  function endImages() {
    session = null;
  }
  function meaningfulImage(img) {
    if (img.closest(
      'nav,aside,form,[data-cge],[hidden],template,[data-testid*="avatar" i]'
    ))
      return false;
    const rect = img.getBoundingClientRect();
    return !(rect.width > 0 && rect.height > 0 && rect.width <= 24 && rect.height <= 24);
  }
  function imageSource(el) {
    if (el.tagName === "IMG")
      return el.currentSrc || el.getAttribute("src") || "";
    if (el.tagName === "CANVAS") return "";
    const css = el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage || "";
    const match = css.match(/^url\((["']?)(.*?)\1\)$/);
    return match?.[2] || "";
  }
  function imageRef(el) {
    const source = imageSource(el), alt = el.alt || el.getAttribute("aria-label") || "Image";
    if (!source && !canvasIds.has(el))
      canvasIds.set(el, "surface-" + crypto.randomUUID());
    const key = source || canvasIds.get(el);
    if (session && (source || el.tagName === "CANVAS"))
      session.set(key, { el, source });
    return { text: `[Image: ${alt}]`, image: { key, alt } };
  }
  function raster(el) {
    const width = el.naturalWidth || el.width, height = el.naturalHeight || el.height;
    if (!width || !height) throw new Error("Image has not loaded");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/png");
    if (data.length > 4e5) {
      const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = true;
      for (let i = 3; i < alpha.length; i += 4)
        if (alpha[i] !== 255) {
          opaque = false;
          break;
        }
      if (opaque) data = canvas.toDataURL("image/jpeg", 0.9);
    }
    return { data, width: canvas.width, height: canvas.height };
  }
  function decodeRaster(data) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,(.+)$/i.exec(
      data
    );
    if (!match) throw new Error("Invalid raster data");
    return createImageBitmap(
      new Blob([Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))], {
        type: match[1]
      })
    );
  }
  async function resolve(ref) {
    const item = session?.get(ref.key);
    if (!item) return null;
    try {
      if (item.el.tagName === "CANVAS") return raster(item.el);
      if (item.el.complete && (item.el.currentSrc || item.el.getAttribute("src")) === item.source)
        return raster(item.el);
    } catch {
    }
    try {
      let source = item.source;
      if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
        const url = new URL(source, location.href);
        if (url.protocol === "blob:" && url.origin === location.origin) {
          const response = await fetch(url.href);
          const blob = await response.blob();
          if (!response.ok || blob.size > 12e6) return null;
          const bitmap2 = await createImageBitmap(blob);
          try {
            return raster(bitmap2);
          } finally {
            bitmap2.close();
          }
        }
        const result = await chrome.runtime.sendMessage({
          type: "CGE_IMAGE",
          url: url.href
        });
        if (!result?.ok) return null;
        source = result.data;
      }
      const bitmap = await decodeRaster(source);
      try {
        return raster(bitmap);
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }
  async function embedImages(messages) {
    const cache = /* @__PURE__ */ new Map();
    async function visit(bs) {
      for (const b of bs) {
        if (b.type === "image") {
          const ref = b.image;
          if (!cache.has(ref.key)) cache.set(ref.key, await resolve(ref));
          b.image = { alt: ref.alt, ...cache.get(ref.key) };
        }
        if (b.blocks) await visit(b.blocks);
        if (b.items) for (const item of b.items) await visit(item);
        if (b.rows)
          for (const row of b.rows)
            for (const cell of row) await visit(cell.blocks);
      }
    }
    for (const m of messages) await visit(m.blocks);
  }
  function liftImages(bs) {
    return bs.flatMap((b) => {
      if (b.runs?.some((r) => r.image || r.diagram || r.widget)) {
        const out = [];
        let runs = [];
        const flush = () => {
          if (runs.length) out.push({ ...b, runs });
          runs = [];
        };
        for (const run2 of b.runs) {
          if (run2.diagram || run2.widget) {
            flush();
            out.push(run2.diagram || run2.widget);
          } else if (run2.image) {
            flush();
            out.push({ type: "image", image: run2.image, text: run2.text });
          } else runs.push(run2);
        }
        flush();
        return out;
      }
      if (b.items) b.items = b.items.map(liftImages);
      if (b.blocks) b.blocks = liftImages(b.blocks);
      if (b.rows)
        for (const row of b.rows)
          for (const c of row) c.blocks = liftImages(c.blocks);
      return [b];
    });
  }
  var session, canvasIds;
  var init_media = __esm({
    "src/modules/media.js"() {
      canvasIds = /* @__PURE__ */ new WeakMap();
    }
  });

  // src/modules/diagram.js
  function local(value, base) {
    if (!value.includes("url(")) return value;
    const match = /^url\(["']?([^"')]+)["']?\)$/.exec(value);
    if (!match) return null;
    const url = new URL(match[1], base);
    return url.href.split("#")[0] === base.split("#")[0] && url.hash ? "url(" + url.hash + ")" : null;
  }
  function diagramSVG(root) {
    const doc = root.ownerDocument, win = doc.defaultView;
    const box = root.viewBox?.baseVal;
    const width = box?.width || root.getBoundingClientRect().width;
    const height = box?.height || root.getBoundingClientRect().height;
    if (!(width > 0 && height > 0) || root.querySelectorAll("*").length > 12e3)
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
              rect.bottom - rect.height * 0.19
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
        if (geometry.has(a.name) || a.localName === "href" && /^#[\w:.-]+$/.test(a.value))
          copy.setAttribute(a.localName, a.value);
      }
      for (const prop of paint) {
        const value = local(css.getPropertyValue(prop) || "", doc.URL);
        if (prop === "stroke-dasharray" && value !== "none" && value?.split(/[ ,]+/).some((v) => !(parseFloat(v) > 0)))
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
      text: root.getAttribute("aria-label") || [...root.querySelectorAll("title,text,foreignObject")].map((n) => n.textContent.trim()).filter(Boolean).join(" ").slice(0, 1200) || "Diagram"
    };
  }
  var namespace, tags, geometry, paint;
  var init_diagram = __esm({
    "src/modules/diagram.js"() {
      namespace = "http://www.w3.org/2000/svg";
      tags = new Set(
        "svg g defs marker path rect circle ellipse line polyline polygon text tspan title desc clipPath linearGradient radialGradient stop use".split(
          " "
        )
      );
      geometry = new Set(
        "id viewBox preserveAspectRatio transform d x y x1 y1 x2 y2 dx dy r rx ry cx cy points width height refX refY markerWidth markerHeight markerUnits orient offset gradientUnits gradientTransform spreadMethod".split(
          " "
        )
      );
      paint = "fill stroke color stroke-width stroke-dasharray stroke-dashoffset stroke-linejoin stroke-linecap fill-rule fill-opacity stroke-opacity opacity text-anchor dominant-baseline font-size font-weight font-style marker-start marker-end marker-mid clip-path stop-color stop-opacity".split(
        " "
      );
    }
  });

  // src/modules/pdf-style.js
  function textAlignment(el) {
    let value = "", direction = "";
    for (let node = el; node && (!value || !direction); node = node.parentElement) {
      const css = view(node);
      value ||= css.textAlign || node.getAttribute("align") || "";
      direction ||= css.direction || node.getAttribute("dir") || "";
    }
    if (value === "start" || !value)
      return direction === "rtl" ? "right" : "left";
    if (value === "end") return direction === "rtl" ? "left" : "right";
    const physical = value.replace(/^-webkit-/, "");
    return ["left", "right", "center", "justify"].includes(physical) ? physical : "left";
  }
  function rgba(value, doc) {
    const match = value?.match(
      /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
    );
    if (match)
      return [
        +match[1],
        +match[2],
        +match[3],
        match[4] === void 0 ? 1 : +match[4]
      ];
    if (!value || value === "transparent") return [0, 0, 0, 0];
    if (!doc.defaultView.CSS?.supports("color", value)) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }
  function blend(fg, bg) {
    return bg.map(
      (v, i) => fg ? Math.round(fg[i] * fg[3] + v * (1 - fg[3])) : v
    );
  }
  function proseReader(root) {
    const cache = /* @__PURE__ */ new WeakMap();
    const baseColor = view(root).color;
    function read(el) {
      if (cache.has(el)) return cache.get(el);
      const parent = el === root || !el.parentElement ? {} : read(el.parentElement);
      const css = view(el), tag = el.tagName;
      const weight = css.fontWeight;
      const bold = weight ? weight === "bold" || weight === "bolder" || Number(weight) >= 600 : ["B", "STRONG"].includes(tag) || parent.bold;
      const italic = css.fontStyle ? /italic|oblique/.test(css.fontStyle) : ["I", "EM"].includes(tag) || parent.italic;
      const line = css.textDecorationLine || css.textDecoration || "";
      const strike = parent.strike || line.includes("line-through") || !line && ["DEL", "S", "STRIKE"].includes(tag);
      const underline = parent.underline || line.includes("underline") || !line && ["U", "INS"].includes(tag);
      let background = parent.background;
      if (css.display.startsWith("inline") || tag === "MARK" || tag === "SPAN") {
        const bg = rgba(css.backgroundColor, el.ownerDocument);
        if (bg?.[3])
          background = hex(
            blend(bg, background ? fromHex(background) : [255, 255, 255])
          );
      }
      let color;
      if (css.color && (css.color !== baseColor || background)) {
        const fg = rgba(css.color, el.ownerDocument);
        if (fg)
          color = hex(
            blend(fg, background ? fromHex(background) : [255, 255, 255])
          );
      }
      const result = {
        bold: bold || void 0,
        italic: italic || void 0,
        strike: strike || void 0,
        underline: underline || void 0,
        color,
        background
      };
      cache.set(el, result);
      return result;
    }
    return read;
  }
  function fromHex(color) {
    return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  }
  function readCode(pre) {
    const code = pre.tagName === "PRE" && pre.querySelectorAll("code").length === 1 ? pre.querySelector("code") : pre;
    const doc = pre.ownerDocument, colors = /* @__PURE__ */ new Map(), styles = /* @__PURE__ */ new WeakMap(), backgrounds = /* @__PURE__ */ new WeakMap();
    function parse(value) {
      if (!colors.has(value)) colors.set(value, rgba(value, doc));
      return colors.get(value);
    }
    function bg(el) {
      if (!el) return [255, 255, 255];
      if (!backgrounds.has(el))
        backgrounds.set(
          el,
          blend(parse(view(el).backgroundColor), bg(el.parentElement))
        );
      return backgrounds.get(el);
    }
    const base = hex(bg(code)), css = view(code);
    const size = parseFloat(css.fontSize) || 14;
    function tokenStyle(el) {
      if (styles.has(el)) return styles.get(el);
      const cs = view(el), back = bg(el);
      const foreground = parse(cs.color) || [32, 33, 36, 1];
      const style = {
        color: hex(blend(foreground, back)),
        bold: cs.fontWeight === "bold" || Number(cs.fontWeight) >= 600,
        italics: /italic|oblique/.test(cs.fontStyle)
      };
      if (hex(back) !== base) style.background = hex(back);
      if (cs.textDecorationLine?.includes("underline"))
        style.decoration = "underline";
      else if (cs.textDecorationLine?.includes("line-through"))
        style.decoration = "lineThrough";
      const tokenSize = parseFloat(cs.fontSize);
      if (tokenSize && tokenSize !== size) style.fontSize = tokenSize * 0.75;
      styles.set(el, style);
      return style;
    }
    const tokens = [];
    function emit(text, el) {
      if (!text) return;
      const style = tokenStyle(el), last = tokens.at(-1);
      if (last?.style === style) last.text += text;
      else tokens.push({ text, style });
    }
    function walk(parent) {
      let afterLine = false;
      for (const n of parent.childNodes) {
        if (n.nodeType === 3) {
          if (afterLine && !n.textContent.startsWith("\n")) emit("\n", parent);
          emit(n.textContent, parent);
          afterLine = false;
          continue;
        }
        if (n.nodeType !== 1 || n.matches(
          'button,[role="button"],[hidden],script,style,.sr-only,[data-cge],.cm-gutters,[data-line-number],[data-code-block-controls]'
        ))
          continue;
        const cs = view(n);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const line = n.matches(".cm-line") || cs.display === "block" || n.tagName === "DIV";
        if ((afterLine || line) && tokens.length && !tokens.at(-1).text.endsWith("\n"))
          emit("\n", parent);
        else if (afterLine && line) emit("\n", parent);
        afterLine = false;
        if (n.tagName === "BR") {
          if (!(parent.matches(".cm-line") && parent.childNodes.length === 1))
            emit("\n", parent);
        } else {
          walk(n);
          afterLine = line;
        }
      }
    }
    walk(code);
    const tab = css.tabSize || "8";
    const tabSize = tab.endsWith("px") ? parseFloat(tab) / (size * 0.602) : Number(tab);
    return {
      text: tokens.map((t) => t.text).join(""),
      tokens: tokens.map((t) => ({ text: t.text, ...t.style })),
      background: base,
      fontSize: size * 0.75,
      lineHeight: parseFloat(css.lineHeight) ? parseFloat(css.lineHeight) / (size * 1.164) : 1,
      tabSize: Number.isFinite(tabSize) ? Math.max(0, Math.round(tabSize)) : 8,
      alignment: textAlignment(code),
      language: code.className?.match?.(/(?:language|lang)-([\w+-]+)/)?.[1] || code.closest("[data-language]")?.dataset.language || ""
    };
  }
  var view, hex;
  var init_pdf_style = __esm({
    "src/modules/pdf-style.js"() {
      view = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
      hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    }
  });

  // src/modules/normalize.js
  var normalize_exports = {};
  __export(normalize_exports, {
    blocks: () => blocks,
    inline: () => inline,
    plainText: () => plainText,
    safeLink: () => safeLink,
    visible: () => visible
  });
  function safeLink(value, base = "https://chatgpt.com/") {
    try {
      const u = new URL(value, base);
      return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : void 0;
    } catch {
      return void 0;
    }
  }
  function visible(el) {
    if (el.nodeType !== 1) return true;
    if (el.closest('[hidden],[aria-hidden="true"],template,[data-cge]'))
      return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (!("style" in n)) continue;
      const s = n.ownerDocument.defaultView.getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden")
        return false;
    }
    return true;
  }
  function equation(el) {
    const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || el.getAttribute("data-math") || el.getAttribute("data-latex");
    if (tex) return { text: tex };
    const math = el.matches("math") ? el : el.querySelector("math");
    if (!math) return { text: el.textContent };
    const safe = math.cloneNode(true);
    safe.querySelectorAll("annotation,annotation-xml,mglyph,script,style,maction").forEach((n) => n.remove());
    for (const n of [safe, ...safe.querySelectorAll("*")]) {
      for (const a of [...n.attributes])
        if (![
          "display",
          "mathvariant",
          "stretchy",
          "fence",
          "accent",
          "accentunder",
          "columnalign",
          "rowalign",
          "linethickness",
          "movablelimits"
        ].includes(a.name))
          n.removeAttribute(a.name);
    }
    return { text: safe.textContent, mathml: safe.outerHTML };
  }
  function textRuns(text, style) {
    if (style.code) return [{ text, ...style }];
    const pattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|(?<![\\\w$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/g;
    const runs = [];
    let pos = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[4] && (!/[A-Za-z\\^_=+<>]/.test(match[4]) || /^\d[\s\S]*\b(and|or|to)\b/.test(match[4])))
        continue;
      if (match.index > pos)
        runs.push({ text: text.slice(pos, match.index), ...style });
      runs.push({
        text: match[0],
        ...style,
        math: true,
        display: !!(match[1] || match[3])
      });
      pos = match.index + match[0].length;
    }
    if (pos < text.length) runs.push({ text: text.slice(pos), ...style });
    return runs;
  }
  function controlRun(el) {
    const label = el.getAttribute("aria-label");
    if (el.matches(
      "input[type=checkbox], [role=checkbox],input[type=radio],[role=radio],[data-checked],svg.lucide-square-check,svg.lucide-square-check-big,svg.lucide-square"
    )) {
      const val = el.matches("input") ? el.indeterminate ? "mixed" : String(el.checked) : el.getAttribute("aria-checked") ?? el.getAttribute("data-checked") ?? String(
        el.matches("svg.lucide-square-check,svg.lucide-square-check-big")
      );
      const radio = el.matches("input[type=radio],[role=radio]");
      const mark = radio ? val === "true" ? "\u25C9" : "\u25CB" : val === "true" ? "\u2611" : val === "mixed" ? "\u229F" : "\u2610";
      const children = el.matches("[data-checked],[role=checkbox],[role=radio]") ? el.textContent.trim() : "";
      return {
        text: mark + " " + (children || label || "") + (children || label ? " " : ""),
        control: "check",
        checked: val
      };
    }
    if (el.matches("input[type=range],[role=slider],progress,meter")) {
      const val = el.value ?? el.getAttribute("aria-valuenow");
      const min = el.min || el.getAttribute("aria-valuemin") || 0;
      const max = el.max || el.getAttribute("aria-valuemax") || (el.matches("progress,meter") ? 1 : 100);
      const text = (label || (el.matches("progress,meter") ? "Progress" : "Slider")) + ": " + (el.getAttribute("aria-valuetext") || val || "0") + " (" + min + "\u2013" + max + ")";
      const fraction = (Number(val) - Number(min)) / (Number(max) - Number(min));
      return {
        text,
        widget: {
          type: "slider",
          text,
          fraction: Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
        }
      };
    }
    if (el.matches("select,input[type=number]")) {
      return {
        text: (label ? label + ": " : "") + (el.matches("select") ? [...el.selectedOptions].map((o) => o.label).join(", ") : el.value)
      };
    }
    return null;
  }
  function semanticRun(el) {
    const control = controlRun(el);
    if (control) return control;
    if (el.matches("canvas")) return imageRef(el);
    if (el.matches("svg") && !el.closest(".katex,mjx-container") && (el.matches("[aria-roledescription], [id*=mermaid i], [role=img]") || el.getBoundingClientRect().width >= 48 && el.getBoundingClientRect().height >= 32)) {
      const diagram = diagramSVG(el);
      if (diagram) return { text: diagram.text, diagram };
    }
    return null;
  }
  function inline(node, style = {}, read = proseReader(node.parentElement || node)) {
    if (node.nodeType === 3) {
      const parent = node.parentElement || node.getRootNode().host;
      const preserve = parent && (/pre|break-spaces/.test(
        parent.ownerDocument.defaultView.getComputedStyle(parent).whiteSpace
      ) || parent.closest(
        '[data-message-author-role="user"],[data-user-message-bubble="true"],[data-turn="user"]'
      ));
      return textRuns(
        preserve ? node.textContent : node.textContent.replace(/\s+/g, " "),
        { ...style, ...read(parent) }
      );
    }
    if (node.nodeType !== 1 || !visible(node)) return [];
    const semantic = semanticRun(node);
    if (semantic) return [semantic];
    if (node.matches('button,[role="button"]'))
      return [...node.querySelectorAll("img,canvas,svg")].flatMap((el) => {
        if (!visible(el) && !(el.matches("svg[aria-hidden=true]") && visible(node) && el.getBoundingClientRect().width >= 48))
          return [];
        if (el.matches("img")) return meaningfulImage(el) ? [imageRef(el)] : [];
        if (el.matches("svg") && el.getBoundingClientRect().width < 48) return [];
        const run2 = semanticRun(el);
        return run2 ? [run2] : [];
      });
    if (node.matches(OMIT)) return [];
    if (node.matches(".katex-display"))
      return [{ ...equation(node), ...style, math: true, display: true }];
    if (node.matches(equationSelector)) {
      const eq = equation(node);
      return [{ ...eq, text: `\\(${eq.text}\\)`, ...style, math: true }];
    }
    if (node.tagName === "BR") return [{ text: "\n", ...style }];
    if (node.tagName === "IMG")
      return meaningfulImage(node) ? [imageRef(node)] : [];
    const next = { ...style };
    if (node.tagName === "CODE") {
      const snippet = readCode(node);
      const prose = read(node);
      return snippet.tokens.map(
        ({ text, color, background, bold, italics, decoration, fontSize }) => ({
          ...next,
          text,
          code: true,
          bold,
          italic: italics,
          strike: prose.strike,
          underline: prose.underline,
          pdfStyle: {
            color,
            background: background || snippet.background,
            decoration,
            fontSize: fontSize || snippet.fontSize
          }
        })
      );
    }
    if (node.tagName === "SUP") next.sup = true;
    if (node.tagName === "SUB") next.sub = true;
    if (node.tagName === "A")
      next.link = safeLink(node.getAttribute("href"), node.ownerDocument.URL);
    return [...node.childNodes].flatMap((n) => inline(n, next, read));
  }
  function trimmed(runs) {
    const r = runs.filter((x) => x.text !== "");
    if (r.length) {
      r[0] = { ...r[0], text: r[0].text.replace(/^\s+/, "") };
      r[r.length - 1] = {
        ...r[r.length - 1],
        text: r[r.length - 1].text.replace(/\s+$/, "")
      };
    }
    return r.filter((x) => x.text !== "");
  }
  function listItem(el, read) {
    const item = blocks(el, read);
    const first = item[0]?.runs?.[0];
    if (!first || first.control === "check") return item;
    const literal = /^\[([ xX-])\]\s*/.exec(first.text);
    const state = el.hasAttribute("data-checked") ? el.getAttribute("data-checked") : literal?.[1];
    if (state != null) {
      if (literal) first.text = first.text.slice(literal[0].length);
      const mark = /^(true|x|checked)$/i.test(state) ? "\u2611" : /^(mixed|-)$/.test(state) ? "\u229F" : "\u2610";
      item[0].runs.unshift({ text: mark + " ", control: "check" });
    }
    return item;
  }
  function gallery(root, read) {
    if (!root.matches?.("div,section,article,figure") || root.children.length < 2)
      return null;
    const css = root.ownerDocument.defaultView.getComputedStyle(root);
    if (!/grid|flex/.test(css.display)) return null;
    const cards = [...root.children].filter(visible);
    if (cards.length < 2 || !cards.every(
      (el) => el.matches("img,svg,canvas") || el.querySelector("img,svg,canvas")
    ))
      return null;
    const rects = cards.map((el) => el.getBoundingClientRect());
    if (rects.some((rect) => rect.width < 32 || rect.height < 24)) return null;
    const columns = rects.filter(
      (rect) => Math.abs(rect.top - rects[0].top) < 3
    ).length;
    if (columns < 2 || columns > 4 || rects[1].left < rects[0].right - 1)
      return null;
    return {
      type: "gallery",
      columns,
      items: cards.map(
        (el) => el.matches("img,svg,canvas") ? [{ type: "paragraph", runs: inline(el, {}, read) }] : blocks(el, read)
      )
    };
  }
  function blocks(root, read = proseReader(root)) {
    const group = gallery(root, read);
    if (group) return [group];
    const out = [];
    let pending = [];
    const flush = () => {
      const runs = trimmed(pending);
      if (runs.length)
        out.push({
          type: "paragraph",
          runs,
          alignment: textAlignment(root.host || root)
        });
      pending = [];
    };
    for (const el of root.childNodes) {
      if (el.nodeType !== 1) {
        pending.push(...inline(el, {}, read));
        continue;
      }
      if (!visible(el)) continue;
      if (el.shadowRoot && !el.matches("[data-cge]") && !el.shadowRoot.querySelector("slot")) {
        flush();
        out.push(...blocks(el.shadowRoot, read));
        continue;
      }
      const semantic = semanticRun(el);
      if (semantic) {
        pending.push(semantic);
        continue;
      }
      if (el.matches("iframe")) {
        flush();
        const body = el.contentDocument?.body;
        const inner = body ? blocks(body) : [];
        out.push(
          ...inner.length ? inner : [
            {
              type: "paragraph",
              runs: [
                {
                  text: "[" + (el.title || "Embedded widget") + ": frame contents unavailable to this page.]"
                }
              ]
            }
          ]
        );
        continue;
      }
      if (el.matches('button,[role="button"]')) {
        pending.push(...inline(el, {}, read));
        continue;
      }
      if (el.matches(OMIT)) continue;
      if (el.matches(
        ".mermaid,[data-mermaid],code.language-mermaid,[data-mermaid-source]"
      ) && !el.querySelector("svg,pre")) {
        const source = el.getAttribute("data-mermaid-source") || el.getAttribute("data-mermaid") || el.textContent;
        if (source.trim()) {
          flush();
          out.push({ type: "diagram", source, text: source });
          continue;
        }
      }
      if (el.matches(
        ".katex-display,math[display=block],mjx-container[display=true]"
      ) || el.matches(equationSelector) && BLOCK.split(",").includes(el.tagName)) {
        flush();
        out.push({ type: "math", ...equation(el), alignment: textAlignment(el) });
        continue;
      }
      if (!BLOCK.split(",").includes(el.tagName) && !el.matches(".cm-content")) {
        pending.push(...inline(el, {}, read));
        continue;
      }
      flush();
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag))
        out.push({
          type: "heading",
          level: Number(tag[1]),
          alignment: textAlignment(el),
          runs: trimmed(inline(el, {}, read))
        });
      else if (tag === "PRE" || el.matches(".cm-content")) {
        const snippet = readCode(el), { text, language } = snippet;
        if (/^mermaid$/i.test(language) || !language && /^\s*(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)\b/.test(text))
          out.push({ type: "diagram", source: text, text });
        else if ((/^(math|latex|tex)$/i.test(language) || !language && /^\s*(?:\\\[[\s\S]*\\\]|\$\$[\s\S]*\$\$)\s*$/.test(text)) && !/\\(?:documentclass|usepackage|begin\{document\}|section|newcommand|textbf)/.test(
          text
        ) && /^(?:\s*\\[([]|\s*\$\$)|[=^_]|\\(?:frac|sqrt|sum|int|begin\{(?:align|equation|matrix))/.test(
          text
        ))
          out.push({ type: "math", text, fromCode: true });
        else out.push({ type: "code", ...snippet });
      } else if (tag === "UL" || tag === "OL") {
        out.push({
          type: "list",
          ordered: tag === "OL",
          start: tag === "OL" ? el.hasAttribute("start") ? el.start : el.reversed ? el.children.length : 1 : 1,
          reversed: !!el.reversed,
          listType: el.ownerDocument.defaultView.getComputedStyle(el).listStyleType,
          counters: [...el.children].filter((n) => n.tagName === "LI" && visible(n)).map((n) => n.hasAttribute("value") ? n.value : null),
          items: [...el.children].filter((n) => n.tagName === "LI" && visible(n)).map((n) => listItem(n, read))
        });
      } else if (tag === "TABLE") {
        const rows = [...el.rows].filter(visible).map(
          (row) => [...row.cells].map((cell) => ({
            blocks: blocks(cell, read),
            header: cell.tagName === "TH",
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan
          }))
        );
        if (rows.length) {
          const regular = [...el.rows].find(
            (row) => visible(row) && row.cells.length === rows[0].length && [...row.cells].every((cell) => cell.colSpan === 1)
          );
          const widths = regular && [...regular.cells].map((cell) => cell.getBoundingClientRect().width);
          const sum = widths?.reduce((a, b) => a + b, 0);
          const widthShares = sum > 0 && widths.every((w) => w > 0) ? widths.map((w) => w / sum) : void 0;
          out.push({ type: "table", rows, widthShares });
        }
      } else if (tag === "FIGURE" && el.querySelector("img,svg,canvas")) {
        out.push({ type: "figure", blocks: blocks(el, read) });
      } else if (tag === "BLOCKQUOTE")
        out.push({ type: "quote", blocks: blocks(el, read) });
      else if (tag === "HR") out.push({ type: "rule" });
      else if (tag === "P") {
        const runs = trimmed(inline(el, {}, read));
        if (runs.length)
          out.push({ type: "paragraph", runs, alignment: textAlignment(el) });
      } else out.push(...blocks(el, read));
    }
    flush();
    return out;
  }
  function plainText(bs) {
    return bs.map(
      (b) => b.text ?? (b.runs ? b.runs.map((r) => r.text).join("") : b.items ? b.items.map(plainText).join("\n") : b.rows ? b.rows.map((row) => row.map((c) => plainText(c.blocks)).join(" | ")).join("\n") : b.blocks ? plainText(b.blocks) : "")
    ).join("\n");
  }
  var OMIT, BLOCK, equationSelector;
  var init_normalize = __esm({
    "src/modules/normalize.js"() {
      init_diagram();
      init_pdf_style();
      init_media();
      OMIT = 'button,nav,[data-conversation-role]:is(h1,h2,h3,h4,h5,h6),.turn-action-controls,script,style,textarea,input,select,svg,[role="button"],[data-cge],[data-testid="thought-process"],[data-testid="reasoning"],.katex-html';
      BLOCK = "P,H1,H2,H3,H4,H5,H6,PRE,UL,OL,TABLE,BLOCKQUOTE,HR,DIV,SECTION,ARTICLE,FIGURE,FIGCAPTION,DETAILS,SUMMARY,FORM,FIELDSET";
      equationSelector = ".katex,math,[data-math],[data-latex],mjx-container";
    }
  });

  // src/content.js
  init_media();

  // src/modules/extractor.js
  init_media();
  init_normalize();
  var ROLE_SELECTOR = '[data-message-author-role="user"],[data-message-author-role="assistant"]';
  var unitAttrs = [
    "data-content-search-unit-key",
    "data-chatgpt-search-unit-key"
  ];
  var unitSelector = unitAttrs.flatMap(
    (attr) => ["user", "assistant"].map((role) => `[${attr}$=":${role}"]`)
  ).join(",");
  var turnSelector = '[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key],[data-testid^="conversation-turn-"],article';
  var modernBody = '[data-markdown-text-style="assistant-message"]';
  var userBubble = '[data-user-message-bubble="true"]';
  var roleContainer = '[data-conversation-role="assistant"],[data-conversation-role="user"]';
  var roleHeading = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  var unitKey = (el) => unitAttrs.map((attr) => el.getAttribute(attr)).find(Boolean);
  var generatedCard = '[data-testid*="imagegen" i],[data-testid*="image-gen" i],[data-testid*="generated-image" i],[data-generated-image],[data-content-search-unit-key$=":tool"],[data-chatgpt-search-unit-key$=":tool"],[class*="imagegen" i],[data-testid*="image-generation" i],[data-testid*="image-output" i],[data-message-author-role="tool"],[data-turn="tool"],[data-testid*="image_generation" i]';
  var generatedImgs = 'img[alt^="generated image" i],img[alt^="image generated" i],' + generatedCard.split(",").map((k) => k + " img").join(",");
  var adoptedTurns = /* @__PURE__ */ new WeakMap();
  var extraImages = /* @__PURE__ */ new WeakMap();
  var imageRoots = /* @__PURE__ */ new WeakSet();
  function visualRoots(el) {
    return [el, ...extraImages.get(el) || []].sort(
      (a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1
    );
  }
  function imageVisible(img) {
    if (!meaningfulImage(img)) return false;
    const turn = img.closest(turnSelector);
    if (turn && !visible(turn)) return false;
    const scope = img.closest(ROLE_SELECTOR + "," + unitSelector);
    if (scope && !visible(scope)) return false;
    for (let n = img; n; n = n.parentElement) {
      const css = getComputedStyleFor(n);
      if (css.display === "none" || css.visibility === "hidden" || css.contentVisibility === "hidden" || Number.parseFloat(css.opacity) === 0)
        return false;
      if (n !== img && n.getAttribute("aria-hidden") === "true" && !n.closest(generatedCard) && (!turn || !turn.contains(n) || n === turn || n.querySelector(ROLE_SELECTOR + "," + unitSelector)))
        return false;
    }
    return true;
  }
  function getComputedStyleFor(el) {
    return el.ownerDocument.defaultView.getComputedStyle(el);
  }
  var surfaces = "img,canvas,[role=img],[style*=background]," + generatedCard;
  function rasterSurface(el) {
    return el.tagName === "IMG" || el.tagName === "CANVAS" || !!imageSource(el);
  }
  function mediaIn(el) {
    return visualRoots(el).flatMap((n) => [n, ...n.querySelectorAll(surfaces)]).filter((n) => n.matches(surfaces) && rasterSurface(n) && imageVisible(n));
  }
  function large(el) {
    const r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) >= 48 || Math.min(el.naturalWidth || 0, el.naturalHeight || 0) >= 96;
  }
  function ready(el) {
    return el.tagName === "IMG" ? el.complete && el.naturalWidth > 0 : large(el);
  }
  function pairImage(el) {
    return mediaIn(el).at(-1) || null;
  }
  var slots = /* @__PURE__ */ new WeakMap();
  function removePairHost(host) {
    slots.get(host)?.remove();
    slots.delete(host);
    host.remove();
  }
  function mountPairHost(el, host, image) {
    const end = visualRoots(el).at(-1), turn = turnFor(el);
    if (image) {
      let anchor = turn.contains(end) ? turn : end;
      if (!turn.contains(end))
        while (anchor.parentElement && !anchor.parentElement.contains(turn) && !anchor.parentElement.matches("main,body,[role=main]"))
          anchor = anchor.parentElement;
      let slot = slots.get(host);
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.cge = "image-action-row";
        slot.style.cssText = "display:block;min-height:36px;";
        slots.set(host, slot);
      }
      anchor.after(slot);
      slot.append(host);
      host.style.cssText = "display:block";
      return;
    }
    slots.get(host)?.remove();
    slots.delete(host);
    host.style.cssText = "";
    if (el.closest('button,[role="button"],picture'))
      el.closest('button,[role="button"],picture').after(host);
    else el.append(host);
  }
  function exposed(el) {
    const r = el.getBoundingClientRect();
    let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyleFor(p);
      if (style.display === "contents") continue;
      const b = p.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
        top = Math.max(top, b.top + p.clientTop);
        bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight);
      }
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
        left = Math.max(left, b.left + p.clientLeft);
        right = Math.min(right, b.left + p.clientLeft + p.clientWidth);
      }
    }
    return { top, bottom, left, right };
  }
  function updateImageControl(image, host) {
    const slot = slots.get(host);
    if (!slot?.isConnected || !image?.isConnected) return;
    const row = exposed(slot), pic = exposed(image);
    if (row.bottom - row.top >= 32 && row.right - row.left >= 115 || pic.bottom - pic.top < 12 || pic.right - pic.left < 30) {
      if (host.parentElement !== slot) {
        slot.append(host);
        host.style.cssText = "display:block";
      }
      return;
    }
    if (host.parentElement !== document.body) document.body.append(host);
    host.style.cssText = `position:fixed;display:block;z-index:2147483645;left:${Math.max(4, Math.min(pic.left, innerWidth - 160))}px;top:${Math.max(4, Math.min(pic.bottom - 4, innerHeight - host.offsetHeight - 8))}px`;
  }
  function adjacentTurn(img, nodes) {
    const main = img.closest("main,[role=main],#thread") || img.ownerDocument.body;
    for (let card = img; card && card !== main; card = card.parentElement) {
      for (let prev = card.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (prev.matches("[data-cge],script,style,[hidden]")) continue;
        const last = nodes.filter((n) => prev === n || prev.contains(n)).at(-1);
        if (last) return turnFor(last);
        if (prev.matches(turnSelector)) return null;
        if (/^(?:image created|generated image|image generated|chatgpt said)[:.!\s]*$/i.test(
          prev.textContent.trim()
        ))
          continue;
        if (!prev.textContent.trim() && !prev.querySelector("img,iframe,canvas,video"))
          continue;
        return null;
      }
    }
    return null;
  }
  function messageRole(el) {
    if (imageRoots.has(el)) return "assistant";
    if (el.hasAttribute("data-message-author-role"))
      return el.dataset.messageAuthorRole;
    const key = unitKey(el);
    if (key && /:(user|assistant)$/.test(key)) return key.split(":").at(-1);
    if (el.matches(userBubble)) return "user";
    if (el.matches(modernBody)) return "assistant";
    return el.dataset.conversationRole || el.dataset.turn;
  }
  function messageNodes(root = document) {
    adoptedTurns = /* @__PURE__ */ new WeakMap();
    extraImages = /* @__PURE__ */ new WeakMap();
    imageRoots = /* @__PURE__ */ new WeakSet();
    const candidates = /* @__PURE__ */ new Set(), ancestors = /* @__PURE__ */ new Set();
    const groups = [
      ROLE_SELECTOR,
      unitSelector,
      roleContainer,
      userBubble,
      modernBody,
      '[data-turn="user"],[data-turn="assistant"]'
    ];
    for (const group of groups)
      for (const el of root.querySelectorAll(group)) {
        if (ancestors.has(el) || el.matches(roleHeading) || !visible(el) || el.closest('nav,aside,dialog,form,[role="navigation"]'))
          continue;
        if ((group === modernBody || group === userBubble) && !el.closest(turnSelector + "," + unitSelector))
          continue;
        let nested = false;
        for (let p = el; p; p = p.parentElement)
          if (candidates.has(p)) {
            nested = true;
            break;
          }
        if (nested) continue;
        candidates.add(el);
        for (let p = el.parentElement; p; p = p.parentElement) ancestors.add(p);
      }
    for (const img of root.querySelectorAll(surfaces)) {
      if (!rasterSurface(img)) continue;
      if (!imageVisible(img) || img.closest(
        userBubble + ',[data-turn="user"],[data-message-author-role="user"],[data-conversation-role="user"],[data-testid*="attachment" i]'
      ))
        continue;
      const list = [...candidates];
      if (list.some((el) => el.contains(img))) continue;
      const marked = img.matches(generatedImgs) || img.closest(
        '[data-message-author-role="tool"],[data-role="assistant"],[data-turn="assistant"]'
      );
      if (!marked && !large(img)) continue;
      const ownTurn = img.closest(turnSelector);
      const turn = ownTurn || adjacentTurn(img, list);
      if (!turn) continue;
      if (!marked && !list.some(
        (el) => turnFor(el) === turn && el.compareDocumentPosition(img) & 4
      )) {
        const previous = adjacentTurn(img, list);
        if (!ownTurn || !previous || !list.some(
          (el) => turnFor(el) === previous && messageRole(el) === "user"
        ))
          continue;
      }
      const peers = [...candidates].filter((el) => turnFor(el) === turn);
      const before = peers.filter((el) => el.compareDocumentPosition(img) & 4).at(-1);
      const next = peers.find((el) => img.compareDocumentPosition(el) & 4);
      const owner = before && messageRole(before) === "assistant" ? before : next && messageRole(next) === "assistant" ? next : null;
      if (owner) {
        extraImages.set(owner, [...extraImages.get(owner) || [], img]);
        continue;
      }
      const root2 = img.closest(
        unitAttrs.map((attr) => "[" + attr + "]").join(",") + "," + generatedCard
      ) || img.closest("button") || img;
      let candidate = root2;
      if (candidate.contains(turn) || peers.some((n) => candidate.contains(n)))
        candidate = img.closest("picture,button") || img;
      if (candidate.contains(turn) || peers.some((n) => candidate.contains(n)))
        continue;
      adoptedTurns.set(candidate, turn);
      extraImages.delete(candidate);
      imageRoots.add(candidate);
      candidates.add(candidate);
    }
    return [...candidates].sort(
      (a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1
    );
  }
  function turnFor(el) {
    return el.closest(turnSelector) || adoptedTurns.get(el) || el;
  }
  function turnIndex(el) {
    const turn = turnFor(el);
    const legacy = turn.getAttribute("data-testid")?.match(/^conversation-turn-(\d+)$/);
    const numbered = legacy || (turn.dataset.turnKey || turn.dataset.chatgptSearchTurnKey || turn.dataset.contentSearchTurnKey || unitKey(el) || "").match(/^fallback-turn-(\d+)(?::|$)/);
    return numbered ? Number(numbered[1]) : null;
  }
  function isStreaming(root = document) {
    return [
      ...root.querySelectorAll(
        '[data-testid="stop-button"],[data-testid="stop-generating-button"],button[aria-label="Stop generating" i],button[aria-label="Stop streaming" i],form[data-chatgpt-composer] button[aria-label="Stop" i],[data-is-streaming="true"],[aria-busy="true"][data-message-author-role]'
      )
    ].some(visible);
  }
  function completed(el, nodes = messageNodes(el.ownerDocument)) {
    if (messageRole(el) === "user") return true;
    if (el.closest('[data-is-streaming="true"],[aria-busy="true"]') || el.querySelector('[data-is-streaming="true"]'))
      return false;
    const idx = nodes.indexOf(el);
    if (idx === nodes.length - 1 && isStreaming(el.ownerDocument)) return false;
    const turn = turnFor(el);
    let last = idx;
    while (last >= 0 && last + 1 < nodes.length && messageRole(nodes[last + 1]) === "assistant" && turnFor(nodes[last + 1]) === turn)
      last++;
    if (last > idx) return completed(nodes[last], nodes);
    const followsAnswer = (action) => {
      if (action.closest("pre,code,[data-code-block-controls]")) return false;
      if (action.matches('button[aria-label="Copy" i]') && !action.dataset.testid && !action.closest(".turn-action-controls")) {
        if (!turn.matches(
          "[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key]"
        ) || el.contains(action) || action.closest(
          ".markdown,[data-markdown-text-style],[data-user-message-bubble]"
        ))
          return false;
      }
      if (el.contains(action)) return true;
      if (!(el.compareDocumentPosition(action) & 4)) return false;
      const next = nodes[idx + 1];
      return !next || Boolean(action.compareDocumentPosition(next) & 4);
    };
    if ([
      ...turn.querySelectorAll(
        '[data-testid="copy-turn-action-button"],[data-testid="good-response-turn-action-button"],[data-testid="bad-response-turn-action-button"],.turn-action-controls button,button[aria-label="Copy response" i],button[aria-label="Copy answer" i],button[aria-label="Copy" i]'
      )
    ].some((action) => visible(action) && followsAnswer(action)))
      return true;
    const images = mediaIn(el);
    if (images.length && images.every(ready) && (imageRoots.has(el) || images.some((img) => img.matches(generatedImgs) || large(img)) || !el.textContent.trim()) && !isStreaming(el.ownerDocument) && ![
      ...turn.querySelectorAll(
        '[aria-busy="true"],[data-is-streaming="true"],[role="progressbar"]'
      )
    ].some(visible))
      return true;
    if (el.dataset.isStreaming === "false" || turn.dataset.isStreaming === "false")
      return true;
    return nodes.slice(idx + 1).some((n) => messageRole(n) === "user");
  }
  function messageIdentity(el) {
    const role = messageRole(el);
    const key = unitKey(el.closest(unitSelector) || el);
    const unit = key?.match(/^(.+):(\d+):(user|assistant)$/);
    const group = turnFor(el).dataset.turnKey || turnFor(el).dataset.chatgptSearchTurnKey || turnFor(el).dataset.contentSearchTurnKey || unit?.[1] || null;
    return {
      role,
      group,
      unitKey: key || null,
      unitOrder: unit ? Number(unit[2]) : null,
      // An answer later in an explicitly grouped turn must use the prompt in that group.
      requiresSameGroup: role === "assistant" && Boolean(unit && Number(unit[2]) > 0),
      id: el.dataset.messageId || unitKey(el) || unitKey(el.closest(unitSelector) || el) || (turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId ? `${turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId}:${role}` : null),
      turnIndex: turnIndex(el)
    };
  }
  function transcriptRoots(el, nodes) {
    const roots = visualRoots(el), scope = el.closest(unitSelector) || turnFor(el);
    if (scope === el || nodes.some((peer) => peer !== el && scope.contains(peer)))
      return roots;
    for (const part of scope.querySelectorAll(".markdown," + modernBody)) {
      if (!visible(part) || roots.some((root) => root.contains(part) || part.contains(root)) || part.closest(
        'aside,nav,form,dialog,details,button,[hidden],[data-cge],[data-message-author-role="tool"],[data-message-author-role="user"],[data-turn="user"],[data-message-channel="analysis"],[data-testid*="reasoning" i],[data-testid*="thought" i]'
      ) || part.closest(turnSelector) !== el.closest(turnSelector))
        continue;
      roots.push(part);
    }
    return roots.sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
  }
  function extractMessage(el, order, nodes = messageNodes(el.ownerDocument)) {
    const role = messageRole(el);
    const body = role === "user" ? el.querySelector(userBubble) || el : el;
    const roots = role === "assistant" ? transcriptRoots(el, nodes) : [body];
    const content = liftImages(
      roots.flatMap((node) => {
        if (node.matches("img"))
          return [{ type: "paragraph", runs: [imageRef(node)] }];
        return blocks(node);
      })
    );
    const present = /* @__PURE__ */ new Set();
    function known(bs) {
      for (const b of bs) {
        if (b.image) present.add(b.image.key);
        if (b.blocks) known(b.blocks);
        if (b.items) b.items.forEach(known);
        if (b.rows) b.rows.forEach((row) => row.forEach((c) => known(c.blocks)));
      }
    }
    known(content);
    for (const img of role === "assistant" ? mediaIn(el) : []) {
      const ref = imageRef(img);
      if (!present.has(ref.image.key)) {
        content.push({ type: "image", ...ref });
        present.add(ref.image.key);
      }
    }
    const rich = roots.some(
      (n) => n.matches("img,canvas,iframe,video,audio,svg") || n.querySelector("img,canvas,iframe,video,audio,svg")
    );
    if (!content.length && rich)
      content.push({
        type: "paragraph",
        runs: [
          {
            text: "[Interactive content without a static representation.]"
          }
        ]
      });
    if (!content.length)
      throw new Error(
        `The ${role} message has no readable content. It may contain an unsupported rich element.`
      );
    const time = turnFor(el).querySelector("time[datetime]")?.getAttribute("datetime");
    return {
      ...messageIdentity(el),
      order,
      parentId: null,
      blocks: content,
      timestamp: time || null,
      hasMedia: rich,
      hasInteractive: roots.some(
        (n) => n.querySelector("video,audio") || n.matches("video,audio")
      )
    };
  }
  function associate(messages) {
    let user = null;
    return messages.map((m) => {
      if (m.role === "user") user = m;
      if (m.role === "assistant" && !user)
        throw new Error(
          "The preceding question is not loaded. Scroll up until it appears, then retry."
        );
      if (m.requiresSameGroup && m.group !== user?.group)
        throw new Error(
          "The question from this response\u2019s turn is not loaded. Scroll upward to reveal it and retry."
        );
      return {
        ...m,
        parentId: m.role === "assistant" ? user.id || `turn:${user.turnIndex ?? user.order}` : null
      };
    });
  }
  function extractPair(target, root = document) {
    const nodes = messageNodes(root), idx = nodes.indexOf(target);
    if (idx < 0 || !completed(target, nodes))
      throw new Error(
        "No completed response found. Wait for generation to finish."
      );
    let u = idx - 1;
    while (u >= 0 && messageRole(nodes[u]) !== "user") u--;
    if (u < 0)
      throw new Error(
        "The corresponding question is not loaded. Scroll up to reveal it, then retry."
      );
    const a = turnIndex(nodes[u]), b = turnIndex(target);
    const between = nodes.slice(u, idx + 1).map(turnIndex);
    if (a !== null && b !== null && between.every((x) => x !== null)) {
      const unique = [...new Set(between)];
      for (let i = 1; i < unique.length; i++)
        if (unique[i] !== unique[i - 1] + 1)
          throw new Error(
            "There is a gap between this response and the visible question. Reveal the missing turns first."
          );
    }
    return associate([
      extractMessage(nodes[u], 0, nodes),
      extractMessage(target, 1, nodes)
    ]);
  }
  function historyKey(message) {
    if (message.unitKey)
      return JSON.stringify([message.role, "unit", message.unitKey]);
    if (message.id) return JSON.stringify([message.role, "id", message.id]);
    if (message.turnIndex !== null)
      return JSON.stringify([message.role, "turn", message.turnIndex]);
    return null;
  }
  function snapshot(root = document) {
    const nodes = messageNodes(root);
    if (!nodes.length)
      throw new Error(
        "No conversation detected. Open a ChatGPT conversation and refresh the page."
      );
    if (nodes.some((n) => !completed(n, nodes)))
      throw new Error(
        "A response is incomplete or its completion cannot be verified. Wait for completion and retry."
      );
    const result = nodes.map(extractMessage);
    const seen = /* @__PURE__ */ new Map();
    return result.filter((m) => {
      const key = historyKey(m);
      if (!key) return true;
      const prior = seen.get(key);
      if (prior && plainText(prior.blocks) !== plainText(m.blocks))
        throw new Error(
          "Conflicting versions of a message are visible. Refresh the page and retry."
        );
      if (prior) return false;
      seen.set(key, m);
      return true;
    });
  }
  function title(root = document) {
    const selected = root.querySelector(
      'nav a[aria-current="page"],nav a[data-active="true"]'
    );
    return (selected?.textContent || root.title || "ChatGPT Conversation").replace(/\s*[-|–]\s*ChatGPT\s*$/, "").trim() || "ChatGPT Conversation";
  }

  // src/modules/history.js
  init_normalize();
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function scrollContainer(root = document) {
    let node = messageNodes(root)[0]?.parentElement;
    while (node && node !== root.body) {
      const style = root.defaultView.getComputedStyle(node);
      if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10)
        return node;
      node = node.parentElement;
    }
    return root.scrollingElement;
  }
  async function collectHistory({
    signal,
    onProgress = () => {
    },
    timeout = 45e3
  } = {}) {
    const route2 = location.href, scroller = scrollContainer(), original = scroller.scrollTop;
    const start = Date.now(), seen = /* @__PURE__ */ new Map();
    let previous = [];
    class ChangedDuringScan extends Error {
    }
    let uncertain = false, everUnmounted = false;
    const oldBehavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = "auto";
    function guard() {
      if (signal?.aborted) throw new Error("Export cancelled.");
      if (location.href !== route2)
        throw new Error(
          "The conversation changed during collection. Retry on the intended conversation."
        );
      if (Date.now() - start > timeout)
        throw new Error(
          "History collection exceeded 45 seconds. Scroll to load older messages and retry, or export individual pairs."
        );
      if (isStreaming())
        throw new Error(
          "A response started streaming during collection. Wait for it to finish."
        );
    }
    function read() {
      guard();
      const current = snapshot();
      const indexed = current.every((m) => m.turnIndex !== null);
      if (!indexed) uncertain = true;
      const keys = /* @__PURE__ */ new Set();
      for (const m of current) {
        const key = historyKey(m);
        if (!key)
          throw new Error(
            "Stable message identifiers are unavailable. Full-history collection is unsafe; use individual export."
          );
        keys.add(key);
        const prior = seen.get(key);
        if (prior && (prior.turnIndex !== m.turnIndex || plainText(prior.blocks) !== plainText(m.blocks)))
          throw new ChangedDuringScan(
            "The conversation kept changing during both history scans. Finish editing or generating the reply and retry."
          );
        seen.set(key, m);
      }
      for (const old of previous) {
        if (old.turnIndex === null || keys.has(historyKey(old))) continue;
        if (current.some(
          (m) => m.turnIndex === old.turnIndex && m.role === old.role && (old.unitOrder == null || m.unitOrder === old.unitOrder) && !previous.some((p) => historyKey(p) === historyKey(m))
        ))
          throw new ChangedDuringScan(
            "The active branch kept changing during history collection. Finish switching answers and retry."
          );
      }
      previous = current;
      if ([...seen.keys()].some((k) => !keys.has(k))) everUnmounted = true;
      if (!indexed && everUnmounted)
        throw new Error(
          "This page virtualizes messages without ordered turn identifiers. A reliable complete export is unavailable."
        );
      onProgress(`Collecting history\u2026 ${seen.size} messages (Escape cancels)`);
      return current;
    }
    async function scan2() {
      read();
      let topStable = 0, last = "";
      while (topStable < 3) {
        guard();
        scroller.scrollTop = 0;
        await sleep(550);
        const ms = read();
        const state = `${ms[0].id}:${ms.length}:${scroller.scrollHeight}`;
        topStable = state === last && scroller.scrollTop < 5 ? topStable + 1 : 0;
        last = state;
      }
      let bottomStable = 0;
      while (bottomStable < 3) {
        guard();
        const before = scroller.scrollTop;
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          before + Math.max(200, scroller.clientHeight * 0.7)
        );
        await sleep(350);
        read();
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        bottomStable = atBottom ? bottomStable + 1 : 0;
      }
      const result = everUnmounted ? [...seen.values()] : read();
      if (result.every((m) => m.turnIndex !== null)) {
        result.sort(
          (a, b) => a.turnIndex - b.turnIndex || (a.role === b.role ? (a.unitOrder ?? 0) - (b.unitOrder ?? 0) : a.role === "user" ? -1 : 1)
        );
        const ids = [...new Set(result.map((m) => m.turnIndex))];
        if (ids[0] > 1) uncertain = true;
        for (let i = 1; i < ids.length; i++)
          if (ids[i] !== ids[i - 1] + 1)
            throw new Error(
              "Missing conversation turns were detected. Scroll through the missing history and retry."
            );
      }
      return {
        messages: associate(result.map((m, i) => ({ ...m, order: i }))),
        uncertain,
        everUnmounted
      };
    }
    try {
      try {
        return await scan2();
      } catch (error) {
        if (!(error instanceof ChangedDuringScan)) throw error;
        seen.clear();
        previous = [];
        uncertain = false;
        everUnmounted = false;
        onProgress("The page updated. Checking the settled conversation again\u2026");
        await sleep(350);
        return await scan2();
      }
    } finally {
      if (location.href === route2) scroller.scrollTop = original;
      scroller.style.scrollBehavior = oldBehavior;
    }
  }

  // src/modules/ui.js
  var CSS = `
:host{all:initial;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#172335;color-scheme:light;--ink:#172335;--accent:#146d62}
*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer;border:1px solid #cfd8df;background:#fff;color:var(--ink);border-radius:8px;padding:7px 11px}button:hover{background:#edf6f4}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #3aa694;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.primary:hover{background:#0c594f}.pair{display:inline-block;margin:8px 0}.menu[hidden]{display:none}.menu{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.toolbar{position:fixed;right:12px;top:min(62px,9vh);max-width:calc(100vw - 24px);max-height:var(--cge-room,80vh);overflow:auto;z-index:2147483645;box-shadow:0 5px 24px #0002;border:1px solid #d8e3e0;background:#fff;border-radius:12px;padding:9px}.toolbar>div{display:flex;gap:6px}.status{max-width:320px;white-space:pre-wrap;font-size:12px;margin-top:7px}.status:empty{display:none}.status[data-state=error]{color:#a51c30}.status[data-state=success]{color:#08644d}dialog{color:var(--ink);background:#fff;border:1px solid #d8e3e0;border-radius:16px;padding:24px;width:min(520px,90vw);box-shadow:0 20px 90px #0004}dialog::backdrop{background:#14202a77}h2{font-size:20px;margin:0 0 12px}p{margin:10px 0}.preview{background:#f2f5f7;border-radius:8px;padding:12px;max-height:160px;overflow:auto;white-space:pre-wrap}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.small{font-size:12px;color:#536472}.check{display:flex;align-items:start;gap:8px}a{color:#146d62}
.toolbar{display:grid;grid-template-columns:32px minmax(32px,auto);align-items:center;gap:4px;padding:5px}
.toolbar[hidden]{display:none}.toolbar>.pair{display:contents}.toolbar>.pair>button{grid-area:1/1}.toolbar>button{grid-area:1/2;justify-self:start}
.toolbar .menu{grid-row:2;grid-column:1/-1;margin:0}.toolbar>.status{grid-column:1/-1;display:block;margin:0;padding:3px}.toolbar>.status:empty{display:none}
button.glyph{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:6px}.glyph svg{width:18px;height:18px}
`;
  function positionToolbar(toolbar2) {
    let composer, frame;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.querySelector(
          'form[data-chatgpt-composer],#prompt-textarea,[contenteditable="true"][role="textbox"]'
        );
        const next = input?.closest("form,[data-chatgpt-composer]") || input;
        if (next !== composer) {
          observer2.disconnect();
          composer = next;
          if (composer) observer2.observe(composer);
        }
        const box = composer?.getBoundingClientRect();
        const top = Math.min(62, innerHeight * 0.09);
        const edge = box && box.height && box.right > innerWidth - 360 ? Math.min(innerHeight, box.top) : innerHeight;
        const room = Math.floor(edge - top - 12);
        toolbar2.style.setProperty("--cge-room", Math.max(0, room) + "px");
        toolbar2.hidden = room < 46;
      });
    };
    const observer2 = new ResizeObserver(refresh);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    refresh();
    return refresh;
  }
  function mount(parent, className) {
    const host = document.createElement("div");
    host.dataset.cge = className;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.append(style);
    parent?.append(host);
    return { host, shadow };
  }
  function button(text, fn, primary = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (primary) b.className = "primary";
    b.addEventListener("click", fn);
    return b;
  }
  var glyphs = {
    download: "M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5",
    settings: "M10 3h4l.6 2.3 2 .9 2.2-.8 2 3.4-1.6 1.6.2 2.3 1.5 1.7-2 3.4-2.2-.7-2 .9L14 21h-4l-.7-2.4-2-.9-2.1.7-2-3.4 1.6-1.7v-2.4L3.2 9l2-3.4 2.2.8 2-.9L10 3z M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0",
    pdf: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8m-8 4h6",
    docx: "M5 2h9l5 5v15H5z M14 2v6h5 M7.5 11l2 7 2.5-5 2.5 5 2-7"
  };
  function iconButton(b, icon, label) {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", glyphs[icon]);
    svg.append(path);
    b.replaceChildren(svg);
    b.classList.add("glyph");
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
  }
  function menu(shadow, label, onExport) {
    const wrap = document.createElement("div");
    wrap.className = "pair";
    const trigger = button(label, () => {
      options.hidden = !options.hidden;
      trigger.setAttribute("aria-expanded", String(!options.hidden));
      if (!options.hidden) pdf.focus();
    });
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", label);
    const options = document.createElement("div");
    options.className = "menu";
    options.hidden = true;
    const run2 = (format) => {
      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      onExport(format);
    };
    const pdf = button("PDF", () => run2("pdf")), word = button("Word (.docx)", () => run2("docx"));
    if (shadow.classList?.contains("toolbar")) {
      iconButton(trigger, "download", label);
      iconButton(pdf, "pdf", "PDF");
      iconButton(word, "docx", "Word (.docx)");
      pdf.title = "Formatted PDF";
      word.title = "Word document";
    }
    options.append(pdf, word);
    wrap.append(trigger, options);
    shadow.append(wrap);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) {
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    return () => {
    };
  }
  async function review(shadow, data, format, settings) {
    const dialog = document.createElement("dialog");
    const h = document.createElement("h2");
    h.textContent = "Review conversation export";
    const p = document.createElement("p");
    p.textContent = `Collected ${data.messages.length} messages from the displayed branch. Check the beginning and end before downloading.`;
    const preview = document.createElement("div");
    preview.className = "preview";
    const { plainText: plainText2 } = await Promise.resolve().then(() => (init_normalize(), normalize_exports));
    preview.textContent = `FIRST: ${plainText2(data.messages[0].blocks).slice(0, 220)}

LAST: ${plainText2(data.messages.at(-1).blocks).slice(0, 220)}`;
    const note = document.createElement("p");
    note.className = "small";
    note.textContent = "ChatGPT does not expose a DOM-only guarantee of complete history. Hidden branches are excluded. Equations are typeset where supported. Formatted exports embed readable images. " + (!settings.includeUsers ? "Your settings exclude user messages. " : "") + (!settings.includeCode ? "Your settings exclude code blocks. " : "");
    const label = document.createElement("label");
    label.className = "check";
    const check = document.createElement("input");
    check.type = "checkbox";
    label.append(
      check,
      document.createTextNode(
        "I have checked that the collected range is the one I want to export."
      )
    );
    const actions = document.createElement("div");
    actions.className = "actions";
    return new Promise((resolve2) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        dialog.close();
        dialog.remove();
        resolve2(value);
      };
      const cancel = button("Cancel", () => finish(false));
      const go = button(
        `Download ${format === "docx" ? "Word" : "PDF"}`,
        () => finish(true),
        true
      );
      go.disabled = true;
      check.addEventListener("change", () => go.disabled = !check.checked);
      actions.append(cancel, go);
      dialog.append(h, p, preview, note, label, actions);
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(false);
      });
      shadow.append(dialog);
      dialog.showModal();
    });
  }

  // src/content.js
  init_normalize();

  // src/modules/settings.js
  var DEFAULTS = Object.freeze({
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
    showPdfTitle: false,
    includeTimestamps: false,
    includeUsers: true,
    includeCode: true,
    saveAs: false
  });
  function normalizeSettings(input = {}) {
    const s = { ...DEFAULTS };
    if (["sans", "serif", "mono"].includes(input.font)) s.font = input.font;
    if (["portrait", "landscape"].includes(input.orientation))
      s.orientation = input.orientation;
    for (const [key, min, max] of [
      ["fontSize", 8, 18],
      ["margin", 24, 90]
    ]) {
      const v = Number(input[key]);
      if (Number.isFinite(v)) s[key] = Math.min(max, Math.max(min, v));
    }
    for (const key of [
      "includeTitle",
      "showPdfTitle",
      "includeTimestamps",
      "includeUsers",
      "includeCode",
      "saveAs"
    ])
      if (typeof input[key] === "boolean") s[key] = input[key];
    return s;
  }
  async function getSettings() {
    return normalizeSettings(
      (await chrome.storage.local.get("settings")).settings
    );
  }

  // src/content.js
  var busy = false;
  var route = location.href;
  var scheduled;
  var controller;
  var pairs = /* @__PURE__ */ new Map();
  var panel = mount(document.body, "toolbar");
  var toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  panel.shadow.append(toolbar);
  var updateToolbarPosition = positionToolbar(toolbar);
  menu(toolbar, "Export conversation", (format) => run("conversation", format));
  toolbar.append(
    iconButton(
      button(
        "Settings",
        () => chrome.runtime.sendMessage({ type: "CGE_SETTINGS" })
      ),
      "settings",
      "Settings"
    )
  );
  var status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  toolbar.append(status);
  function feedback(text, state = "working") {
    status.textContent = text;
    status.dataset.state = state;
  }
  async function run(scope, format, target) {
    if (busy) {
      feedback("An export is already in progress.");
      return;
    }
    busy = true;
    beginImages();
    controller = new AbortController();
    const startRoute = location.href;
    const stop = (e) => {
      if (e.key === "Escape") controller.abort();
    };
    document.addEventListener("keydown", stop);
    try {
      feedback(
        scope === "pair" ? "Extracting this question and answer\u2026" : "Loading conversation history\u2026 (Escape cancels)"
      );
      let messages;
      if (scope === "pair") messages = extractPair(target);
      else {
        const data = await collectHistory({
          signal: controller.signal,
          onProgress: feedback
        });
        document.removeEventListener("keydown", stop);
        if (!await review(panel.shadow, data, format, await getSettings())) {
          feedback("Export cancelled.");
          return;
        }
        messages = data.messages;
        const keys = new Map(messages.map((m) => [historyKey(m), m]));
        for (const current of snapshot()) {
          const prior = keys.get(historyKey(current));
          if (!prior || prior.turnIndex !== current.turnIndex || plainText(prior.blocks) !== plainText(current.blocks))
            throw new Error(
              "The conversation changed during review. Please retry."
            );
        }
      }
      if (location.href !== startRoute)
        throw new Error("The conversation changed. Please retry.");
      const model = {
        scope,
        title: title(),
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        messages
      };
      await embedImages(messages);
      if (controller.signal.aborted || location.href !== startRoute)
        throw new Error("Export cancelled or conversation changed.");
      if (JSON.stringify(model).length > 2e7)
        throw new Error(
          "This export exceeds the 20 MB local limit. Export smaller question\u2013answer pairs."
        );
      const response = await chrome.runtime.sendMessage({
        type: "CGE_EXPORT",
        format,
        document: model
      });
      if (!response?.ok)
        throw new Error(
          response?.error || "The extension did not respond. Refresh ChatGPT and retry."
        );
    } catch (e) {
      feedback(e.message || "Export failed.", "error");
    } finally {
      endImages();
      busy = false;
      scan();
      document.removeEventListener("keydown", stop);
      controller = null;
    }
  }
  function scan() {
    if (route !== location.href) {
      route = location.href;
      controller?.abort();
      feedback("");
      for (const [el, entry] of pairs) {
        entry.cleanup();
        removePairHost(entry.host);
      }
      pairs.clear();
    }
    const nodes = messageNodes();
    for (const [el, entry] of pairs)
      if (!entry.host.isConnected || !el.isConnected || !nodes.includes(el) || !completed(el, nodes)) {
        entry.cleanup();
        removePairHost(entry.host);
        pairs.delete(el);
      }
    for (const el of nodes) {
      if (messageRole(el) !== "assistant" || pairs.has(el) || !completed(el, nodes))
        continue;
      const ui = mount(null, "pair");
      const image = pairImage(el);
      mountPairHost(el, ui.host, image);
      const cleanup = menu(
        ui.shadow,
        "\u2193 Export this Q&A",
        (format) => run("pair", format, el)
      );
      pairs.set(el, { ...ui, cleanup, image, anchor: visualRoots(el).at(-1) });
    }
    for (const [el, entry] of pairs) {
      const end = visualRoots(el).at(-1);
      const image = pairImage(el);
      if (entry.anchor !== end || entry.image !== image) {
        mountPairHost(el, entry.host, image);
        entry.image = image;
        entry.anchor = end;
      }
    }
    queueImagePositions();
    updateToolbarPosition();
    if (!panel.host.isConnected) document.body.append(panel.host);
    panel.host.style.display = nodes.length || /\/(?:c|share)\//.test(location.pathname) ? "block" : "none";
    if (!nodes.length && !busy)
      feedback(
        "No readable messages detected yet. Open a conversation with a finished reply."
      );
    else if (status.textContent.startsWith("No readable messages detected"))
      feedback("");
  }
  var imageFrame = 0;
  function queueImagePositions() {
    if (imageFrame) return;
    imageFrame = requestAnimationFrame(() => {
      imageFrame = 0;
      for (const entry of pairs.values())
        if (entry.image) updateImageControl(entry.image, entry.host);
    });
  }
  window.addEventListener("scroll", queueImagePositions, {
    capture: true,
    passive: true
  });
  window.addEventListener("resize", queueImagePositions);
  function queueScan() {
    if (!scheduled)
      scheduled = setTimeout(() => {
        scheduled = null;
        scan();
      }, 150);
  }
  var observer = new MutationObserver((records) => {
    if (records.some(
      (r) => r.target.nodeType !== 1 || !r.target.closest("[data-cge]")
    ))
      queueScan();
  });
  var watch = {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "data-message-id",
      "data-message-author-role",
      "data-content-search-unit-key",
      "data-chatgpt-search-unit-key",
      "data-turn",
      "data-turn-key",
      "data-markdown-text-style",
      "data-conversation-role",
      "data-is-streaming",
      "aria-busy",
      "hidden",
      "aria-hidden",
      "src",
      "srcset",
      "style",
      "class",
      "data-testid",
      "aria-label",
      "data-generated-image"
    ]
  };
  observer.observe(document.body, watch);
  document.addEventListener(
    "load",
    (e) => {
      if (e.target?.tagName === "IMG") queueScan();
    },
    true
  );
  document.addEventListener(
    "transitionend",
    (e) => {
      if (e.propertyName === "opacity" && !e.target.closest("[data-cge]"))
        queueScan();
    },
    true
  );
  scan();
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === "CGE_STATUS") {
      feedback(msg.text, msg.state);
      return;
    }
    if (msg?.type === "CGE_PROBE") {
      reply({ ok: true, messages: messageNodes().length, busy });
      return;
    }
    if (msg?.type === "CGE_REQUEST") {
      if (busy) {
        reply({ ok: false, error: "Another export is running." });
        return;
      }
      reply({ ok: true });
      void run("conversation", msg.format);
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      observer.disconnect();
      clearTimeout(scheduled);
      controller?.abort();
      for (const entry of pairs.values()) entry.cleanup();
    },
    { once: true }
  );
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      observer.observe(document.body, watch);
      scan();
    }
  });
})();
