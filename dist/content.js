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
  function imgURLs(el) {
    const lazy = el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || el.getAttribute("data-original");
    const current = el.currentSrc || el.getAttribute("src");
    const picture = el.parentElement?.matches("picture") ? [...el.parentElement.querySelectorAll("source")].filter(
      (n) => !n.media || el.ownerDocument.defaultView.matchMedia(n.media).matches
    ) : [];
    const sets = [...picture, el].flatMap((n) => [n.getAttribute("srcset"), n.getAttribute("data-srcset")]).filter(Boolean);
    const sizes = sets.flatMap(
      (set) => set.split(/,\s*(?=[^,]+\s+[\d.]+[wx])/).map((v) => v.trim().split(/\s/)[0]).reverse()
    );
    const deferred = lazy || sizes.length;
    const placeholder = !current || current.startsWith("data:") && !el.naturalWidth || el.complete && el.naturalWidth <= 2;
    const values = deferred && placeholder ? [lazy, ...sizes] : [current, lazy, ...sizes, el.getAttribute("src")];
    return [
      ...new Set(
        values.filter(Boolean).map((value) => {
          try {
            return new URL(value, el.ownerDocument.baseURI).href;
          } catch {
            return "";
          }
        }).filter(Boolean)
      )
    ];
  }
  function imageSource(el) {
    if (el.tagName === "IMG") return imgURLs(el)[0] || "";
    if (el.tagName === "CANVAS") return "";
    const css = el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage || "";
    return css.match(/url\((["']?)(.*?)\1\)/)?.[2] || "";
  }
  function imageRef(el) {
    const source = imageSource(el), alt = el.alt || el.getAttribute("aria-label") || "Image";
    if (!source && !canvasIds.has(el))
      canvasIds.set(el, "surface-" + crypto.randomUUID());
    const key = source || canvasIds.get(el);
    if (session && (source || el.tagName === "CANVAS")) {
      const old = session.get(key);
      const item = {
        el,
        source,
        urls: el.tagName === "IMG" ? imgURLs(el) : [source],
        pixels: old?.pixels,
        tried: old?.tried
      };
      if (!item.pixels && item.tried !== el && (el.tagName === "CANVAS" || el.complete && el.naturalWidth > 1 && el.currentSrc === source)) {
        try {
          item.pixels = raster(el);
        } catch {
        }
        item.tried = el;
      }
      session.set(key, item);
    }
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
    if (item.pixels) return item.pixels;
    if (item.el.tagName === "IMG" && !item.el.complete && item.el.currentSrc === item.source) {
      await Promise.race([
        item.el.decode().catch(() => {
        }),
        new Promise((r) => setTimeout(r, 1600))
      ]);
    }
    if (item.el.tagName === "CANVAS" || item.el.complete && item.el.naturalWidth > 1 && item.el.currentSrc === item.source) {
      try {
        return raster(item.el);
      } catch {
      }
    }
    let permissionOrigin;
    for (let source of item.urls) {
      try {
        const u = new URL(source, item.el.ownerDocument.baseURI);
        let bitmap;
        if (u.protocol === "blob:" && u.origin === item.el.ownerDocument.location.origin) {
          const response = await fetch(u.href);
          const blob = await response.blob();
          if (!response.ok || blob.size > 12e6) continue;
          bitmap = await createImageBitmap(blob);
        } else {
          if (!/^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(source)) {
            if (u.protocol !== "https:") continue;
            const result = await chrome.runtime.sendMessage({
              type: "CGE_IMAGE",
              url: u.href
            });
            if (!result?.ok) {
              permissionOrigin ||= result?.permissionOrigin;
              continue;
            }
            source = result.data;
          }
          bitmap = await decodeRaster(source);
        }
        try {
          return raster(bitmap);
        } finally {
          bitmap.close();
        }
      } catch {
      }
    }
    return permissionOrigin ? { permissionOrigin } : null;
  }
  async function embedImages(messages, { requestAccess, format, signal } = {}) {
    const slots2 = /* @__PURE__ */ new Map(), pixels = /* @__PURE__ */ new Map();
    function add(ref, set) {
      if (!slots2.has(ref.key)) slots2.set(ref.key, { ref, setters: [] });
      slots2.get(ref.key).setters.push(set);
    }
    function visit(bs) {
      for (const b of bs) {
        if (b.type === "image")
          add(b.image, (data) => {
            b.image = { alt: b.image.alt, ...data };
          });
        if (b.type === "layout" && format === "docx") {
          delete b.assets;
          delete b.svg;
        }
        if (b.type === "layout" && format === "pdf") b.blocks = [];
        for (const asset of b.assets || [])
          add(
            asset,
            (data) => Object.assign(asset, { key: void 0, data: data.data })
          );
        if (b.blocks) visit(b.blocks);
        for (const item of b.items || []) visit(item);
        for (const row of b.rows || []) for (const c of row) visit(c.blocks);
      }
    }
    for (const m of messages) visit(m.blocks);
    async function resolveKeys(keys) {
      let index = 0;
      async function worker() {
        while (index < keys.length) {
          if (signal?.aborted) throw new Error("Export cancelled.");
          const key = keys[index++];
          pixels.set(key, await resolve(slots2.get(key).ref));
        }
      }
      await Promise.all(Array.from({ length: Math.min(keys.length, 4) }, worker));
    }
    await resolveKeys([...slots2.keys()]);
    const denied = [...pixels].filter(([, data]) => data?.permissionOrigin);
    if (denied.length && requestAccess && await requestAccess([
      ...new Set(denied.map(([, d]) => d.permissionOrigin))
    ])) {
      await resolveKeys(denied.map(([key]) => key));
    }
    for (const [key, item] of slots2) {
      const data = pixels.get(key);
      for (const set of item.setters) set(data?.data ? data : {});
    }
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
  function local(value, base2) {
    if (!value.includes("url(")) return value;
    const match = /^url\(["']?([^"')]+)["']?\)$/.exec(value);
    if (!match) return null;
    try {
      const url = new URL(match[1], base2);
      return url.href.split("#")[0] === base2.split("#")[0] && url.hash ? "url(" + url.hash + ")" : null;
    } catch {
      return null;
    }
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
    const cache2 = /* @__PURE__ */ new WeakMap();
    const baseColor = view(root).color;
    function read(el) {
      if (cache2.has(el)) return cache2.get(el);
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
      cache2.set(el, result);
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
    const base2 = hex(bg(code)), css = view(code);
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
      if (hex(back) !== base2) style.background = hex(back);
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
      background: base2,
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

  // src/modules/links.js
  function safeLink(value, base2 = "https://chatgpt.com/") {
    if (typeof value !== "string" || !value.trim() || value.trim() === "#")
      return void 0;
    try {
      const u = new URL(value, base2);
      return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : void 0;
    } catch {
      return void 0;
    }
  }
  function linkOn(el) {
    const link = el.closest("a[href],[href][role=link],[data-href],[data-url]");
    if (!link) return void 0;
    return [link.getAttribute("href"), link.dataset.href, link.dataset.url].map((value) => safeLink(value, el.ownerDocument.baseURI)).find(Boolean);
  }
  function publicLabel(el) {
    const labelled = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => el.getRootNode().getElementById?.(id)?.textContent?.trim()).filter(Boolean).join(" ");
    return (el.getAttribute("data-entity-name") || el.getAttribute("aria-label") || labelled || el.getAttribute("title") || "").trim();
  }
  function contentButton(el) {
    if (el.closest(
      "nav,aside,form,pre,code,[data-cge],.turn-action-controls,[role=toolbar],[data-code-block-controls]"
    ))
      return false;
    const label = el.textContent.trim() || publicLabel(el);
    if (!label || /^(?:copy(?: code| response| answer)?|delete|share|retry|regenerate|read aloud|good response|bad response|more actions|open in new tab)$/i.test(
      label
    ))
      return false;
    return Boolean(
      linkOn(el) || el.querySelector("a[href]") || el.closest(
        "td,th,h1,h2,h3,h4,h5,h6,b,strong,p,li,figcaption,[role=cell],[role=heading],[role=link],[data-entity-name],[data-testid*=entity i],[aria-haspopup]"
      ) || el.parentElement?.childElementCount === 1 && el.parentElement.textContent.trim() === label
    );
  }
  var init_links = __esm({
    "src/modules/links.js"() {
    }
  });

  // src/font-coverage.json
  var font_coverage_default;
  var init_font_coverage = __esm({
    "src/font-coverage.json"() {
      font_coverage_default = { sans: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 752, 753, 754, 755, 756, 757, 758, 759, 760, 761, 762, 763, 764, 765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834, 835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853, 854, 855, 856, 857, 858, 859, 860, 861, 862, 863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879, 884, 885, 890, 891, 892, 893, 894, 900, 901, 902, 903, 904, 905, 906, 908, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1e3, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278, 1279, 1280, 1281, 1282, 1283, 1284, 1285, 1286, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1306, 1307, 1308, 1309, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433, 1434, 1435, 1436, 1437, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447, 1448, 1449, 1450, 1451, 1452, 1453, 1454, 1455, 1456, 1457, 1458, 1459, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1467, 1468, 1469, 1470, 1471, 1472, 1473, 1474, 1475, 1476, 1477, 1478, 1479, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1513, 1514, 1520, 1521, 1522, 1523, 1524, 7424, 7425, 7426, 7427, 7428, 7429, 7430, 7431, 7432, 7433, 7434, 7435, 7436, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7445, 7446, 7447, 7448, 7449, 7450, 7451, 7452, 7453, 7454, 7455, 7456, 7457, 7458, 7459, 7460, 7461, 7462, 7463, 7464, 7465, 7466, 7467, 7468, 7469, 7470, 7471, 7472, 7473, 7474, 7475, 7476, 7477, 7478, 7479, 7480, 7481, 7482, 7483, 7484, 7485, 7486, 7487, 7488, 7489, 7490, 7491, 7492, 7493, 7494, 7495, 7496, 7497, 7498, 7499, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7513, 7514, 7515, 7516, 7517, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7531, 7532, 7533, 7534, 7535, 7536, 7537, 7538, 7539, 7540, 7541, 7542, 7543, 7544, 7545, 7546, 7547, 7548, 7549, 7550, 7551, 7552, 7553, 7554, 7555, 7556, 7557, 7558, 7559, 7560, 7561, 7562, 7563, 7564, 7565, 7566, 7567, 7568, 7569, 7570, 7571, 7572, 7573, 7574, 7575, 7576, 7577, 7578, 7579, 7580, 7581, 7582, 7583, 7584, 7585, 7586, 7587, 7588, 7589, 7590, 7591, 7592, 7593, 7594, 7595, 7596, 7597, 7598, 7599, 7600, 7601, 7602, 7603, 7604, 7605, 7606, 7607, 7608, 7609, 7610, 7611, 7612, 7613, 7614, 7615, 7616, 7617, 7618, 7619, 7620, 7621, 7622, 7623, 7624, 7625, 7626, 7678, 7679, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7730, 7731, 7732, 7733, 7734, 7735, 7736, 7737, 7738, 7739, 7740, 7741, 7742, 7743, 7744, 7745, 7746, 7747, 7748, 7749, 7750, 7751, 7752, 7753, 7754, 7755, 7756, 7757, 7758, 7759, 7760, 7761, 7762, 7763, 7764, 7765, 7766, 7767, 7768, 7769, 7770, 7771, 7772, 7773, 7774, 7775, 7776, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789, 7790, 7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7812, 7813, 7814, 7815, 7816, 7817, 7818, 7819, 7820, 7821, 7822, 7823, 7824, 7825, 7826, 7827, 7828, 7829, 7830, 7831, 7832, 7833, 7834, 7835, 7838, 7840, 7841, 7842, 7843, 7844, 7845, 7846, 7847, 7848, 7849, 7850, 7851, 7852, 7853, 7854, 7855, 7856, 7857, 7858, 7859, 7860, 7861, 7862, 7863, 7864, 7865, 7866, 7867, 7868, 7869, 7870, 7871, 7872, 7873, 7874, 7875, 7876, 7877, 7878, 7879, 7880, 7881, 7882, 7883, 7884, 7885, 7886, 7887, 7888, 7889, 7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 7898, 7899, 7900, 7901, 7902, 7903, 7904, 7905, 7906, 7907, 7908, 7909, 7910, 7911, 7912, 7913, 7914, 7915, 7916, 7917, 7918, 7919, 7920, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7960, 7961, 7962, 7963, 7964, 7965, 7968, 7969, 7970, 7971, 7972, 7973, 7974, 7975, 7976, 7977, 7978, 7979, 7980, 7981, 7982, 7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991, 7992, 7993, 7994, 7995, 7996, 7997, 7998, 7999, 8e3, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8025, 8027, 8029, 8031, 8032, 8033, 8034, 8035, 8036, 8037, 8038, 8039, 8040, 8041, 8042, 8043, 8044, 8045, 8046, 8047, 8048, 8049, 8050, 8051, 8052, 8053, 8054, 8055, 8056, 8057, 8058, 8059, 8060, 8061, 8064, 8065, 8066, 8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8118, 8119, 8120, 8121, 8122, 8123, 8124, 8125, 8126, 8127, 8128, 8129, 8130, 8131, 8132, 8134, 8135, 8136, 8137, 8138, 8139, 8140, 8141, 8142, 8143, 8144, 8145, 8146, 8147, 8150, 8151, 8152, 8153, 8154, 8155, 8157, 8158, 8159, 8160, 8161, 8162, 8163, 8164, 8165, 8166, 8167, 8168, 8169, 8170, 8171, 8172, 8173, 8174, 8175, 8178, 8179, 8180, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8208, 8210, 8211, 8212, 8213, 8214, 8215, 8216, 8217, 8218, 8219, 8220, 8221, 8222, 8223, 8224, 8225, 8226, 8230, 8234, 8235, 8236, 8237, 8238, 8239, 8240, 8242, 8243, 8244, 8249, 8250, 8252, 8254, 8260, 8286, 8298, 8299, 8300, 8301, 8302, 8303, 8308, 8309, 8310, 8311, 8312, 8313, 8319, 8320, 8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8336, 8337, 8338, 8339, 8340, 8352, 8353, 8354, 8355, 8356, 8357, 8358, 8359, 8360, 8361, 8362, 8363, 8364, 8365, 8366, 8367, 8368, 8369, 8370, 8371, 8372, 8373, 8383, 8432, 8453, 8467, 8470, 8471, 8482, 8486, 8494, 8525, 8526, 8531, 8532, 8539, 8540, 8541, 8542, 8580, 8592, 8593, 8594, 8595, 8596, 8597, 8616, 8660, 8706, 8710, 8719, 8721, 8722, 8725, 8729, 8730, 8734, 8735, 8745, 8747, 8776, 8800, 8801, 8802, 8804, 8805, 8962, 8976, 8992, 8993, 9472, 9474, 9484, 9488, 9492, 9496, 9500, 9508, 9516, 9524, 9532, 9552, 9553, 9554, 9555, 9556, 9557, 9558, 9559, 9560, 9561, 9562, 9563, 9564, 9565, 9566, 9567, 9568, 9569, 9570, 9571, 9572, 9573, 9574, 9575, 9576, 9577, 9578, 9579, 9580, 9600, 9604, 9608, 9612, 9616, 9617, 9618, 9619, 9632, 9633, 9642, 9643, 9644, 9650, 9658, 9660, 9668, 9674, 9675, 9676, 9679, 9680, 9681, 9682, 9683, 9684, 9685, 9686, 9687, 9688, 9689, 9702, 9786, 9787, 9788, 9791, 9792, 9793, 9794, 9795, 9796, 9797, 9798, 9799, 9824, 9827, 9829, 9830, 9833, 9834, 9835, 9836, 9839, 11360, 11361, 11362, 11363, 11364, 11365, 11366, 11367, 11368, 11369, 11370, 11371, 11372, 11373, 11377, 11378, 11379, 11380, 11381, 11382, 11383, 11799, 42775, 42776, 42777, 42778, 42779, 42780, 42781, 42782, 42783, 42784, 42785, 42888, 42889, 42890, 42891, 42892, 64257, 64258, 64285, 64286, 64287, 64288, 64289, 64290, 64291, 64292, 64293, 64294, 64295, 64296, 64297, 64298, 64299, 64300, 64301, 64302, 64303, 64304, 64305, 64306, 64307, 64308, 64309, 64310, 64312, 64313, 64314, 64315, 64316, 64318, 64320, 64321, 64323, 64324, 64326, 64327, 64328, 64329, 64330, 64331, 64332, 64333, 64334, 64335, 65056, 65057, 65058, 65059, 65532], serif: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 720, 721, 722, 723, 726, 727, 728, 729, 730, 731, 732, 733, 734, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 748, 750, 751, 752, 755, 759, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 835, 847, 856, 864, 865, 880, 881, 882, 883, 884, 885, 886, 887, 890, 891, 892, 893, 894, 895, 900, 901, 902, 903, 904, 905, 906, 908, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1122, 1123, 1124, 1125, 1130, 1131, 1132, 1133, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1164, 1165, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1210, 1211, 1216, 1217, 1218, 1219, 1220, 1223, 1224, 1227, 1228, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1296, 1297, 1298, 1299, 1300, 1301, 1306, 1307, 1308, 1309, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1369, 1370, 1371, 1372, 1373, 1374, 1375, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1417, 1418, 3647, 4256, 4257, 4258, 4259, 4260, 4261, 4262, 4263, 4264, 4265, 4266, 4267, 4268, 4269, 4270, 4271, 4272, 4273, 4274, 4275, 4276, 4277, 4278, 4279, 4280, 4281, 4282, 4283, 4284, 4285, 4286, 4287, 4288, 4289, 4290, 4291, 4292, 4293, 4304, 4305, 4306, 4307, 4308, 4309, 4310, 4311, 4312, 4313, 4314, 4315, 4316, 4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324, 4325, 4326, 4327, 4328, 4329, 4330, 4331, 4332, 4333, 4334, 4335, 4336, 4337, 4338, 4339, 4340, 4341, 4342, 4343, 4344, 4345, 4346, 4347, 4348, 7424, 7425, 7426, 7427, 7428, 7429, 7430, 7431, 7432, 7433, 7434, 7435, 7436, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7445, 7446, 7447, 7448, 7449, 7450, 7451, 7452, 7453, 7454, 7455, 7456, 7457, 7458, 7459, 7460, 7461, 7462, 7463, 7464, 7465, 7466, 7467, 7468, 7469, 7470, 7471, 7472, 7473, 7474, 7475, 7476, 7477, 7478, 7479, 7480, 7481, 7482, 7483, 7484, 7485, 7486, 7487, 7488, 7489, 7490, 7491, 7492, 7493, 7494, 7495, 7496, 7497, 7498, 7499, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7513, 7514, 7515, 7516, 7517, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7531, 7543, 7544, 7547, 7548, 7549, 7550, 7551, 7557, 7579, 7580, 7581, 7582, 7583, 7584, 7585, 7586, 7587, 7588, 7589, 7590, 7591, 7592, 7593, 7594, 7595, 7596, 7597, 7598, 7599, 7600, 7601, 7602, 7603, 7604, 7605, 7606, 7607, 7608, 7609, 7610, 7611, 7612, 7613, 7614, 7615, 7620, 7621, 7622, 7623, 7624, 7625, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7730, 7731, 7732, 7733, 7734, 7735, 7736, 7737, 7738, 7739, 7740, 7741, 7742, 7743, 7744, 7745, 7746, 7747, 7748, 7749, 7750, 7751, 7752, 7753, 7754, 7755, 7756, 7757, 7758, 7759, 7760, 7761, 7762, 7763, 7764, 7765, 7766, 7767, 7768, 7769, 7770, 7771, 7772, 7773, 7774, 7775, 7776, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789, 7790, 7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7812, 7813, 7814, 7815, 7816, 7817, 7818, 7819, 7820, 7821, 7822, 7823, 7824, 7825, 7826, 7827, 7828, 7829, 7830, 7831, 7832, 7833, 7834, 7835, 7836, 7837, 7838, 7839, 7840, 7841, 7842, 7843, 7844, 7845, 7846, 7847, 7848, 7849, 7850, 7851, 7852, 7853, 7854, 7855, 7856, 7857, 7858, 7859, 7860, 7861, 7862, 7863, 7864, 7865, 7866, 7867, 7868, 7869, 7870, 7871, 7872, 7873, 7874, 7875, 7876, 7877, 7878, 7879, 7880, 7881, 7882, 7883, 7884, 7885, 7886, 7887, 7888, 7889, 7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 7898, 7899, 7900, 7901, 7902, 7903, 7904, 7905, 7906, 7907, 7908, 7909, 7910, 7911, 7912, 7913, 7914, 7915, 7916, 7917, 7918, 7919, 7920, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7930, 7931, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7960, 7961, 7962, 7963, 7964, 7965, 7968, 7969, 7970, 7971, 7972, 7973, 7974, 7975, 7976, 7977, 7978, 7979, 7980, 7981, 7982, 7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991, 7992, 7993, 7994, 7995, 7996, 7997, 7998, 7999, 8e3, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8025, 8027, 8029, 8031, 8032, 8033, 8034, 8035, 8036, 8037, 8038, 8039, 8040, 8041, 8042, 8043, 8044, 8045, 8046, 8047, 8048, 8049, 8050, 8051, 8052, 8053, 8054, 8055, 8056, 8057, 8058, 8059, 8060, 8061, 8064, 8065, 8066, 8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8118, 8119, 8120, 8121, 8122, 8123, 8124, 8125, 8126, 8127, 8128, 8129, 8130, 8131, 8132, 8134, 8135, 8136, 8137, 8138, 8139, 8140, 8141, 8142, 8143, 8144, 8145, 8146, 8147, 8150, 8151, 8152, 8153, 8154, 8155, 8157, 8158, 8159, 8160, 8161, 8162, 8163, 8164, 8165, 8166, 8167, 8168, 8169, 8170, 8171, 8172, 8173, 8174, 8175, 8178, 8179, 8180, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8208, 8209, 8210, 8211, 8212, 8213, 8214, 8215, 8216, 8217, 8218, 8219, 8220, 8221, 8222, 8223, 8224, 8225, 8226, 8227, 8228, 8229, 8230, 8234, 8235, 8236, 8237, 8238, 8239, 8240, 8241, 8242, 8243, 8244, 8245, 8246, 8247, 8248, 8249, 8250, 8252, 8253, 8254, 8258, 8260, 8261, 8262, 8263, 8264, 8265, 8267, 8268, 8269, 8270, 8271, 8273, 8274, 8275, 8279, 8287, 8288, 8289, 8290, 8291, 8292, 8298, 8299, 8300, 8301, 8302, 8303, 8304, 8305, 8308, 8309, 8310, 8311, 8312, 8313, 8314, 8315, 8316, 8317, 8318, 8319, 8320, 8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8358, 8364, 8367, 8369, 8372, 8373, 8376, 8377, 8378, 8381, 8450, 8451, 8457, 8461, 8462, 8463, 8469, 8470, 8473, 8474, 8477, 8482, 8484, 8486, 8487, 8490, 8491, 8498, 8508, 8509, 8510, 8511, 8512, 8513, 8514, 8515, 8516, 8517, 8518, 8519, 8520, 8521, 8523, 8526, 8528, 8529, 8530, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8538, 8539, 8540, 8541, 8542, 8543, 8544, 8545, 8546, 8547, 8548, 8549, 8550, 8551, 8552, 8553, 8554, 8555, 8556, 8557, 8558, 8559, 8560, 8561, 8562, 8563, 8564, 8565, 8566, 8567, 8568, 8569, 8570, 8571, 8572, 8573, 8574, 8575, 8576, 8577, 8578, 8579, 8580, 8581, 8585, 8592, 8593, 8594, 8595, 8596, 8597, 8598, 8599, 8600, 8601, 8602, 8603, 8604, 8605, 8606, 8607, 8608, 8609, 8610, 8611, 8612, 8613, 8614, 8615, 8616, 8617, 8618, 8619, 8620, 8621, 8622, 8623, 8624, 8625, 8626, 8627, 8628, 8629, 8630, 8631, 8632, 8633, 8634, 8635, 8636, 8637, 8638, 8639, 8640, 8641, 8642, 8643, 8644, 8645, 8646, 8647, 8648, 8649, 8650, 8651, 8652, 8653, 8654, 8655, 8656, 8657, 8658, 8659, 8660, 8661, 8662, 8663, 8664, 8665, 8666, 8667, 8668, 8669, 8670, 8671, 8672, 8673, 8674, 8675, 8676, 8677, 8678, 8679, 8680, 8681, 8682, 8683, 8684, 8685, 8686, 8687, 8688, 8689, 8690, 8691, 8692, 8693, 8694, 8695, 8696, 8697, 8698, 8699, 8700, 8701, 8702, 8703, 8704, 8706, 8707, 8708, 8710, 8711, 8712, 8713, 8715, 8716, 8719, 8720, 8721, 8722, 8723, 8724, 8725, 8727, 8728, 8729, 8730, 8731, 8732, 8733, 8734, 8735, 8736, 8739, 8740, 8741, 8742, 8743, 8744, 8745, 8746, 8747, 8748, 8749, 8760, 8761, 8762, 8763, 8764, 8765, 8770, 8771, 8776, 8784, 8785, 8786, 8787, 8788, 8789, 8800, 8801, 8804, 8805, 8834, 8835, 8836, 8837, 8838, 8839, 8844, 8845, 8846, 8847, 8848, 8849, 8850, 8851, 8852, 8853, 8854, 8855, 8856, 8857, 8858, 8859, 8860, 8861, 8862, 8863, 8864, 8865, 8866, 8867, 8868, 8869, 8870, 8871, 8872, 8873, 8874, 8875, 8876, 8877, 8878, 8879, 8900, 8901, 8962, 8968, 8969, 8970, 8971, 8976, 8977, 8984, 8985, 8992, 8993, 8997, 9e3, 9085, 9115, 9116, 9117, 9118, 9119, 9120, 9121, 9122, 9123, 9124, 9125, 9126, 9127, 9128, 9129, 9130, 9131, 9132, 9133, 9134, 9143, 9167, 9251, 9472, 9473, 9474, 9475, 9476, 9477, 9478, 9479, 9480, 9481, 9482, 9483, 9484, 9485, 9486, 9487, 9488, 9489, 9490, 9491, 9492, 9493, 9494, 9495, 9496, 9497, 9498, 9499, 9500, 9501, 9502, 9503, 9504, 9505, 9506, 9507, 9508, 9509, 9510, 9511, 9512, 9513, 9514, 9515, 9516, 9517, 9518, 9519, 9520, 9521, 9522, 9523, 9524, 9525, 9526, 9527, 9528, 9529, 9530, 9531, 9532, 9533, 9534, 9535, 9536, 9537, 9538, 9539, 9540, 9541, 9542, 9543, 9544, 9545, 9546, 9547, 9548, 9549, 9550, 9551, 9552, 9553, 9554, 9555, 9556, 9557, 9558, 9559, 9560, 9561, 9562, 9563, 9564, 9565, 9566, 9567, 9568, 9569, 9570, 9571, 9572, 9573, 9574, 9575, 9576, 9577, 9578, 9579, 9580, 9581, 9582, 9583, 9584, 9585, 9586, 9587, 9588, 9589, 9590, 9591, 9592, 9593, 9594, 9595, 9596, 9597, 9598, 9599, 9600, 9601, 9602, 9603, 9604, 9605, 9606, 9607, 9608, 9609, 9610, 9611, 9612, 9613, 9614, 9615, 9616, 9617, 9618, 9619, 9620, 9621, 9622, 9623, 9624, 9625, 9626, 9627, 9628, 9629, 9630, 9631, 9632, 9633, 9634, 9635, 9636, 9637, 9638, 9639, 9640, 9641, 9642, 9643, 9644, 9645, 9646, 9647, 9648, 9649, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658, 9659, 9660, 9661, 9662, 9663, 9664, 9665, 9666, 9667, 9668, 9669, 9670, 9671, 9672, 9673, 9674, 9675, 9676, 9677, 9678, 9679, 9680, 9681, 9682, 9683, 9684, 9685, 9686, 9687, 9688, 9689, 9690, 9691, 9692, 9693, 9694, 9695, 9696, 9697, 9698, 9699, 9700, 9701, 9702, 9703, 9704, 9705, 9706, 9707, 9708, 9709, 9710, 9711, 9712, 9713, 9714, 9715, 9716, 9717, 9718, 9719, 9720, 9721, 9722, 9723, 9724, 9725, 9726, 9727, 9728, 9784, 9785, 9786, 9787, 9788, 9791, 9792, 9793, 9794, 9795, 9796, 9797, 9798, 9799, 9824, 9825, 9826, 9827, 9828, 9829, 9830, 9831, 9833, 9834, 9835, 9836, 9837, 9838, 9839, 10145, 10181, 10182, 10208, 10216, 10217, 10224, 10225, 10226, 10227, 10228, 10229, 10230, 10231, 10232, 10233, 10234, 10235, 10236, 10237, 10238, 10239, 10240, 10241, 10242, 10243, 10244, 10245, 10246, 10247, 10248, 10249, 10250, 10251, 10252, 10253, 10254, 10255, 10256, 10257, 10258, 10259, 10260, 10261, 10262, 10263, 10264, 10265, 10266, 10267, 10268, 10269, 10270, 10271, 10272, 10273, 10274, 10275, 10276, 10277, 10278, 10279, 10280, 10281, 10282, 10283, 10284, 10285, 10286, 10287, 10288, 10289, 10290, 10291, 10292, 10293, 10294, 10295, 10296, 10297, 10298, 10299, 10300, 10301, 10302, 10303, 10304, 10305, 10306, 10307, 10308, 10309, 10310, 10311, 10312, 10313, 10314, 10315, 10316, 10317, 10318, 10319, 10320, 10321, 10322, 10323, 10324, 10325, 10326, 10327, 10328, 10329, 10330, 10331, 10332, 10333, 10334, 10335, 10336, 10337, 10338, 10339, 10340, 10341, 10342, 10343, 10344, 10345, 10346, 10347, 10348, 10349, 10350, 10351, 10352, 10353, 10354, 10355, 10356, 10357, 10358, 10359, 10360, 10361, 10362, 10363, 10364, 10365, 10366, 10367, 10368, 10369, 10370, 10371, 10372, 10373, 10374, 10375, 10376, 10377, 10378, 10379, 10380, 10381, 10382, 10383, 10384, 10385, 10386, 10387, 10388, 10389, 10390, 10391, 10392, 10393, 10394, 10395, 10396, 10397, 10398, 10399, 10400, 10401, 10402, 10403, 10404, 10405, 10406, 10407, 10408, 10409, 10410, 10411, 10412, 10413, 10414, 10415, 10416, 10417, 10418, 10419, 10420, 10421, 10422, 10423, 10424, 10425, 10426, 10427, 10428, 10429, 10430, 10431, 10432, 10433, 10434, 10435, 10436, 10437, 10438, 10439, 10440, 10441, 10442, 10443, 10444, 10445, 10446, 10447, 10448, 10449, 10450, 10451, 10452, 10453, 10454, 10455, 10456, 10457, 10458, 10459, 10460, 10461, 10462, 10463, 10464, 10465, 10466, 10467, 10468, 10469, 10470, 10471, 10472, 10473, 10474, 10475, 10476, 10477, 10478, 10479, 10480, 10481, 10482, 10483, 10484, 10485, 10486, 10487, 10488, 10489, 10490, 10491, 10492, 10493, 10494, 10495, 10496, 10497, 10498, 10499, 10500, 10501, 10502, 10503, 10504, 10505, 10506, 10507, 10508, 10509, 10510, 10511, 10512, 10513, 10514, 10515, 10516, 10517, 10518, 10519, 10520, 10521, 10522, 10523, 10524, 10525, 10526, 10527, 10528, 10529, 10530, 10531, 10532, 10533, 10534, 10535, 10536, 10537, 10538, 10539, 10540, 10541, 10542, 10543, 10544, 10545, 10546, 10547, 10548, 10549, 10550, 10551, 10552, 10553, 10554, 10555, 10556, 10557, 10558, 10559, 10560, 10561, 10562, 10563, 10564, 10565, 10566, 10567, 10568, 10569, 10570, 10571, 10572, 10573, 10574, 10575, 10576, 10577, 10578, 10579, 10580, 10581, 10582, 10583, 10584, 10585, 10586, 10587, 10588, 10589, 10590, 10591, 10592, 10593, 10594, 10595, 10596, 10597, 10598, 10599, 10600, 10601, 10602, 10603, 10604, 10605, 10606, 10607, 10608, 10609, 10610, 10611, 10612, 10613, 10614, 10615, 10616, 10617, 10618, 10619, 10620, 10621, 10622, 10623, 10731, 10764, 10765, 10766, 10799, 10858, 10859, 11008, 11009, 11010, 11011, 11012, 11013, 11014, 11015, 11016, 11017, 11018, 11019, 11020, 11021, 11022, 11023, 11024, 11025, 11026, 11027, 11028, 11029, 11030, 11031, 11032, 11033, 11034, 11360, 11361, 11363, 11364, 11367, 11368, 11369, 11370, 11371, 11372, 11373, 11374, 11375, 11376, 11377, 11378, 11379, 11381, 11382, 11383, 11385, 11386, 11387, 11388, 11389, 11390, 11391, 11520, 11521, 11522, 11523, 11524, 11525, 11526, 11527, 11528, 11529, 11530, 11531, 11532, 11533, 11534, 11535, 11536, 11537, 11538, 11539, 11540, 11541, 11542, 11543, 11544, 11545, 11546, 11547, 11548, 11549, 11550, 11551, 11552, 11553, 11554, 11555, 11556, 11557, 11800, 11807, 11810, 11811, 11812, 11813, 11822, 42564, 42565, 42566, 42567, 42576, 42577, 42580, 42581, 42582, 42583, 42648, 42649, 42760, 42761, 42762, 42763, 42764, 42765, 42766, 42767, 42768, 42769, 42770, 42771, 42772, 42773, 42774, 42779, 42780, 42781, 42782, 42783, 42790, 42791, 42792, 42793, 42794, 42795, 42796, 42797, 42798, 42799, 42800, 42801, 42802, 42803, 42804, 42805, 42806, 42807, 42808, 42809, 42810, 42811, 42812, 42813, 42814, 42815, 42816, 42817, 42822, 42823, 42826, 42827, 42830, 42831, 42856, 42857, 42875, 42876, 42880, 42881, 42882, 42883, 42884, 42885, 42886, 42887, 42891, 42892, 42893, 42896, 42897, 42922, 43e3, 43001, 43002, 43003, 43004, 43005, 43006, 43007, 62464, 62465, 62466, 62467, 62468, 62469, 62470, 62471, 62472, 62473, 62474, 62475, 62476, 62477, 62478, 62479, 62480, 62481, 62482, 62483, 62484, 62485, 62486, 62487, 62488, 62489, 62490, 62491, 62492, 62493, 62494, 62495, 62496, 62497, 62498, 62499, 62500, 62501, 62502, 62504, 63173, 63185, 63188, 64256, 64257, 64258, 64259, 64260, 64261, 64262, 65024, 65025, 65026, 65027, 65028, 65029, 65030, 65031, 65032, 65033, 65034, 65035, 65036, 65037, 65038, 65039, 65529, 65530, 65531, 65532, 65533, 119860, 119861, 119862, 119863, 119864, 119865, 119866, 119867, 119868, 119869, 119870, 119871, 119872, 119873, 119874, 119875, 119876, 119877, 119878, 119879, 119880, 119881, 119882, 119883, 119884, 119885, 119886, 119887, 119888, 119889, 119890, 119891, 119892, 119894, 119895, 119896, 119897, 119898, 119899, 119900, 119901, 119902, 119903, 119904, 119905, 119906, 119907, 119908, 119909, 119910, 119911, 120120, 120121, 120123, 120124, 120125, 120126, 120128, 120129, 120130, 120131, 120132, 120134, 120138, 120139, 120140, 120141, 120142, 120143, 120144, 120146, 120147, 120148, 120149, 120150, 120151, 120152, 120153, 120154, 120155, 120156, 120157, 120158, 120159, 120160, 120161, 120162, 120163, 120164, 120165, 120166, 120167, 120168, 120169, 120170, 120171, 120484, 120485, 120792, 120793, 120794, 120795, 120796, 120797, 120798, 120799, 120800, 120801], mono: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 500, 501, 502, 504, 505, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 579, 580, 581, 588, 589, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 699, 700, 701, 702, 703, 704, 705, 710, 711, 712, 713, 716, 717, 718, 719, 720, 721, 722, 723, 726, 727, 728, 729, 730, 731, 732, 733, 734, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 750, 755, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 835, 856, 865, 884, 885, 886, 887, 890, 891, 892, 893, 894, 895, 900, 901, 902, 903, 904, 905, 906, 908, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1122, 1123, 1138, 1139, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1186, 1187, 1188, 1189, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1210, 1211, 1216, 1217, 1218, 1219, 1220, 1223, 1224, 1227, 1228, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1296, 1297, 1306, 1307, 1308, 1309, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1369, 1370, 1371, 1372, 1373, 1374, 1375, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1417, 1418, 1542, 1543, 1545, 1546, 1548, 1557, 1563, 1567, 1569, 1570, 1571, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1579, 1580, 1581, 1582, 1583, 1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1593, 1594, 1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1621, 1626, 1632, 1633, 1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641, 1642, 1643, 1644, 1645, 1652, 1657, 1658, 1659, 1662, 1663, 1664, 1667, 1668, 1670, 1671, 1681, 1688, 1700, 1705, 1711, 1726, 1740, 1776, 1777, 1778, 1779, 1780, 1781, 1782, 1783, 1784, 1785, 3647, 3713, 3714, 3716, 3719, 3720, 3722, 3725, 3732, 3733, 3734, 3735, 3737, 3738, 3739, 3740, 3741, 3742, 3743, 3745, 3746, 3747, 3749, 3751, 3754, 3755, 3757, 3758, 3759, 3760, 3761, 3762, 3763, 3764, 3765, 3766, 3767, 3768, 3769, 3771, 3772, 3784, 3785, 3786, 3787, 3788, 3789, 4304, 4305, 4306, 4307, 4308, 4309, 4310, 4311, 4312, 4313, 4314, 4315, 4316, 4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324, 4325, 4326, 4327, 4328, 4329, 4330, 4331, 4332, 4333, 4334, 4335, 4336, 4337, 4338, 4339, 4340, 4341, 4342, 4343, 4344, 4345, 4346, 4347, 4348, 7426, 7432, 7433, 7444, 7446, 7447, 7453, 7454, 7455, 7468, 7469, 7470, 7472, 7473, 7474, 7475, 7476, 7477, 7478, 7479, 7480, 7481, 7482, 7483, 7484, 7486, 7487, 7488, 7489, 7490, 7491, 7492, 7493, 7494, 7495, 7496, 7497, 7498, 7499, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7513, 7514, 7515, 7522, 7523, 7524, 7525, 7543, 7544, 7547, 7557, 7579, 7580, 7581, 7582, 7583, 7584, 7585, 7586, 7587, 7588, 7589, 7590, 7591, 7592, 7593, 7594, 7595, 7596, 7597, 7598, 7599, 7600, 7601, 7602, 7603, 7604, 7605, 7606, 7607, 7609, 7610, 7611, 7612, 7613, 7614, 7615, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7728, 7729, 7730, 7731, 7732, 7733, 7734, 7735, 7736, 7737, 7738, 7739, 7740, 7741, 7742, 7743, 7744, 7745, 7746, 7747, 7748, 7749, 7750, 7751, 7752, 7753, 7754, 7755, 7756, 7757, 7764, 7765, 7766, 7767, 7768, 7769, 7770, 7771, 7772, 7773, 7774, 7775, 7776, 7777, 7778, 7779, 7784, 7785, 7786, 7787, 7788, 7789, 7790, 7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7812, 7813, 7814, 7815, 7816, 7817, 7818, 7819, 7820, 7821, 7822, 7823, 7824, 7825, 7826, 7827, 7828, 7829, 7830, 7831, 7832, 7833, 7835, 7839, 7840, 7841, 7852, 7853, 7856, 7857, 7862, 7863, 7864, 7865, 7868, 7869, 7878, 7879, 7882, 7883, 7884, 7885, 7896, 7897, 7898, 7899, 7900, 7901, 7904, 7905, 7906, 7907, 7908, 7909, 7912, 7913, 7914, 7915, 7918, 7919, 7920, 7921, 7922, 7923, 7924, 7925, 7928, 7929, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7960, 7961, 7962, 7963, 7964, 7965, 7968, 7969, 7970, 7971, 7972, 7973, 7974, 7975, 7976, 7977, 7978, 7979, 7980, 7981, 7982, 7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991, 7992, 7993, 7994, 7995, 7996, 7997, 7998, 7999, 8e3, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8025, 8027, 8029, 8031, 8032, 8033, 8034, 8035, 8036, 8037, 8038, 8039, 8040, 8041, 8042, 8043, 8044, 8045, 8046, 8047, 8048, 8049, 8050, 8051, 8052, 8053, 8054, 8055, 8056, 8057, 8058, 8059, 8060, 8061, 8064, 8065, 8066, 8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8118, 8119, 8120, 8121, 8122, 8123, 8124, 8125, 8126, 8127, 8128, 8129, 8130, 8131, 8132, 8134, 8135, 8136, 8137, 8138, 8139, 8140, 8141, 8142, 8143, 8144, 8145, 8146, 8147, 8150, 8151, 8152, 8153, 8154, 8155, 8157, 8158, 8159, 8160, 8161, 8162, 8163, 8164, 8165, 8166, 8167, 8168, 8169, 8170, 8171, 8172, 8173, 8174, 8175, 8178, 8179, 8180, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8208, 8209, 8210, 8211, 8212, 8213, 8214, 8215, 8216, 8217, 8218, 8219, 8220, 8221, 8222, 8223, 8224, 8225, 8226, 8227, 8230, 8239, 8240, 8241, 8242, 8243, 8244, 8245, 8246, 8247, 8249, 8250, 8252, 8253, 8254, 8255, 8261, 8262, 8263, 8264, 8265, 8267, 8287, 8304, 8305, 8308, 8309, 8310, 8311, 8312, 8313, 8314, 8315, 8316, 8317, 8318, 8319, 8320, 8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8352, 8353, 8354, 8355, 8356, 8357, 8358, 8359, 8360, 8361, 8362, 8363, 8364, 8365, 8366, 8367, 8368, 8369, 8370, 8371, 8372, 8373, 8376, 8377, 8378, 8381, 8450, 8453, 8461, 8462, 8463, 8469, 8470, 8471, 8473, 8474, 8477, 8482, 8484, 8486, 8490, 8491, 8494, 8520, 8528, 8529, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8538, 8539, 8540, 8541, 8542, 8543, 8585, 8592, 8593, 8594, 8595, 8596, 8597, 8598, 8599, 8600, 8601, 8602, 8603, 8604, 8605, 8606, 8607, 8608, 8609, 8610, 8611, 8612, 8613, 8614, 8615, 8616, 8617, 8618, 8619, 8620, 8621, 8622, 8623, 8624, 8625, 8626, 8627, 8628, 8629, 8630, 8631, 8632, 8633, 8634, 8635, 8636, 8637, 8638, 8639, 8640, 8641, 8642, 8643, 8644, 8645, 8646, 8647, 8648, 8649, 8650, 8651, 8652, 8653, 8654, 8655, 8656, 8657, 8658, 8659, 8660, 8661, 8662, 8663, 8664, 8665, 8666, 8667, 8668, 8669, 8670, 8671, 8672, 8673, 8674, 8675, 8676, 8677, 8678, 8679, 8680, 8681, 8682, 8683, 8684, 8685, 8686, 8687, 8688, 8689, 8690, 8691, 8692, 8693, 8694, 8695, 8696, 8697, 8698, 8699, 8700, 8701, 8702, 8703, 8704, 8705, 8706, 8707, 8708, 8709, 8710, 8711, 8712, 8713, 8714, 8715, 8716, 8717, 8718, 8719, 8720, 8721, 8722, 8723, 8725, 8727, 8728, 8729, 8730, 8731, 8732, 8733, 8734, 8735, 8736, 8739, 8743, 8744, 8745, 8746, 8747, 8748, 8749, 8756, 8757, 8758, 8759, 8760, 8761, 8762, 8763, 8764, 8765, 8769, 8770, 8771, 8772, 8773, 8774, 8775, 8776, 8777, 8778, 8779, 8780, 8781, 8782, 8783, 8784, 8785, 8786, 8787, 8788, 8789, 8790, 8791, 8792, 8793, 8794, 8795, 8796, 8797, 8798, 8799, 8800, 8801, 8802, 8803, 8804, 8805, 8806, 8807, 8808, 8809, 8813, 8814, 8815, 8816, 8817, 8818, 8819, 8820, 8821, 8822, 8823, 8824, 8825, 8826, 8827, 8828, 8829, 8830, 8831, 8832, 8833, 8834, 8835, 8836, 8837, 8838, 8839, 8840, 8841, 8842, 8843, 8845, 8846, 8847, 8848, 8849, 8850, 8851, 8852, 8853, 8854, 8855, 8856, 8857, 8858, 8859, 8860, 8861, 8862, 8863, 8864, 8865, 8866, 8867, 8868, 8869, 8882, 8883, 8884, 8885, 8888, 8898, 8899, 8900, 8901, 8902, 8909, 8910, 8911, 8912, 8913, 8922, 8923, 8924, 8925, 8926, 8927, 8928, 8929, 8930, 8931, 8932, 8933, 8934, 8935, 8936, 8937, 8943, 8960, 8961, 8962, 8963, 8964, 8965, 8966, 8968, 8969, 8970, 8971, 8972, 8973, 8974, 8975, 8976, 8977, 8978, 8979, 8980, 8981, 8984, 8985, 8988, 8989, 8990, 8991, 8992, 8993, 8997, 8998, 8999, 9e3, 9003, 9013, 9014, 9015, 9016, 9017, 9018, 9019, 9020, 9021, 9022, 9023, 9024, 9025, 9026, 9027, 9028, 9029, 9030, 9031, 9032, 9033, 9034, 9035, 9036, 9037, 9038, 9039, 9040, 9041, 9042, 9043, 9044, 9045, 9046, 9047, 9048, 9049, 9050, 9051, 9052, 9053, 9054, 9055, 9056, 9057, 9058, 9059, 9060, 9061, 9062, 9063, 9064, 9065, 9066, 9067, 9068, 9069, 9070, 9071, 9072, 9073, 9074, 9075, 9076, 9077, 9078, 9079, 9080, 9081, 9082, 9085, 9088, 9089, 9090, 9091, 9096, 9097, 9098, 9099, 9109, 9115, 9116, 9117, 9118, 9119, 9120, 9121, 9122, 9123, 9124, 9125, 9126, 9127, 9128, 9129, 9130, 9131, 9132, 9133, 9134, 9166, 9167, 9251, 9472, 9473, 9474, 9475, 9476, 9477, 9478, 9479, 9480, 9481, 9482, 9483, 9484, 9485, 9486, 9487, 9488, 9489, 9490, 9491, 9492, 9493, 9494, 9495, 9496, 9497, 9498, 9499, 9500, 9501, 9502, 9503, 9504, 9505, 9506, 9507, 9508, 9509, 9510, 9511, 9512, 9513, 9514, 9515, 9516, 9517, 9518, 9519, 9520, 9521, 9522, 9523, 9524, 9525, 9526, 9527, 9528, 9529, 9530, 9531, 9532, 9533, 9534, 9535, 9536, 9537, 9538, 9539, 9540, 9541, 9542, 9543, 9544, 9545, 9546, 9547, 9548, 9549, 9550, 9551, 9552, 9553, 9554, 9555, 9556, 9557, 9558, 9559, 9560, 9561, 9562, 9563, 9564, 9565, 9566, 9567, 9568, 9569, 9570, 9571, 9572, 9573, 9574, 9575, 9576, 9577, 9578, 9579, 9580, 9581, 9582, 9583, 9584, 9585, 9586, 9587, 9588, 9589, 9590, 9591, 9592, 9593, 9594, 9595, 9596, 9597, 9598, 9599, 9600, 9601, 9602, 9603, 9604, 9605, 9606, 9607, 9608, 9609, 9610, 9611, 9612, 9613, 9614, 9615, 9616, 9617, 9618, 9619, 9620, 9621, 9622, 9623, 9624, 9625, 9626, 9627, 9628, 9629, 9630, 9631, 9632, 9633, 9634, 9635, 9636, 9637, 9638, 9639, 9640, 9641, 9642, 9643, 9644, 9645, 9646, 9647, 9648, 9649, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658, 9659, 9660, 9661, 9662, 9663, 9664, 9665, 9666, 9667, 9668, 9669, 9670, 9671, 9672, 9673, 9674, 9675, 9676, 9677, 9678, 9679, 9680, 9681, 9682, 9683, 9684, 9685, 9686, 9687, 9688, 9689, 9690, 9691, 9692, 9693, 9694, 9695, 9696, 9697, 9698, 9699, 9700, 9701, 9702, 9703, 9704, 9705, 9706, 9707, 9708, 9709, 9710, 9711, 9712, 9713, 9714, 9715, 9716, 9717, 9718, 9719, 9720, 9721, 9722, 9723, 9724, 9725, 9726, 9727, 9728, 9729, 9730, 9731, 9732, 9733, 9734, 9735, 9736, 9737, 9738, 9739, 9740, 9741, 9742, 9743, 9744, 9745, 9746, 9747, 9748, 9749, 9750, 9751, 9752, 9753, 9754, 9755, 9756, 9757, 9758, 9759, 9760, 9761, 9762, 9763, 9764, 9765, 9766, 9767, 9768, 9769, 9770, 9771, 9772, 9773, 9774, 9775, 9784, 9785, 9786, 9787, 9788, 9789, 9790, 9791, 9792, 9793, 9794, 9795, 9796, 9797, 9798, 9799, 9800, 9801, 9802, 9803, 9804, 9805, 9806, 9807, 9808, 9809, 9810, 9811, 9812, 9813, 9814, 9815, 9816, 9817, 9818, 9819, 9820, 9821, 9822, 9823, 9824, 9825, 9826, 9827, 9828, 9829, 9830, 9831, 9832, 9833, 9834, 9835, 9836, 9837, 9838, 9839, 9840, 9841, 9842, 9843, 9844, 9845, 9846, 9847, 9848, 9849, 9850, 9851, 9852, 9853, 9854, 9855, 9856, 9857, 9858, 9859, 9860, 9861, 9862, 9863, 9864, 9865, 9866, 9867, 9872, 9873, 9874, 9875, 9876, 9877, 9878, 9879, 9880, 9881, 9882, 9883, 9884, 9888, 9889, 9904, 9905, 9985, 9986, 9987, 9988, 9990, 9991, 9992, 9993, 9996, 9997, 9998, 9999, 1e4, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011, 10012, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10020, 10021, 10022, 10023, 10025, 10026, 10027, 10028, 10029, 10030, 10031, 10032, 10033, 10034, 10035, 10036, 10037, 10038, 10039, 10040, 10041, 10042, 10043, 10044, 10045, 10046, 10047, 10048, 10049, 10050, 10051, 10052, 10053, 10054, 10055, 10056, 10057, 10058, 10059, 10061, 10063, 10064, 10065, 10066, 10070, 10072, 10073, 10074, 10075, 10076, 10077, 10078, 10081, 10082, 10083, 10084, 10085, 10086, 10087, 10088, 10089, 10090, 10091, 10092, 10093, 10094, 10095, 10096, 10097, 10098, 10099, 10100, 10101, 10132, 10136, 10137, 10138, 10139, 10140, 10141, 10142, 10143, 10144, 10145, 10146, 10147, 10148, 10149, 10150, 10151, 10152, 10153, 10154, 10155, 10156, 10157, 10158, 10159, 10161, 10162, 10163, 10164, 10165, 10166, 10167, 10168, 10169, 10170, 10171, 10172, 10173, 10174, 10178, 10181, 10182, 10204, 10208, 10214, 10215, 10216, 10217, 10218, 10219, 10229, 10230, 10231, 10631, 10632, 10647, 10648, 10731, 10746, 10747, 10752, 10799, 10858, 10859, 11013, 11014, 11015, 11016, 11017, 11018, 11019, 11020, 11021, 11026, 11027, 11028, 11029, 11030, 11031, 11032, 11033, 11034, 11364, 11373, 11374, 11375, 11376, 11381, 11382, 11383, 11385, 11386, 11388, 11389, 11390, 11391, 11800, 11807, 11810, 11811, 11812, 11813, 11822, 42760, 42761, 42762, 42763, 42764, 42765, 42766, 42767, 42768, 42769, 42770, 42771, 42772, 42773, 42774, 42779, 42780, 42781, 42782, 42783, 42786, 42787, 42788, 42789, 42790, 42791, 42889, 42890, 42891, 42892, 42893, 42894, 42896, 42897, 42922, 43e3, 43001, 63173, 64257, 64258, 64338, 64339, 64340, 64341, 64342, 64343, 64344, 64345, 64346, 64347, 64348, 64349, 64350, 64351, 64352, 64353, 64354, 64355, 64356, 64357, 64358, 64359, 64360, 64361, 64362, 64363, 64364, 64365, 64366, 64367, 64368, 64369, 64370, 64371, 64372, 64373, 64374, 64375, 64376, 64377, 64378, 64379, 64380, 64381, 64382, 64383, 64384, 64385, 64394, 64395, 64396, 64397, 64398, 64399, 64400, 64401, 64402, 64403, 64404, 64405, 64414, 64415, 64426, 64427, 64428, 64429, 64488, 64489, 64508, 64509, 64510, 64511, 65136, 65137, 65138, 65139, 65140, 65142, 65143, 65144, 65145, 65146, 65147, 65148, 65149, 65150, 65151, 65152, 65153, 65154, 65155, 65156, 65157, 65158, 65159, 65160, 65161, 65162, 65163, 65164, 65165, 65166, 65167, 65168, 65169, 65170, 65171, 65172, 65173, 65174, 65175, 65176, 65177, 65178, 65179, 65180, 65181, 65182, 65183, 65184, 65185, 65186, 65187, 65188, 65189, 65190, 65191, 65192, 65193, 65194, 65195, 65196, 65197, 65198, 65199, 65200, 65201, 65202, 65203, 65204, 65205, 65206, 65207, 65208, 65209, 65210, 65211, 65212, 65213, 65214, 65215, 65216, 65217, 65218, 65219, 65220, 65221, 65222, 65223, 65224, 65225, 65226, 65227, 65228, 65229, 65230, 65231, 65232, 65233, 65234, 65235, 65236, 65237, 65238, 65239, 65240, 65241, 65242, 65243, 65244, 65245, 65246, 65247, 65248, 65249, 65250, 65251, 65252, 65253, 65254, 65255, 65256, 65257, 65258, 65259, 65260, 65261, 65262, 65263, 65264, 65265, 65266, 65267, 65268, 65269, 65270, 65271, 65272, 65273, 65274, 65275, 65276, 65279, 65529, 65530, 65531, 65532, 65533, 120154, 120432, 120433, 120434, 120435, 120436, 120437, 120438, 120439, 120440, 120441, 120442, 120443, 120444, 120445, 120446, 120447, 120448, 120449, 120450, 120451, 120452, 120453, 120454, 120455, 120456, 120457, 120458, 120459, 120460, 120461, 120462, 120463, 120464, 120465, 120466, 120467, 120468, 120469, 120470, 120471, 120472, 120473, 120474, 120475, 120476, 120477, 120478, 120479, 120480, 120481, 120482, 120483, 120822, 120823, 120824, 120825, 120826, 120827, 120828, 120829, 120830, 120831], symbols: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 748, 749, 750, 755, 759, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834, 835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847, 849, 850, 851, 855, 856, 858, 860, 861, 862, 863, 864, 865, 866, 880, 881, 882, 883, 884, 885, 886, 887, 890, 891, 892, 893, 894, 895, 900, 901, 902, 903, 904, 905, 906, 908, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1e3, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278, 1279, 1280, 1281, 1282, 1283, 1284, 1285, 1286, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310, 1311, 1312, 1313, 1314, 1315, 1316, 1317, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1369, 1370, 1371, 1372, 1373, 1374, 1375, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1417, 1418, 1456, 1457, 1458, 1459, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1467, 1468, 1469, 1470, 1471, 1472, 1473, 1474, 1475, 1478, 1479, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1513, 1514, 1520, 1521, 1522, 1523, 1524, 1542, 1543, 1545, 1546, 1548, 1557, 1563, 1567, 1569, 1570, 1571, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1579, 1580, 1581, 1582, 1583, 1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1593, 1594, 1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1621, 1623, 1626, 1632, 1633, 1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641, 1642, 1643, 1644, 1645, 1646, 1647, 1648, 1652, 1657, 1658, 1659, 1660, 1661, 1662, 1663, 1664, 1665, 1666, 1667, 1668, 1669, 1670, 1671, 1672, 1673, 1674, 1675, 1676, 1677, 1678, 1679, 1680, 1681, 1682, 1683, 1684, 1685, 1686, 1687, 1688, 1689, 1690, 1691, 1692, 1693, 1694, 1695, 1696, 1697, 1698, 1699, 1700, 1701, 1702, 1703, 1704, 1705, 1706, 1707, 1708, 1709, 1710, 1711, 1712, 1713, 1714, 1715, 1716, 1717, 1718, 1719, 1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727, 1734, 1735, 1736, 1739, 1740, 1742, 1744, 1749, 1776, 1777, 1778, 1779, 1780, 1781, 1782, 1783, 1784, 1785, 1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2e3, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2040, 2041, 2042, 3647, 3713, 3714, 3716, 3719, 3720, 3722, 3725, 3732, 3733, 3734, 3735, 3737, 3738, 3739, 3740, 3741, 3742, 3743, 3745, 3746, 3747, 3749, 3751, 3754, 3755, 3757, 3758, 3759, 3760, 3761, 3762, 3763, 3764, 3765, 3766, 3767, 3768, 3769, 3771, 3772, 3773, 3776, 3777, 3778, 3779, 3780, 3782, 3784, 3785, 3786, 3787, 3788, 3789, 3792, 3793, 3794, 3795, 3796, 3797, 3798, 3799, 3800, 3801, 3804, 3805, 4256, 4257, 4258, 4259, 4260, 4261, 4262, 4263, 4264, 4265, 4266, 4267, 4268, 4269, 4270, 4271, 4272, 4273, 4274, 4275, 4276, 4277, 4278, 4279, 4280, 4281, 4282, 4283, 4284, 4285, 4286, 4287, 4288, 4289, 4290, 4291, 4292, 4293, 4304, 4305, 4306, 4307, 4308, 4309, 4310, 4311, 4312, 4313, 4314, 4315, 4316, 4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324, 4325, 4326, 4327, 4328, 4329, 4330, 4331, 4332, 4333, 4334, 4335, 4336, 4337, 4338, 4339, 4340, 4341, 4342, 4343, 4344, 4345, 4346, 4347, 4348, 5121, 5122, 5123, 5124, 5125, 5126, 5127, 5129, 5130, 5131, 5132, 5133, 5134, 5135, 5136, 5137, 5138, 5139, 5140, 5141, 5142, 5143, 5144, 5145, 5146, 5147, 5149, 5150, 5151, 5152, 5153, 5154, 5155, 5156, 5157, 5158, 5159, 5160, 5161, 5162, 5163, 5164, 5165, 5166, 5167, 5168, 5169, 5170, 5171, 5172, 5173, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190, 5191, 5192, 5193, 5194, 5196, 5197, 5198, 5199, 5200, 5201, 5202, 5204, 5205, 5206, 5207, 5208, 5209, 5210, 5211, 5212, 5213, 5214, 5215, 5216, 5217, 5218, 5219, 5220, 5221, 5222, 5223, 5224, 5225, 5226, 5227, 5228, 5229, 5230, 5231, 5232, 5233, 5234, 5235, 5236, 5237, 5238, 5239, 5240, 5241, 5242, 5243, 5244, 5245, 5246, 5247, 5248, 5249, 5250, 5251, 5252, 5253, 5254, 5255, 5256, 5257, 5258, 5259, 5260, 5261, 5262, 5263, 5264, 5265, 5266, 5267, 5268, 5269, 5270, 5271, 5272, 5273, 5274, 5275, 5276, 5277, 5278, 5279, 5280, 5281, 5282, 5283, 5284, 5285, 5286, 5287, 5288, 5289, 5290, 5291, 5292, 5293, 5294, 5295, 5296, 5297, 5298, 5299, 5300, 5301, 5302, 5303, 5304, 5305, 5306, 5307, 5308, 5309, 5312, 5313, 5314, 5315, 5316, 5317, 5318, 5319, 5320, 5321, 5322, 5323, 5324, 5325, 5326, 5327, 5328, 5329, 5330, 5331, 5332, 5333, 5334, 5335, 5336, 5337, 5338, 5339, 5340, 5341, 5342, 5343, 5344, 5345, 5346, 5347, 5348, 5349, 5350, 5351, 5352, 5353, 5354, 5356, 5357, 5358, 5359, 5360, 5361, 5362, 5363, 5364, 5365, 5366, 5367, 5368, 5369, 5370, 5371, 5372, 5373, 5374, 5375, 5376, 5377, 5378, 5379, 5380, 5381, 5382, 5383, 5392, 5393, 5394, 5395, 5396, 5397, 5398, 5399, 5400, 5401, 5402, 5403, 5404, 5405, 5406, 5407, 5408, 5409, 5410, 5411, 5412, 5413, 5414, 5415, 5416, 5417, 5418, 5419, 5420, 5421, 5422, 5423, 5424, 5425, 5426, 5427, 5428, 5429, 5430, 5431, 5432, 5433, 5434, 5435, 5436, 5437, 5438, 5440, 5441, 5442, 5443, 5444, 5445, 5446, 5447, 5448, 5449, 5450, 5451, 5452, 5453, 5454, 5455, 5456, 5458, 5459, 5460, 5461, 5462, 5463, 5464, 5465, 5466, 5467, 5468, 5469, 5470, 5471, 5472, 5473, 5474, 5475, 5476, 5477, 5478, 5479, 5480, 5481, 5482, 5492, 5493, 5494, 5495, 5496, 5497, 5498, 5499, 5500, 5501, 5502, 5503, 5504, 5505, 5506, 5507, 5508, 5509, 5514, 5515, 5516, 5517, 5518, 5519, 5520, 5521, 5522, 5523, 5524, 5525, 5526, 5536, 5537, 5538, 5539, 5540, 5541, 5542, 5543, 5544, 5545, 5546, 5547, 5548, 5549, 5550, 5551, 5598, 5601, 5702, 5703, 5742, 5743, 5744, 5745, 5746, 5747, 5748, 5749, 5750, 5760, 5761, 5762, 5763, 5764, 5765, 5766, 5767, 5768, 5769, 5770, 5771, 5772, 5773, 5774, 5775, 5776, 5777, 5778, 5779, 5780, 5781, 5782, 5783, 5784, 5785, 5786, 5787, 5788, 7424, 7425, 7426, 7427, 7428, 7429, 7430, 7431, 7432, 7433, 7434, 7435, 7436, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7446, 7447, 7448, 7449, 7450, 7451, 7452, 7453, 7454, 7455, 7456, 7457, 7458, 7459, 7462, 7463, 7464, 7465, 7466, 7467, 7468, 7469, 7470, 7472, 7473, 7474, 7475, 7476, 7477, 7478, 7479, 7480, 7481, 7482, 7483, 7484, 7485, 7486, 7487, 7488, 7489, 7490, 7491, 7492, 7493, 7494, 7495, 7496, 7497, 7498, 7499, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7513, 7514, 7515, 7517, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7543, 7544, 7547, 7549, 7557, 7579, 7580, 7581, 7582, 7583, 7584, 7585, 7586, 7587, 7588, 7589, 7590, 7591, 7592, 7593, 7594, 7595, 7596, 7597, 7598, 7599, 7600, 7601, 7602, 7603, 7604, 7605, 7606, 7607, 7608, 7609, 7610, 7611, 7612, 7613, 7614, 7615, 7620, 7621, 7622, 7623, 7624, 7625, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7730, 7731, 7732, 7733, 7734, 7735, 7736, 7737, 7738, 7739, 7740, 7741, 7742, 7743, 7744, 7745, 7746, 7747, 7748, 7749, 7750, 7751, 7752, 7753, 7754, 7755, 7756, 7757, 7758, 7759, 7760, 7761, 7762, 7763, 7764, 7765, 7766, 7767, 7768, 7769, 7770, 7771, 7772, 7773, 7774, 7775, 7776, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789, 7790, 7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7812, 7813, 7814, 7815, 7816, 7817, 7818, 7819, 7820, 7821, 7822, 7823, 7824, 7825, 7826, 7827, 7828, 7829, 7830, 7831, 7832, 7833, 7834, 7835, 7836, 7837, 7838, 7839, 7840, 7841, 7842, 7843, 7844, 7845, 7846, 7847, 7848, 7849, 7850, 7851, 7852, 7853, 7854, 7855, 7856, 7857, 7858, 7859, 7860, 7861, 7862, 7863, 7864, 7865, 7866, 7867, 7868, 7869, 7870, 7871, 7872, 7873, 7874, 7875, 7876, 7877, 7878, 7879, 7880, 7881, 7882, 7883, 7884, 7885, 7886, 7887, 7888, 7889, 7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 7898, 7899, 7900, 7901, 7902, 7903, 7904, 7905, 7906, 7907, 7908, 7909, 7910, 7911, 7912, 7913, 7914, 7915, 7916, 7917, 7918, 7919, 7920, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7930, 7931, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7960, 7961, 7962, 7963, 7964, 7965, 7968, 7969, 7970, 7971, 7972, 7973, 7974, 7975, 7976, 7977, 7978, 7979, 7980, 7981, 7982, 7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991, 7992, 7993, 7994, 7995, 7996, 7997, 7998, 7999, 8e3, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8025, 8027, 8029, 8031, 8032, 8033, 8034, 8035, 8036, 8037, 8038, 8039, 8040, 8041, 8042, 8043, 8044, 8045, 8046, 8047, 8048, 8049, 8050, 8051, 8052, 8053, 8054, 8055, 8056, 8057, 8058, 8059, 8060, 8061, 8064, 8065, 8066, 8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8118, 8119, 8120, 8121, 8122, 8123, 8124, 8125, 8126, 8127, 8128, 8129, 8130, 8131, 8132, 8134, 8135, 8136, 8137, 8138, 8139, 8140, 8141, 8142, 8143, 8144, 8145, 8146, 8147, 8150, 8151, 8152, 8153, 8154, 8155, 8157, 8158, 8159, 8160, 8161, 8162, 8163, 8164, 8165, 8166, 8167, 8168, 8169, 8170, 8171, 8172, 8173, 8174, 8175, 8178, 8179, 8180, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207, 8208, 8209, 8210, 8211, 8212, 8213, 8214, 8215, 8216, 8217, 8218, 8219, 8220, 8221, 8222, 8223, 8224, 8225, 8226, 8227, 8228, 8229, 8230, 8231, 8232, 8233, 8234, 8235, 8236, 8237, 8238, 8239, 8240, 8241, 8242, 8243, 8244, 8245, 8246, 8247, 8248, 8249, 8250, 8251, 8252, 8253, 8254, 8255, 8256, 8257, 8258, 8259, 8260, 8261, 8262, 8263, 8264, 8265, 8266, 8267, 8268, 8269, 8270, 8271, 8272, 8273, 8274, 8275, 8276, 8277, 8278, 8279, 8280, 8281, 8282, 8283, 8284, 8285, 8286, 8287, 8288, 8289, 8290, 8291, 8292, 8298, 8299, 8300, 8301, 8302, 8303, 8304, 8305, 8308, 8309, 8310, 8311, 8312, 8313, 8314, 8315, 8316, 8317, 8318, 8319, 8320, 8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8352, 8353, 8354, 8355, 8356, 8357, 8358, 8359, 8360, 8361, 8362, 8363, 8364, 8365, 8366, 8367, 8368, 8369, 8370, 8371, 8372, 8373, 8376, 8377, 8378, 8381, 8400, 8401, 8406, 8407, 8411, 8412, 8417, 8448, 8449, 8450, 8451, 8452, 8453, 8454, 8455, 8456, 8457, 8459, 8460, 8461, 8462, 8463, 8464, 8465, 8466, 8467, 8468, 8469, 8470, 8471, 8472, 8473, 8474, 8475, 8476, 8477, 8478, 8479, 8480, 8481, 8482, 8483, 8484, 8485, 8486, 8487, 8488, 8489, 8490, 8491, 8492, 8493, 8494, 8495, 8496, 8497, 8498, 8499, 8500, 8501, 8502, 8503, 8504, 8505, 8506, 8507, 8508, 8509, 8510, 8511, 8512, 8513, 8514, 8515, 8516, 8517, 8518, 8519, 8520, 8521, 8523, 8526, 8528, 8529, 8530, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8538, 8539, 8540, 8541, 8542, 8543, 8544, 8545, 8546, 8547, 8548, 8549, 8550, 8551, 8552, 8553, 8554, 8555, 8556, 8557, 8558, 8559, 8560, 8561, 8562, 8563, 8564, 8565, 8566, 8567, 8568, 8569, 8570, 8571, 8572, 8573, 8574, 8575, 8576, 8577, 8578, 8579, 8580, 8581, 8585, 8592, 8593, 8594, 8595, 8596, 8597, 8598, 8599, 8600, 8601, 8602, 8603, 8604, 8605, 8606, 8607, 8608, 8609, 8610, 8611, 8612, 8613, 8614, 8615, 8616, 8617, 8618, 8619, 8620, 8621, 8622, 8623, 8624, 8625, 8626, 8627, 8628, 8629, 8630, 8631, 8632, 8633, 8634, 8635, 8636, 8637, 8638, 8639, 8640, 8641, 8642, 8643, 8644, 8645, 8646, 8647, 8648, 8649, 8650, 8651, 8652, 8653, 8654, 8655, 8656, 8657, 8658, 8659, 8660, 8661, 8662, 8663, 8664, 8665, 8666, 8667, 8668, 8669, 8670, 8671, 8672, 8673, 8674, 8675, 8676, 8677, 8678, 8679, 8680, 8681, 8682, 8683, 8684, 8685, 8686, 8687, 8688, 8689, 8690, 8691, 8692, 8693, 8694, 8695, 8696, 8697, 8698, 8699, 8700, 8701, 8702, 8703, 8704, 8705, 8706, 8707, 8708, 8709, 8710, 8711, 8712, 8713, 8714, 8715, 8716, 8717, 8718, 8719, 8720, 8721, 8722, 8723, 8724, 8725, 8726, 8727, 8728, 8729, 8730, 8731, 8732, 8733, 8734, 8735, 8736, 8737, 8738, 8739, 8740, 8741, 8742, 8743, 8744, 8745, 8746, 8747, 8748, 8749, 8750, 8751, 8752, 8753, 8754, 8755, 8756, 8757, 8758, 8759, 8760, 8761, 8762, 8763, 8764, 8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775, 8776, 8777, 8778, 8779, 8780, 8781, 8782, 8783, 8784, 8785, 8786, 8787, 8788, 8789, 8790, 8791, 8792, 8793, 8794, 8795, 8796, 8797, 8798, 8799, 8800, 8801, 8802, 8803, 8804, 8805, 8806, 8807, 8808, 8809, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817, 8818, 8819, 8820, 8821, 8822, 8823, 8824, 8825, 8826, 8827, 8828, 8829, 8830, 8831, 8832, 8833, 8834, 8835, 8836, 8837, 8838, 8839, 8840, 8841, 8842, 8843, 8844, 8845, 8846, 8847, 8848, 8849, 8850, 8851, 8852, 8853, 8854, 8855, 8856, 8857, 8858, 8859, 8860, 8861, 8862, 8863, 8864, 8865, 8866, 8867, 8868, 8869, 8870, 8871, 8872, 8873, 8874, 8875, 8876, 8877, 8878, 8879, 8880, 8881, 8882, 8883, 8884, 8885, 8886, 8887, 8888, 8889, 8890, 8891, 8892, 8893, 8894, 8895, 8896, 8897, 8898, 8899, 8900, 8901, 8902, 8903, 8904, 8905, 8906, 8907, 8908, 8909, 8910, 8911, 8912, 8913, 8914, 8915, 8916, 8917, 8918, 8919, 8920, 8921, 8922, 8923, 8924, 8925, 8926, 8927, 8928, 8929, 8930, 8931, 8932, 8933, 8934, 8935, 8936, 8937, 8938, 8939, 8940, 8941, 8942, 8943, 8944, 8945, 8946, 8947, 8948, 8949, 8950, 8951, 8952, 8953, 8954, 8955, 8956, 8957, 8958, 8959, 8960, 8961, 8962, 8963, 8964, 8965, 8966, 8967, 8968, 8969, 8970, 8971, 8972, 8973, 8974, 8975, 8976, 8977, 8984, 8985, 8988, 8989, 8990, 8991, 8992, 8993, 8996, 8997, 8998, 8999, 9e3, 9003, 9004, 9075, 9076, 9077, 9082, 9085, 9095, 9108, 9115, 9116, 9117, 9118, 9119, 9120, 9121, 9122, 9123, 9124, 9125, 9126, 9127, 9128, 9129, 9130, 9131, 9132, 9133, 9134, 9166, 9167, 9187, 9189, 9192, 9250, 9251, 9312, 9313, 9314, 9315, 9316, 9317, 9318, 9319, 9320, 9321, 9472, 9473, 9474, 9475, 9476, 9477, 9478, 9479, 9480, 9481, 9482, 9483, 9484, 9485, 9486, 9487, 9488, 9489, 9490, 9491, 9492, 9493, 9494, 9495, 9496, 9497, 9498, 9499, 9500, 9501, 9502, 9503, 9504, 9505, 9506, 9507, 9508, 9509, 9510, 9511, 9512, 9513, 9514, 9515, 9516, 9517, 9518, 9519, 9520, 9521, 9522, 9523, 9524, 9525, 9526, 9527, 9528, 9529, 9530, 9531, 9532, 9533, 9534, 9535, 9536, 9537, 9538, 9539, 9540, 9541, 9542, 9543, 9544, 9545, 9546, 9547, 9548, 9549, 9550, 9551, 9552, 9553, 9554, 9555, 9556, 9557, 9558, 9559, 9560, 9561, 9562, 9563, 9564, 9565, 9566, 9567, 9568, 9569, 9570, 9571, 9572, 9573, 9574, 9575, 9576, 9577, 9578, 9579, 9580, 9581, 9582, 9583, 9584, 9585, 9586, 9587, 9588, 9589, 9590, 9591, 9592, 9593, 9594, 9595, 9596, 9597, 9598, 9599, 9600, 9601, 9602, 9603, 9604, 9605, 9606, 9607, 9608, 9609, 9610, 9611, 9612, 9613, 9614, 9615, 9616, 9617, 9618, 9619, 9620, 9621, 9622, 9623, 9624, 9625, 9626, 9627, 9628, 9629, 9630, 9631, 9632, 9633, 9634, 9635, 9636, 9637, 9638, 9639, 9640, 9641, 9642, 9643, 9644, 9645, 9646, 9647, 9648, 9649, 9650, 9651, 9652, 9653, 9654, 9655, 9656, 9657, 9658, 9659, 9660, 9661, 9662, 9663, 9664, 9665, 9666, 9667, 9668, 9669, 9670, 9671, 9672, 9673, 9674, 9675, 9676, 9677, 9678, 9679, 9680, 9681, 9682, 9683, 9684, 9685, 9686, 9687, 9688, 9689, 9690, 9691, 9692, 9693, 9694, 9695, 9696, 9697, 9698, 9699, 9700, 9701, 9702, 9703, 9704, 9705, 9706, 9707, 9708, 9709, 9710, 9711, 9712, 9713, 9714, 9715, 9716, 9717, 9718, 9719, 9720, 9721, 9722, 9723, 9724, 9725, 9726, 9727, 9728, 9729, 9730, 9731, 9732, 9733, 9734, 9735, 9736, 9737, 9738, 9739, 9740, 9741, 9742, 9743, 9744, 9745, 9746, 9747, 9748, 9749, 9750, 9751, 9752, 9753, 9754, 9755, 9756, 9757, 9758, 9759, 9760, 9761, 9762, 9763, 9764, 9765, 9766, 9767, 9768, 9769, 9770, 9771, 9772, 9773, 9774, 9775, 9776, 9777, 9778, 9779, 9780, 9781, 9782, 9783, 9784, 9785, 9786, 9787, 9788, 9789, 9790, 9791, 9792, 9793, 9794, 9795, 9796, 9797, 9798, 9799, 9800, 9801, 9802, 9803, 9804, 9805, 9806, 9807, 9808, 9809, 9810, 9811, 9812, 9813, 9814, 9815, 9816, 9817, 9818, 9819, 9820, 9821, 9822, 9823, 9824, 9825, 9826, 9827, 9828, 9829, 9830, 9831, 9832, 9833, 9834, 9835, 9836, 9837, 9838, 9839, 9840, 9841, 9842, 9843, 9844, 9845, 9846, 9847, 9848, 9849, 9850, 9851, 9852, 9853, 9854, 9855, 9856, 9857, 9858, 9859, 9860, 9861, 9862, 9863, 9864, 9865, 9866, 9867, 9868, 9869, 9870, 9871, 9872, 9873, 9874, 9875, 9876, 9877, 9878, 9879, 9880, 9881, 9882, 9883, 9884, 9886, 9887, 9888, 9889, 9890, 9891, 9892, 9893, 9894, 9895, 9896, 9897, 9898, 9899, 9900, 9901, 9902, 9903, 9904, 9905, 9906, 9907, 9908, 9909, 9910, 9911, 9912, 9920, 9921, 9922, 9923, 9954, 9985, 9986, 9987, 9988, 9990, 9991, 9992, 9993, 9996, 9997, 9998, 9999, 1e4, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011, 10012, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10020, 10021, 10022, 10023, 10025, 10026, 10027, 10028, 10029, 10030, 10031, 10032, 10033, 10034, 10035, 10036, 10037, 10038, 10039, 10040, 10041, 10042, 10043, 10044, 10045, 10046, 10047, 10048, 10049, 10050, 10051, 10052, 10053, 10054, 10055, 10056, 10057, 10058, 10059, 10061, 10063, 10064, 10065, 10066, 10070, 10072, 10073, 10074, 10075, 10076, 10077, 10078, 10081, 10082, 10083, 10084, 10085, 10086, 10087, 10088, 10089, 10090, 10091, 10092, 10093, 10094, 10095, 10096, 10097, 10098, 10099, 10100, 10101, 10102, 10103, 10104, 10105, 10106, 10107, 10108, 10109, 10110, 10111, 10112, 10113, 10114, 10115, 10116, 10117, 10118, 10119, 10120, 10121, 10122, 10123, 10124, 10125, 10126, 10127, 10128, 10129, 10130, 10131, 10132, 10136, 10137, 10138, 10139, 10140, 10141, 10142, 10143, 10144, 10145, 10146, 10147, 10148, 10149, 10150, 10151, 10152, 10153, 10154, 10155, 10156, 10157, 10158, 10159, 10161, 10162, 10163, 10164, 10165, 10166, 10167, 10168, 10169, 10170, 10171, 10172, 10173, 10174, 10181, 10182, 10208, 10214, 10215, 10216, 10217, 10218, 10219, 10224, 10225, 10226, 10227, 10228, 10229, 10230, 10231, 10232, 10233, 10234, 10235, 10236, 10237, 10238, 10239, 10240, 10241, 10242, 10243, 10244, 10245, 10246, 10247, 10248, 10249, 10250, 10251, 10252, 10253, 10254, 10255, 10256, 10257, 10258, 10259, 10260, 10261, 10262, 10263, 10264, 10265, 10266, 10267, 10268, 10269, 10270, 10271, 10272, 10273, 10274, 10275, 10276, 10277, 10278, 10279, 10280, 10281, 10282, 10283, 10284, 10285, 10286, 10287, 10288, 10289, 10290, 10291, 10292, 10293, 10294, 10295, 10296, 10297, 10298, 10299, 10300, 10301, 10302, 10303, 10304, 10305, 10306, 10307, 10308, 10309, 10310, 10311, 10312, 10313, 10314, 10315, 10316, 10317, 10318, 10319, 10320, 10321, 10322, 10323, 10324, 10325, 10326, 10327, 10328, 10329, 10330, 10331, 10332, 10333, 10334, 10335, 10336, 10337, 10338, 10339, 10340, 10341, 10342, 10343, 10344, 10345, 10346, 10347, 10348, 10349, 10350, 10351, 10352, 10353, 10354, 10355, 10356, 10357, 10358, 10359, 10360, 10361, 10362, 10363, 10364, 10365, 10366, 10367, 10368, 10369, 10370, 10371, 10372, 10373, 10374, 10375, 10376, 10377, 10378, 10379, 10380, 10381, 10382, 10383, 10384, 10385, 10386, 10387, 10388, 10389, 10390, 10391, 10392, 10393, 10394, 10395, 10396, 10397, 10398, 10399, 10400, 10401, 10402, 10403, 10404, 10405, 10406, 10407, 10408, 10409, 10410, 10411, 10412, 10413, 10414, 10415, 10416, 10417, 10418, 10419, 10420, 10421, 10422, 10423, 10424, 10425, 10426, 10427, 10428, 10429, 10430, 10431, 10432, 10433, 10434, 10435, 10436, 10437, 10438, 10439, 10440, 10441, 10442, 10443, 10444, 10445, 10446, 10447, 10448, 10449, 10450, 10451, 10452, 10453, 10454, 10455, 10456, 10457, 10458, 10459, 10460, 10461, 10462, 10463, 10464, 10465, 10466, 10467, 10468, 10469, 10470, 10471, 10472, 10473, 10474, 10475, 10476, 10477, 10478, 10479, 10480, 10481, 10482, 10483, 10484, 10485, 10486, 10487, 10488, 10489, 10490, 10491, 10492, 10493, 10494, 10495, 10502, 10503, 10506, 10507, 10560, 10561, 10627, 10628, 10702, 10703, 10704, 10705, 10706, 10707, 10708, 10709, 10731, 10746, 10747, 10752, 10753, 10754, 10764, 10765, 10766, 10767, 10768, 10769, 10770, 10771, 10772, 10773, 10774, 10775, 10776, 10777, 10778, 10779, 10780, 10799, 10858, 10859, 10877, 10878, 10879, 10880, 10881, 10882, 10883, 10884, 10885, 10886, 10887, 10888, 10889, 10890, 10891, 10892, 10893, 10894, 10895, 10896, 10897, 10898, 10899, 10900, 10901, 10902, 10903, 10904, 10905, 10906, 10907, 10908, 10909, 10910, 10911, 10912, 10926, 10927, 10928, 10929, 10930, 10931, 10932, 10933, 10934, 10935, 10936, 10937, 10938, 11001, 11002, 11008, 11009, 11010, 11011, 11012, 11013, 11014, 11015, 11016, 11017, 11018, 11019, 11020, 11021, 11022, 11023, 11024, 11025, 11026, 11027, 11028, 11029, 11030, 11031, 11032, 11033, 11034, 11039, 11040, 11041, 11042, 11043, 11044, 11091, 11092, 11360, 11361, 11362, 11363, 11364, 11365, 11366, 11367, 11368, 11369, 11370, 11371, 11372, 11373, 11374, 11375, 11376, 11377, 11378, 11379, 11380, 11381, 11382, 11383, 11385, 11386, 11387, 11388, 11389, 11390, 11391, 11520, 11521, 11522, 11523, 11524, 11525, 11526, 11527, 11528, 11529, 11530, 11531, 11532, 11533, 11534, 11535, 11536, 11537, 11538, 11539, 11540, 11541, 11542, 11543, 11544, 11545, 11546, 11547, 11548, 11549, 11550, 11551, 11552, 11553, 11554, 11555, 11556, 11557, 11568, 11569, 11570, 11571, 11572, 11573, 11574, 11575, 11576, 11577, 11578, 11579, 11580, 11581, 11582, 11583, 11584, 11585, 11586, 11587, 11588, 11589, 11590, 11591, 11592, 11593, 11594, 11595, 11596, 11597, 11598, 11599, 11600, 11601, 11602, 11603, 11604, 11605, 11606, 11607, 11608, 11609, 11610, 11611, 11612, 11613, 11614, 11615, 11616, 11617, 11618, 11619, 11620, 11621, 11631, 11800, 11807, 11810, 11811, 11812, 11813, 11822, 19904, 19905, 19906, 19907, 19908, 19909, 19910, 19911, 19912, 19913, 19914, 19915, 19916, 19917, 19918, 19919, 19920, 19921, 19922, 19923, 19924, 19925, 19926, 19927, 19928, 19929, 19930, 19931, 19932, 19933, 19934, 19935, 19936, 19937, 19938, 19939, 19940, 19941, 19942, 19943, 19944, 19945, 19946, 19947, 19948, 19949, 19950, 19951, 19952, 19953, 19954, 19955, 19956, 19957, 19958, 19959, 19960, 19961, 19962, 19963, 19964, 19965, 19966, 19967, 42192, 42193, 42194, 42195, 42196, 42197, 42198, 42199, 42200, 42201, 42202, 42203, 42204, 42205, 42206, 42207, 42208, 42209, 42210, 42211, 42212, 42213, 42214, 42215, 42216, 42217, 42218, 42219, 42220, 42221, 42222, 42223, 42224, 42225, 42226, 42227, 42228, 42229, 42230, 42231, 42232, 42233, 42234, 42235, 42236, 42237, 42238, 42239, 42564, 42565, 42566, 42567, 42572, 42573, 42576, 42577, 42580, 42581, 42582, 42583, 42594, 42595, 42596, 42597, 42598, 42599, 42600, 42601, 42602, 42603, 42604, 42605, 42606, 42634, 42635, 42636, 42637, 42644, 42645, 42648, 42649, 42760, 42761, 42762, 42763, 42764, 42765, 42766, 42767, 42768, 42769, 42770, 42771, 42772, 42773, 42774, 42779, 42780, 42781, 42782, 42783, 42786, 42787, 42788, 42789, 42790, 42791, 42792, 42793, 42794, 42795, 42800, 42801, 42802, 42803, 42804, 42805, 42806, 42807, 42808, 42809, 42810, 42811, 42812, 42813, 42814, 42815, 42816, 42817, 42822, 42823, 42824, 42825, 42826, 42827, 42830, 42831, 42832, 42833, 42834, 42835, 42838, 42839, 42852, 42853, 42854, 42855, 42880, 42881, 42882, 42883, 42889, 42890, 42891, 42892, 42893, 42894, 42896, 42897, 42912, 42913, 42914, 42915, 42916, 42917, 42918, 42919, 42920, 42921, 42922, 43e3, 43001, 43002, 43003, 43004, 43005, 43006, 43007, 61184, 61185, 61186, 61187, 61188, 61189, 61190, 61191, 61192, 61193, 61194, 61195, 61196, 61197, 61198, 61199, 61200, 61201, 61202, 61203, 61204, 61205, 61206, 61207, 61208, 61209, 61440, 61441, 61442, 61443, 62464, 62465, 62466, 62467, 62468, 62469, 62470, 62471, 62472, 62473, 62474, 62475, 62476, 62477, 62478, 62479, 62480, 62481, 62482, 62483, 62484, 62485, 62486, 62487, 62488, 62489, 62490, 62491, 62492, 62493, 62494, 62495, 62496, 62497, 62498, 62499, 62500, 62501, 62502, 62504, 62505, 62506, 62507, 62508, 62509, 62510, 62511, 62512, 62513, 62514, 62515, 62516, 62517, 62518, 62519, 62520, 62521, 62522, 62523, 62524, 62525, 62526, 62527, 62528, 62529, 63173, 64256, 64257, 64258, 64259, 64260, 64261, 64262, 64275, 64276, 64277, 64278, 64279, 64285, 64286, 64287, 64288, 64289, 64290, 64291, 64292, 64293, 64294, 64295, 64296, 64297, 64298, 64299, 64300, 64301, 64302, 64303, 64304, 64305, 64306, 64307, 64308, 64309, 64310, 64312, 64313, 64314, 64315, 64316, 64318, 64320, 64321, 64323, 64324, 64326, 64327, 64328, 64329, 64330, 64331, 64332, 64333, 64334, 64335, 64338, 64339, 64340, 64341, 64342, 64343, 64344, 64345, 64346, 64347, 64348, 64349, 64350, 64351, 64352, 64353, 64354, 64355, 64356, 64357, 64358, 64359, 64360, 64361, 64362, 64363, 64364, 64365, 64366, 64367, 64368, 64369, 64370, 64371, 64372, 64373, 64374, 64375, 64376, 64377, 64378, 64379, 64380, 64381, 64382, 64383, 64384, 64385, 64386, 64387, 64388, 64389, 64390, 64391, 64392, 64393, 64394, 64395, 64396, 64397, 64398, 64399, 64400, 64401, 64402, 64403, 64404, 64405, 64406, 64407, 64408, 64409, 64410, 64411, 64412, 64413, 64414, 64415, 64416, 64417, 64418, 64419, 64426, 64427, 64428, 64429, 64467, 64468, 64469, 64470, 64471, 64472, 64473, 64474, 64475, 64476, 64478, 64479, 64484, 64485, 64486, 64487, 64488, 64489, 64508, 64509, 64510, 64511, 65024, 65025, 65026, 65027, 65028, 65029, 65030, 65031, 65032, 65033, 65034, 65035, 65036, 65037, 65038, 65039, 65056, 65057, 65058, 65059, 65136, 65137, 65138, 65139, 65140, 65142, 65143, 65144, 65145, 65146, 65147, 65148, 65149, 65150, 65151, 65152, 65153, 65154, 65155, 65156, 65157, 65158, 65159, 65160, 65161, 65162, 65163, 65164, 65165, 65166, 65167, 65168, 65169, 65170, 65171, 65172, 65173, 65174, 65175, 65176, 65177, 65178, 65179, 65180, 65181, 65182, 65183, 65184, 65185, 65186, 65187, 65188, 65189, 65190, 65191, 65192, 65193, 65194, 65195, 65196, 65197, 65198, 65199, 65200, 65201, 65202, 65203, 65204, 65205, 65206, 65207, 65208, 65209, 65210, 65211, 65212, 65213, 65214, 65215, 65216, 65217, 65218, 65219, 65220, 65221, 65222, 65223, 65224, 65225, 65226, 65227, 65228, 65229, 65230, 65231, 65232, 65233, 65234, 65235, 65236, 65237, 65238, 65239, 65240, 65241, 65242, 65243, 65244, 65245, 65246, 65247, 65248, 65249, 65250, 65251, 65252, 65253, 65254, 65255, 65256, 65257, 65258, 65259, 65260, 65261, 65262, 65263, 65264, 65265, 65266, 65267, 65268, 65269, 65270, 65271, 65272, 65273, 65274, 65275, 65276, 65279, 65529, 65530, 65531, 65532, 65533, 66304, 66305, 66306, 66307, 66308, 66309, 66310, 66311, 66312, 66313, 66314, 66315, 66316, 66317, 66318, 66319, 66320, 66321, 66322, 66323, 66324, 66325, 66326, 66327, 66328, 66329, 66330, 66331, 66332, 66333, 66334, 66336, 66337, 66338, 66339, 119552, 119553, 119554, 119555, 119556, 119557, 119558, 119559, 119560, 119561, 119562, 119563, 119564, 119565, 119566, 119567, 119568, 119569, 119570, 119571, 119572, 119573, 119574, 119575, 119576, 119577, 119578, 119579, 119580, 119581, 119582, 119583, 119584, 119585, 119586, 119587, 119588, 119589, 119590, 119591, 119592, 119593, 119594, 119595, 119596, 119597, 119598, 119599, 119600, 119601, 119602, 119603, 119604, 119605, 119606, 119607, 119608, 119609, 119610, 119611, 119612, 119613, 119614, 119615, 119616, 119617, 119618, 119619, 119620, 119621, 119622, 119623, 119624, 119625, 119626, 119627, 119628, 119629, 119630, 119631, 119632, 119633, 119634, 119635, 119636, 119637, 119638, 120120, 120121, 120123, 120124, 120125, 120126, 120128, 120129, 120130, 120131, 120132, 120134, 120138, 120139, 120140, 120141, 120142, 120143, 120144, 120146, 120147, 120148, 120149, 120150, 120151, 120152, 120153, 120154, 120155, 120156, 120157, 120158, 120159, 120160, 120161, 120162, 120163, 120164, 120165, 120166, 120167, 120168, 120169, 120170, 120171, 120224, 120225, 120226, 120227, 120228, 120229, 120230, 120231, 120232, 120233, 120234, 120235, 120236, 120237, 120238, 120239, 120240, 120241, 120242, 120243, 120244, 120245, 120246, 120247, 120248, 120249, 120250, 120251, 120252, 120253, 120254, 120255, 120256, 120257, 120258, 120259, 120260, 120261, 120262, 120263, 120264, 120265, 120266, 120267, 120268, 120269, 120270, 120271, 120272, 120273, 120274, 120275, 120792, 120793, 120794, 120795, 120796, 120797, 120798, 120799, 120800, 120801, 120802, 120803, 120804, 120805, 120806, 120807, 120808, 120809, 120810, 120811, 126464, 126465, 126466, 126467, 126469, 126470, 126471, 126472, 126473, 126474, 126475, 126476, 126477, 126478, 126479, 126480, 126481, 126482, 126483, 126484, 126485, 126486, 126487, 126488, 126489, 126490, 126491, 126492, 126493, 126494, 126495, 126497, 126498, 126500, 126503, 126505, 126506, 126507, 126508, 126509, 126510, 126511, 126512, 126513, 126514, 126516, 126517, 126518, 126519, 126521, 126523, 126561, 126562, 126564, 126567, 126568, 126569, 126570, 126572, 126573, 126574, 126575, 126576, 126577, 126578, 126580, 126581, 126582, 126583, 126585, 126586, 126587, 126588, 126590, 127024, 127025, 127026, 127027, 127028, 127029, 127030, 127031, 127032, 127033, 127034, 127035, 127036, 127037, 127038, 127039, 127040, 127041, 127042, 127043, 127044, 127045, 127046, 127047, 127048, 127049, 127050, 127051, 127052, 127053, 127054, 127055, 127056, 127057, 127058, 127059, 127060, 127061, 127062, 127063, 127064, 127065, 127066, 127067, 127068, 127069, 127070, 127071, 127072, 127073, 127074, 127075, 127076, 127077, 127078, 127079, 127080, 127081, 127082, 127083, 127084, 127085, 127086, 127087, 127088, 127089, 127090, 127091, 127092, 127093, 127094, 127095, 127096, 127097, 127098, 127099, 127100, 127101, 127102, 127103, 127104, 127105, 127106, 127107, 127108, 127109, 127110, 127111, 127112, 127113, 127114, 127115, 127116, 127117, 127118, 127119, 127120, 127121, 127122, 127123, 127136, 127137, 127138, 127139, 127140, 127141, 127142, 127143, 127144, 127145, 127146, 127147, 127148, 127149, 127150, 127153, 127154, 127155, 127156, 127157, 127158, 127159, 127160, 127161, 127162, 127163, 127164, 127165, 127166, 127169, 127170, 127171, 127172, 127173, 127174, 127175, 127176, 127177, 127178, 127179, 127180, 127181, 127182, 127183, 127185, 127186, 127187, 127188, 127189, 127190, 127191, 127192, 127193, 127194, 127195, 127196, 127197, 127198, 127199, 127761, 127762, 127763, 127764, 127765, 127766, 127767, 127768, 128045, 128046, 128049, 128053, 128512, 128513, 128514, 128515, 128516, 128517, 128518, 128519, 128520, 128521, 128522, 128523, 128524, 128525, 128526, 128527, 128528, 128529, 128530, 128531, 128532, 128533, 128534, 128535, 128536, 128537, 128538, 128539, 128540, 128541, 128542, 128543, 128544, 128545, 128546, 128547, 128549, 128550, 128551, 128552, 128553, 128554, 128555, 128557, 128558, 128559, 128560, 128561, 128562, 128563, 128564, 128565, 128566, 128567, 128568, 128569, 128570, 128571, 128572, 128573, 128574, 128575, 128576, 128579] };
    }
  });

  // src/fallback-coverage.json
  var fallback_coverage_default;
  var init_fallback_coverage = __esm({
    "src/fallback-coverage.json"() {
      fallback_coverage_default = { cjk: [[32, 126], [160, 259], [272, 275], [282, 283], [296, 299], [323, 324], [327, 328], [332, 335], [338, 339], [360, 365], [402, 402], [416, 417], [431, 432], [461, 476], [504, 505], [593, 593], [609, 609], [699, 699], [711, 711], [713, 715], [729, 729], [746, 747], [768, 769], [772, 772], [775, 775], [780, 780], [913, 929], [931, 937], [945, 969], [1025, 1025], [1040, 1103], [1105, 1105], [7742, 7743], [7840, 7929], [8194, 8195], [8208, 8214], [8216, 8218], [8220, 8222], [8224, 8226], [8229, 8231], [8240, 8240], [8242, 8243], [8245, 8245], [8249, 8252], [8258, 8258], [8263, 8265], [8273, 8273], [8308, 8308], [8361, 8361], [8363, 8364], [8413, 8414], [8448, 8448], [8451, 8451], [8453, 8453], [8457, 8458], [8463, 8463], [8467, 8467], [8470, 8470], [8481, 8482], [8486, 8487], [8491, 8491], [8494, 8494], [8501, 8501], [8507, 8507], [8544, 8555], [8560, 8571], [8592, 8601], [8632, 8633], [8644, 8646], [8651, 8652], [8656, 8656], [8658, 8658], [8660, 8660], [8678, 8681], [8693, 8693], [8704, 8704], [8706, 8707], [8709, 8715], [8719, 8719], [8721, 8723], [8725, 8725], [8730, 8730], [8733, 8736], [8739, 8739], [8741, 8750], [8756, 8759], [8765, 8765], [8771, 8771], [8773, 8773], [8776, 8776], [8780, 8780], [8800, 8802], [8804, 8807], [8810, 8811], [8814, 8815], [8818, 8819], [8822, 8823], [8834, 8839], [8842, 8843], [8853, 8857], [8864, 8864], [8869, 8869], [8895, 8895], [8922, 8923], [8943, 8943], [8965, 8967], [8978, 8978], [8984, 8984], [9001, 9002], [9136, 9137], [9150, 9164], [9166, 9166], [9178, 9179], [9251, 9251], [9312, 9643], [9649, 9651], [9654, 9655], [9660, 9661], [9664, 9665], [9670, 9671], [9673, 9676], [9678, 9683], [9698, 9702], [9711, 9711], [9728, 9731], [9733, 9734], [9737, 9737], [9742, 9743], [9750, 9751], [9756, 9759], [9775, 9775], [9792, 9794], [9824, 9839], [9842, 9853], [9888, 9888], [9917, 9918], [9986, 9986], [10003, 10003], [10010, 10010], [10045, 10045], [10047, 10048], [10070, 10070], [10102, 10131], [10145, 10145], [10548, 10549], [10687, 10687], [10746, 10747], [11013, 11015], [11034, 11034], [11157, 11157], [11834, 11835], [11904, 11929], [11931, 12019], [12032, 12245], [12272, 12283], [12288, 12351], [12353, 12438], [12441, 12543], [12549, 12591], [12593, 12643], [12645, 12686], [12688, 12731], [12736, 12771], [12784, 12830], [12832, 13099], [13101, 19893], [19968, 40943], [63744, 63747], [63749, 63750], [63755, 63756], [63765, 63765], [63767, 63770], [63777, 63777], [63788, 63789], [63791, 63791], [63793, 63797], [63799, 63802], [63811, 63811], [63815, 63818], [63822, 63822], [63826, 63827], [63838, 63838], [63842, 63847], [63854, 63854], [63858, 63858], [63860, 63860], [63862, 63862], [63865, 63867], [63870, 63872], [63876, 63877], [63882, 63884], [63886, 63886], [63891, 63891], [63893, 63893], [63896, 63896], [63918, 63918], [63923, 63923], [63927, 63927], [63931, 63931], [63933, 63934], [63936, 63936], [63941, 63942], [63952, 63952], [63960, 63961], [63964, 63968], [63970, 63972], [63975, 63975], [63977, 63977], [63985, 63985], [63988, 63989], [63994, 63994], [63997, 63997], [63999, 63999], [64002, 64002], [64005, 64008], [64010, 64010], [64012, 64015], [64017, 64017], [64019, 64020], [64024, 64024], [64031, 64033], [64035, 64036], [64039, 64041], [64047, 64047], [64051, 64053], [64055, 64056], [64058, 64058], [64071, 64071], [64073, 64073], [64075, 64075], [64093, 64094], [64256, 64260], [65040, 65049], [65072, 65106], [65108, 65126], [65128, 65131], [65281, 65439], [65441, 65470], [65474, 65479], [65482, 65487], [65490, 65495], [65498, 65500], [65504, 65510], [65512, 65518], [127232, 127244], [127248, 127340], [127344, 127404], [127488, 127490], [127504, 127547], [127552, 127560], [127568, 127569], [131207, 131207], [131209, 131209], [131276, 131276], [131428, 131428], [132648, 132648], [132726, 132726], [134352, 134352], [136090, 136090], [136211, 136211], [136663, 136663], [141711, 141711], [144843, 144843], [146583, 146584], [146979, 146979], [147966, 147966], [147982, 147982], [149737, 149737], [149979, 149979], [150017, 150017], [150141, 150141], [150217, 150217], [152882, 152882], [152930, 152930], [153e3, 153e3], [154327, 154327], [155351, 155351], [156193, 156193], [156813, 156813], [157302, 157302], [157564, 157564], [158033, 158033], [158556, 158556], [158753, 158753], [161970, 161970], [163503, 163503], [163767, 163767], [163833, 163833], [164872, 164872], [165496, 165496], [165525, 165525], [165856, 165856], [166729, 166729], [166983, 166983], [166991, 166991], [166993, 166993], [166996, 166996], [167439, 167439], [167577, 167577], [169599, 169599], [17e4, 17e4], [171902, 171902], [171907, 171907], [171916, 171916], [174045, 174045], [174331, 174331], [174359, 174359], [174640, 174640], [174646, 174646], [174680, 174680], [176034, 176034], [176423, 176424], [176439, 176440], [176621, 176621], [176896, 176896], [176995, 176995], [177007, 177007], [177010, 177010], [177021, 177021], [177156, 177156], [177168, 177168], [177171, 177171], [177249, 177249], [177383, 177383], [177391, 177391], [177398, 177398], [177401, 177401], [177421, 177422], [177462, 177462], [177582, 177583], [177587, 177587], [177639, 177639], [177652, 177652], [177692, 177693], [177702, 177704], [177706, 177706], [177708, 177708], [177813, 177814], [177837, 177837], [177901, 177901], [178089, 178089], [178117, 178117], [178150, 178150], [178169, 178169], [178172, 178172], [178182, 178182], [178186, 178186], [178204, 178204], [178360, 178360], [178887, 178887], [179039, 179039], [179042, 179042], [179068, 179068], [179075, 179075], [179227, 179227], [179575, 179575], [179591, 179591], [179703, 179703], [179753, 179753], [180265, 180266], [180393, 180393], [180426, 180426], [180693, 180693], [180697, 180697], [180729, 180729], [180860, 180860], [180872, 180872], [180900, 180900], [181015, 181015], [181083, 181083], [181089, 181089], [181092, 181092], [181384, 181384], [181396, 181396], [181399, 181399], [181570, 181570], [181779, 181779], [181784, 181784], [181793, 181793], [181801, 181801], [181803, 181805], [181807, 181807], [181826, 181826], [181834, 181835], [182060, 182060], [182063, 182063], [182175, 182175], [182209, 182209], [182269, 182269], [182489, 182489], [182494, 182494], [182497, 182497], [182515, 182515], [182535, 182535], [182538, 182538], [182557, 182557], [182786, 182786], [182798, 182798], [182909, 182909], [182953, 182953], [183081, 183081], [183085, 183086], [183089, 183089], [183096, 183097], [183099, 183099], [183103, 183103], [183105, 183105], [183114, 183114], [183118, 183118], [183130, 183131], [183140, 183140], [183145, 183145], [183148, 183148], [183151, 183151], [183155, 183155], [183158, 183158], [183160, 183160], [183164, 183164], [183217, 183217], [183231, 183232], [183246, 183246], [183382, 183382], [183391, 183391], [183541, 183542], [183549, 183549], [183551, 183551], [183554, 183555], [183562, 183562], [183691, 183691], [183693, 183693], [183695, 183696], [183711, 183712], [183720, 183720], [183725, 183726], [183765, 183765], [183832, 183832], [183834, 183834], [183843, 183843], [183846, 183846], [183850, 183850], [183932, 183932], [183944, 183944], [183955, 183955], [185668, 185668], [194692, 194692], [194742, 194742], [200413, 200414], [200812, 200812]], deva: [[13, 13], [32, 126], [160, 163], [165, 165], [167, 171], [173, 176], [180, 180], [182, 184], [186, 187], [191, 263], [266, 275], [278, 283], [286, 291], [294, 295], [298, 299], [302, 305], [310, 311], [313, 318], [321, 328], [336, 341], [344, 347], [350, 353], [356, 357], [362, 363], [366, 382], [536, 539], [567, 567], [700, 700], [710, 711], [713, 713], [728, 733], [768, 772], [774, 776], [778, 780], [806, 808], [2304, 2431], [7376, 7414], [7416, 7417], [7808, 7813], [7838, 7838], [7922, 7923], [8203, 8205], [8208, 8208], [8211, 8212], [8216, 8218], [8220, 8222], [8226, 8226], [8230, 8230], [8249, 8250], [8364, 8364], [8377, 8377], [8432, 8432], [8482, 8482], [8722, 8722], [9676, 9676], [43056, 43065], [43232, 43263], [72448, 72457]], hangul: [[4352, 4607], [12593, 12686], [43360, 43388], [44032, 55203], [55216, 55238], [55243, 55291]] };
    }
  });

  // src/modules/unicode.js
  function has(ranges, cp) {
    let low = 0, high = ranges.length - 1;
    while (low <= high) {
      const mid = low + high >>> 1, [start, end] = ranges[mid];
      if (cp < start) high = mid - 1;
      else if (cp > end) low = mid + 1;
      else return true;
    }
    return false;
  }
  function fontFor(char, preferred) {
    const cp = char.codePointAt(0);
    if (cp < 32 || base[preferred].has(cp)) return preferred;
    if (!cache.has(cp))
      cache.set(
        cp,
        ["deva", "hangul", "cjk"].find((key) => has(fallback_coverage_default[key], cp)) || (base.symbols.has(cp) ? "symbols" : base.sans.has(cp) ? "sans" : null)
      );
    return cache.get(cp);
  }
  function selectFonts(run2, preferred) {
    const out = [];
    for (const c of run2.text) {
      const font = /[\u200c\u200d\ufe0f]/.test(c) && out.at(-1)?.font || fontFor(c, preferred) || preferred;
      if (font === out.at(-1)?.font) out.at(-1).text += c;
      else out.push({ ...run2, text: c, font });
    }
    return out;
  }
  var base, cache;
  var init_unicode = __esm({
    "src/modules/unicode.js"() {
      init_font_coverage();
      init_fallback_coverage();
      base = Object.fromEntries(
        Object.entries(font_coverage_default).map(([font, cps]) => [font, new Set(cps)])
      );
      cache = /* @__PURE__ */ new Map();
    }
  });

  // src/modules/html-layout.js
  function eligible(el, box, css) {
    const scope = el.shadowRoot || el;
    if (!el.shadowRoot && !el.matches("div,section,article,figure,main") || el.matches(
      ".markdown,[data-message-author-role],[data-markdown-text-style]"
    ) || scope.querySelector(
      "table,pre,.katex,mjx-container,[data-message-author-role],input,textarea,select,iframe"
    ) || box.width < 110 || box.height < 36 || box.height > box.width * 2.8)
      return false;
    if (el.matches(
      "[data-testid*=flowchart i],[data-testid*=job-card i],[data-component*=flowchart i],[data-component*=job-card i],[aria-roledescription=flowchart i]"
    ))
      return true;
    const framed = parseFloat(css.borderTopWidth) > 0 && css.borderTopStyle !== "none";
    const action = scope.querySelector(
      "a[href],button,[role=button],[role=link]"
    );
    const win = el.ownerDocument.defaultView;
    if (!framed && !/grid|flex/.test(css.display)) return false;
    if (framed && action && scope.children.length > 0 && (el.innerText || scope.textContent).trim().length > 45)
      return true;
    const painted = [...scope.querySelectorAll("div,section")].filter((n) => {
      const style = win.getComputedStyle(n);
      return n.children.length < 5 && n.textContent.trim() && parseFloat(style.borderRadius) > 1 && (parseFloat(style.borderTopWidth) > 0 || (rgba(style.backgroundColor, el.ownerDocument)?.[3] || 0) > 0);
    });
    return painted.length >= 3 && Boolean(
      scope.querySelector("svg,img,[class*=arrow i],[class*=connector i]") || /[↓↑→←⬇⬆]/.test(el.innerText || scope.textContent) || [...scope.children].some(
        (n) => /grid|flex/.test(win.getComputedStyle(n).display) && n.children.length >= 2
      )
    );
  }
  function readHtmlLayout(root) {
    if (!root.shadowRoot && !root.matches("div,section,article,figure,main") || !(root.shadowRoot || root).children.length)
      return null;
    const doc = root.ownerDocument, win = doc.defaultView, box = root.getBoundingClientRect();
    if (!box.width || !eligible(root, box, win.getComputedStyle(root)) || (root.shadowRoot || root).querySelectorAll("*").length > 1600)
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
      height: num(box.height)
    });
    const assets = [], words = [];
    const colorCache = /* @__PURE__ */ new Map();
    function paint2(color) {
      if (!colorCache.has(color)) {
        const v = rgba(color, doc);
        colorCache.set(
          color,
          v?.[3] ? {
            color: `rgb(${v.slice(0, 3).map(Math.round).join(",")})`,
            alpha: v[3]
          } : null
        );
      }
      return colorCache.get(color);
    }
    function shape(g, r, s) {
      const x = num(r.left - box.left), y = num(r.top - box.top), w = num(r.width), h = num(r.height);
      const bg = paint2(s.backgroundColor), rad = Math.min(parseFloat(s.borderTopLeftRadius) || 0, h / 2, w / 2);
      if (bg)
        g.append(
          create("rect", {
            x,
            y,
            width: w,
            height: h,
            rx: rad,
            fill: bg.color,
            "fill-opacity": bg.alpha
          })
        );
      const sides = ["Top", "Right", "Bottom", "Left"];
      const widths = sides.map((k) => parseFloat(s["border" + k + "Width"]) || 0);
      const colors = sides.map((k) => s["border" + k + "Color"]);
      if (widths[0] > 0 && widths.every((v) => v === widths[0]) && colors.every((v) => v === colors[0])) {
        const b = widths[0], c = paint2(colors[0]);
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
              "stroke-width": b
            })
          );
      } else {
        const lines2 = [
          [x, y, x + w, y],
          [x + w, y, x + w, y + h],
          [x, y + h, x + w, y + h],
          [x, y, x, y + h]
        ];
        widths.forEach((v, i) => {
          const c = v && paint2(colors[i]);
          if (!c) return;
          const [x1, y1, x2, y2] = lines2[i];
          g.append(
            create("line", {
              x1,
              y1,
              x2,
              y2,
              stroke: c.color,
              "stroke-opacity": c.alpha,
              "stroke-width": v
            })
          );
        });
      }
    }
    const ctx = doc.createElement("canvas").getContext("2d"), metrics = /* @__PURE__ */ new Map();
    function textLine(g, text, rect, s) {
      if (!text || !rect.width || !rect.height) return;
      const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      if (!metrics.has(font)) {
        ctx.font = font;
        const m = ctx.measureText("Mg");
        metrics.set(
          font,
          m.fontBoundingBoxAscent - m.fontBoundingBoxDescent || parseFloat(s.fontSize) * 0.6
        );
      }
      const c = paint2(s.color);
      const t = create("text", {
        x: num(rect.left - box.left),
        y: num(rect.top - box.top + (rect.height + metrics.get(font)) / 2),
        fill: c?.color || "#111111",
        "fill-opacity": c?.alpha,
        "font-family": "sans",
        "font-size": s.fontSize,
        "font-weight": s.fontWeight,
        "font-style": s.fontStyle,
        "text-decoration": s.textDecorationLine === "none" ? void 0 : s.textDecorationLine
      });
      const runs = selectFonts({ text }, "sans");
      if (runs.length === 1) {
        t.setAttribute("font-family", runs[0].font);
        t.textContent = text;
      } else
        for (const run2 of runs) {
          const part = create("tspan", { "font-family": run2.font });
          part.textContent = run2.text;
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
      for (const m of n.data.matchAll(/\S+/gu)) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        if (rect && Math.abs(r.top - rect.top) > 1) flush();
        if (!rect) {
          first = m.index;
          rect = r;
        }
        last = m.index + m[0].length;
      }
      flush();
    }
    function draw(el, parent) {
      if (el.matches(skip)) return;
      const r = el.getBoundingClientRect(), s = win.getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0)
        return;
      const url = el.matches("a,[href],[role=link],[data-href],[data-url]") && linkOn(el), g = create(url ? "a" : "g", url ? { href: url } : {});
      if (Number(s.opacity) < 1) g.setAttribute("opacity", s.opacity);
      parent.append(g);
      if (el.matches("svg")) {
        const diagram = diagramSVG(el);
        if (diagram) {
          const svg = new win.DOMParser().parseFromString(
            diagram.svg,
            "image/svg+xml"
          ).documentElement;
          svg.setAttribute("x", num(r.left - box.left));
          svg.setAttribute("y", num(r.top - box.top));
          svg.setAttribute("width", num(r.width));
          svg.setAttribute("height", num(r.height));
          if (s.transform && s.transform !== "none") {
            const t = new win.DOMMatrix(s.transform), w = parseFloat(s.width), h = parseFloat(s.height);
            if (t.is2D && w > 0 && h > 0) {
              g.setAttribute(
                "transform",
                `translate(${num(r.left - box.left + r.width / 2)} ${num(r.top - box.top + r.height / 2)}) matrix(${t.a} ${t.b} ${t.c} ${t.d} 0 0) translate(${-w / 2} ${-h / 2})`
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
      if (bitmap || s.backgroundImage.includes("url(") && imageSource(el)) {
        const asset = imageRef(el);
        const index = assets.push({
          ...asset.image,
          x: num(r.left - box.left),
          y: num(r.top - box.top),
          width: num(r.width),
          height: num(r.height),
          fit: s.objectFit === "cover" || s.backgroundSize === "cover" ? "xMidYMid slice" : "xMidYMid meet"
        }) - 1;
        g.append(doc.createComment("asset-" + index));
        if (bitmap) return;
      }
      const children = el.matches("slot") && el.assignedNodes().length ? el.assignedNodes({ flatten: true }) : (el.shadowRoot || el).childNodes;
      for (const n of children) {
        if (n.nodeType === 1) draw(n, g);
        else if (n.nodeType === 3 && n.textContent.trim()) lines(n, g, s);
      }
      if (!el.textContent.trim() && (el.matches("button,[role=link],a") || el.matches("[class*=arrow i],[class*=connector i]"))) {
        const label = publicLabel(el);
        if (label) textLine(g, label, r, s);
      }
      for (const pseudo of ["::before", "::after"]) {
        const ps = win.getComputedStyle(el, pseudo);
        const m = /^["']([↓↑→←⬇⬆▼▲›»]+)["']$/.exec(ps.content);
        if (!m) continue;
        ctx.font = ps.font || `${ps.fontSize} sans-serif`;
        const w = ctx.measureText(m[1]).width;
        textLine(
          g,
          m[1],
          {
            left: r.left + (r.width - w) / 2,
            top: r.top,
            width: w,
            height: r.height || parseFloat(ps.lineHeight) || 16
          },
          ps
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
      assets
    };
  }
  var NS, skip, num;
  var init_html_layout = __esm({
    "src/modules/html-layout.js"() {
      init_diagram();
      init_pdf_style();
      init_links();
      init_unicode();
      init_media();
      NS = "http://www.w3.org/2000/svg";
      skip = "script,style,template,nav,aside,[data-cge],.turn-action-controls,[hidden],[data-testid*=reasoning i],[data-testid*=thought i]";
      num = (v) => Math.round(v * 100) / 100;
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
    if (node.matches('button,[role="button"]')) {
      const readable = contentButton(node);
      if (readable) {
        const next2 = { ...style, link: linkOn(node) || style.link };
        const children2 = [...node.childNodes].flatMap(
          (n) => inline(n, next2, read)
        );
        if (children2.some((r) => r.text.trim())) return children2;
      }
      const media = [...node.querySelectorAll("img,canvas,svg")].flatMap((el) => {
        if (!visible(el) && !(el.matches("svg[aria-hidden=true]") && visible(node) && el.getBoundingClientRect().width >= 48))
          return [];
        if (el.matches("img")) return meaningfulImage(el) ? [imageRef(el)] : [];
        if (el.matches("svg") && el.getBoundingClientRect().width < 48) return [];
        const run2 = semanticRun(el);
        return run2 ? [run2] : [];
      });
      if (media.length || !readable) return media;
      const label = publicLabel(node) || node.textContent.trim();
      return label ? [
        {
          text: label,
          ...read(node),
          ...style,
          link: linkOn(node) || style.link
        }
      ] : [];
    }
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
    const link = linkOn(node);
    if (link) next.link = link;
    const children = [...node.childNodes].flatMap((n) => inline(n, next, read));
    if (node.matches("a,[role=link],[data-entity-name]") && !children.some((r) => r.text.trim())) {
      const label = publicLabel(node) || node.textContent.trim();
      if (label) return [{ text: label, ...read(node), ...next }];
    }
    return children;
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
      (el) => [el, ...el.querySelectorAll("img,svg,canvas")].some((n) => {
        if (!n.matches("img,svg,canvas")) return false;
        const rect = n.getBoundingClientRect();
        return rect.width >= 32 && rect.height >= 24;
      })
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
        const layout2 = readHtmlLayout(el), children = blocks(el.shadowRoot, read);
        if (layout2) out.push({ ...layout2, blocks: children });
        else out.push(...children);
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
      const layout = readHtmlLayout(el);
      if (layout) {
        flush();
        out.push({ ...layout, blocks: blocks(el, read) });
        continue;
      }
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
      (b) => (b.type === "layout" && b.blocks?.length ? plainText(b.blocks) : b.text) ?? (b.runs ? b.runs.map((r) => r.text).join("") : b.items ? b.items.map(plainText).join("\n") : b.rows ? b.rows.map((row) => row.map((c) => plainText(c.blocks)).join(" | ")).join("\n") : b.blocks ? plainText(b.blocks) : "")
    ).join("\n");
  }
  var OMIT, BLOCK, equationSelector;
  var init_normalize = __esm({
    "src/modules/normalize.js"() {
      init_diagram();
      init_pdf_style();
      init_media();
      init_links();
      init_links();
      init_html_layout();
      OMIT = 'button,nav,[data-conversation-role]:is(h1,h2,h3,h4,h5,h6),.turn-action-controls,script,style,textarea,input,select,svg,[role="button"],[data-cge],[data-testid="thought-process"],[data-testid="reasoning"],.katex-html';
      BLOCK = "P,H1,H2,H3,H4,H5,H6,PRE,UL,OL,TABLE,BLOCKQUOTE,HR,DIV,SECTION,ARTICLE,FIGURE,FIGCAPTION,DETAILS,SUMMARY,FORM,FIELDSET";
      equationSelector = ".katex,math,[data-math],[data-latex],mjx-container";
    }
  });

  // src/modules/transfer.js
  var CHUNK = 512 * 1024;
  var BUDGET = 96 * 1024 * 1024;
  async function sendExport(document2, format, signal, progress) {
    const json = JSON.stringify(document2);
    if (json.length < 2 * CHUNK)
      return chrome.runtime.sendMessage({ type: "CGE_EXPORT", format, document: document2 });
    const bytes = new Blob([json]).size;
    if (bytes > BUDGET)
      throw new Error("This document exceeds the 96 MiB in-memory export limit.");
    const key = crypto.randomUUID();
    try {
      for (let offset = 0; offset < json.length; ) {
        signal.throwIfAborted();
        let end = Math.min(json.length, offset + CHUNK);
        if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
        const result = await chrome.runtime.sendMessage({
          type: "CGE_STAGE",
          key,
          offset,
          bytes,
          chunk: json.slice(offset, end)
        });
        if (!result?.ok)
          throw new Error(result?.error || "Document transfer interrupted.");
        offset = end;
        progress(
          `Preparing document\u2026 ${Math.round(100 * offset / json.length)}%`
        );
      }
      signal.throwIfAborted();
      return await chrome.runtime.sendMessage({
        type: "CGE_EXPORT",
        key,
        format,
        meta: { title: document2.title, scope: document2.scope }
      });
    } finally {
      await chrome.runtime.sendMessage({ type: "CGE_DISCARD", key }).catch(() => {
      });
    }
  }

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
        for (const a of b.assets || []) present.add(a.key);
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
  function snapshot(root = document, extract = extractMessage) {
    const nodes = messageNodes(root);
    if (!nodes.length)
      throw new Error(
        "No conversation detected. Open a ChatGPT conversation and refresh the page."
      );
    if (nodes.some((n) => !completed(n, nodes)))
      throw new Error(
        "A response is incomplete or its completion cannot be verified. Wait for completion and retry."
      );
    const result = nodes.map(extract);
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
    return root.scrollingElement || root.documentElement;
  }
  function scanReader(scroller) {
    const cache2 = /* @__PURE__ */ new WeakMap(), stamps = /* @__PURE__ */ new WeakMap();
    let revision = 0;
    function changed(node) {
      if (node?.nodeType !== 1) node = node?.parentElement;
      if (!node || node.closest("[data-cge]")) return;
      revision++;
      for (let p = node; p; p = p.parentElement) stamps.set(p, revision);
    }
    const observer2 = new MutationObserver(
      (records) => records.forEach((r) => changed(r.target))
    );
    observer2.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
    const event = (e) => changed(e.target);
    for (const name of ["load", "input", "change"])
      document.addEventListener(name, event, true);
    return {
      read() {
        observer2.takeRecords().forEach((r) => changed(r.target));
        const viewport = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
        return snapshot(document, (el, index, nodes) => {
          const rect = el.getBoundingClientRect(), inView = rect.bottom > viewport.top && rect.top < viewport.bottom;
          const turn = turnFor(el), roots = visualRoots(el), version = Math.max(
            stamps.get(turn) || 0,
            ...roots.map((n) => stamps.get(n) || 0)
          );
          const prior = cache2.get(el);
          if (prior?.turn === turn && (!inView || prior.top === rect.top) && prior.version === version && prior.roots.length === roots.length && roots.every((n, i) => n === prior.roots[i]))
            return { ...prior.message, order: index };
          const message = extractMessage(el, index, nodes);
          cache2.set(el, {
            turn,
            roots,
            version,
            message,
            top: inView ? rect.top : null
          });
          return message;
        });
      },
      close() {
        observer2.disconnect();
        for (const name of ["load", "input", "change"])
          document.removeEventListener(name, event, true);
      }
    };
  }
  async function collectHistory({
    signal,
    onProgress = () => {
    },
    stallTimeout = 9e4
  } = {}) {
    const route2 = location.href, scroller = scrollContainer(), original = scroller.scrollTop;
    const seen = /* @__PURE__ */ new Map(), reader = scanReader(scroller);
    let lastProgress = Date.now(), bestTop = scroller.scrollTop, descending = false, lastHeight = scroller.scrollHeight;
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
      if (isStreaming())
        throw new Error(
          "A response started streaming during collection. Wait for it to finish."
        );
    }
    function read() {
      guard();
      const beforeCount = seen.size;
      const current = reader.read();
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
        if (prior && (prior.turnIndex !== m.turnIndex || prior.blocks !== m.blocks && plainText(prior.blocks) !== plainText(m.blocks)))
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
      if (seen.size > keys.size) everUnmounted = true;
      if (!indexed && everUnmounted)
        throw new Error(
          "This page virtualizes messages without ordered turn identifiers. A reliable complete export is unavailable."
        );
      const top = scroller.scrollTop, height = scroller.scrollHeight;
      if ((descending ? top > bestTop + 1 : top < bestTop - 1) || height > lastHeight || seen.size > beforeCount)
        lastProgress = Date.now();
      else if (Date.now() - lastProgress > stallTimeout)
        throw new Error(
          `The chat stopped scrolling or loading after ${seen.size} messages. Wait for it to load and retry.`
        );
      bestTop = descending ? Math.max(bestTop, top) : Math.min(bestTop, top);
      lastHeight = Math.max(lastHeight, height);
      onProgress(
        `Collecting history\u2026 ${seen.size} messages \xB7 ${Math.min(100, Math.round(100 * (top + scroller.clientHeight) / Math.max(1, height)))}% of current scroll range (Escape cancels)`
      );
      return current;
    }
    async function scan2() {
      descending = false;
      bestTop = scroller.scrollTop;
      lastHeight = scroller.scrollHeight;
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
      descending = true;
      bestTop = scroller.scrollTop;
      lastProgress = Date.now();
      let bottomStable = 0;
      while (bottomStable < 3) {
        guard();
        const before = scroller.scrollTop;
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          before + Math.max(200, scroller.clientHeight * 0.7)
        );
        await sleep(220);
        read();
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        const edge = `${seen.size}:${scroller.scrollHeight}:${previous.at(-1)?.id}`;
        bottomStable = atBottom && edge === last ? bottomStable + 1 : 0;
        last = edge;
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
        lastProgress = Date.now();
        previous = [];
        uncertain = false;
        everUnmounted = false;
        onProgress("The page updated. Checking the settled conversation again\u2026");
        await sleep(350);
        return await scan2();
      }
    } finally {
      reader.close();
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
  var pendingImages;
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
  function askImageAccess(origins) {
    if (controller.signal.aborted) throw new Error("Export cancelled.");
    const dialog = document.createElement("dialog"), title2 = document.createElement("h2"), body = document.createElement("p");
    title2.textContent = "Include images from these sites?";
    body.textContent = "Open the ChatGPT Conversation Exporter icon in Chrome and click \u201CAllow images and continue\u201D. Chrome will ask about " + origins.map((o) => new URL(o).hostname).join(", ") + ". This export will resume here.";
    const signal = controller.signal;
    return new Promise((resolve2, reject) => {
      let settled = false, poll;
      const finish = (allow, cancel = false) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        signal.removeEventListener("abort", abort);
        pendingImages = null;
        dialog.close();
        dialog.remove();
        if (cancel) reject(new Error("Export cancelled."));
        else resolve2(allow);
      };
      const abort = () => finish(false, true);
      pendingImages = { token: crypto.randomUUID(), origins, finish };
      poll = setInterval(
        () => chrome.runtime.sendMessage({ type: "CGE_IMAGE_HAS_ACCESS", origins }).then((r) => {
          if (r?.granted === true) finish(true);
        }).catch(() => {
        }),
        1500
      );
      signal.addEventListener("abort", abort, { once: true });
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        abort();
      });
      dialog.append(
        title2,
        body,
        button("Continue without these images", () => finish(false)),
        button("Cancel export", abort)
      );
      panel.shadow.append(dialog);
      dialog.showModal();
    });
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
      feedback("Reading images for this export\u2026");
      await embedImages(messages, {
        requestAccess: askImageAccess,
        format,
        signal: controller.signal
      });
      if (controller.signal.aborted || location.href !== startRoute)
        throw new Error("Export cancelled or conversation changed.");
      const response = await sendExport(
        model,
        format,
        controller.signal,
        feedback
      );
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
    if (msg?.type === "CGE_IMAGE_DECISION") {
      if (!pendingImages || pendingImages.token !== msg.token) {
        reply({ ok: false });
        return;
      }
      pendingImages.finish(msg.granted === true);
      reply({ ok: true });
      return;
    }
    if (msg?.type === "CGE_PROBE") {
      reply({
        ok: true,
        messages: messageNodes().length,
        busy,
        imageAccess: pendingImages ? { token: pendingImages.token, origins: pendingImages.origins } : null
      });
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
