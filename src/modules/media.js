import { displayedImageBox } from "./image-box.js";
import { linkOn } from "./links.js";
import { svgDataURL, svgDataText, svgHeader, svgText } from "./svg-source.js";
import { readSVGImage } from "./svg-image.js";
// Only images actually displayed in an exported message enter this export-scoped cache.
let session, exportFormat;
export function beginImages(format) {
  exportFormat = format;
  session = new Map();
}
export function endImages() {
  session = null;
  exportFormat = null;
}
export function meaningfulImage(img) {
  if (
    img.closest(
      'nav,aside,form,[data-cge],[hidden],template,[data-testid*="avatar" i]',
    )
  )
    return false;
  const rect = img.getBoundingClientRect();
  return !(
    rect.width > 0 &&
    rect.height > 0 &&
    rect.width <= 24 &&
    rect.height <= 24
  );
}
const canvasIds = new WeakMap();
const occurrences = new WeakMap();
let nextOccurrence = 0;
function imgURLs(el) {
  const lazy =
    el.getAttribute("data-src") ||
    el.getAttribute("data-lazy-src") ||
    el.getAttribute("data-original");
  const current = el.currentSrc || el.getAttribute("src");
  const picture = el.parentElement?.matches("picture")
    ? [...el.parentElement.querySelectorAll("source")].filter(
        (n) =>
          !n.media || el.ownerDocument.defaultView.matchMedia(n.media).matches,
      )
    : [];
  const sets = [...picture, el]
    .flatMap((n) => [n.getAttribute("srcset"), n.getAttribute("data-srcset")])
    .filter(Boolean);
  const sizes = sets.flatMap((set) =>
    set
      .split(/,\s*(?=[^,]+\s+[\d.]+[wx])/)
      .map((v) => v.trim().split(/\s/)[0])
      .reverse(),
  );
  const deferred = lazy || sizes.length;
  const placeholder =
    !current ||
    (current.startsWith("data:") && !el.naturalWidth) ||
    (el.complete && el.naturalWidth <= 2);
  const values =
    deferred && placeholder
      ? [lazy, ...sizes]
      : [current, lazy, ...sizes, el.getAttribute("src")];
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => {
          try {
            return new URL(value, el.ownerDocument.baseURI).href;
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ];
}
export function imageSource(el) {
  if (el.tagName === "IMG") return imgURLs(el)[0] || "";
  if (el.tagName === "CANVAS") return "";
  const css =
    el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage || "";
  return css.match(/url\((["']?)(.*?)\1\)/)?.[2] || "";
}
export function imageRef(
  el,
  style = el.ownerDocument.defaultView.getComputedStyle(el),
  rect = el.getBoundingClientRect(),
) {
  const source = imageSource(el),
    alt = el.alt || el.getAttribute("aria-label") || "Image";
  if (!source && !canvasIds.has(el))
    canvasIds.set(el, "surface-" + crypto.randomUUID());
  const key = source || canvasIds.get(el);
  if (session && (source || el.tagName === "CANVAS")) {
    const old = session.get(key);
    // Freeze readable pixels before scrolling can evict or recycle the source.
    const item = {
      el,
      source,
      urls: el.tagName === "IMG" ? imgURLs(el) : [source],
      pixels: old?.pixels,
      tried: old?.tried,
      blob: old?.blob,
    };
    // A virtualized turn can revoke its blob URL as soon as it leaves the DOM.
    if (exportFormat === "pdf" && !item.blob && localBlob(source, el))
      item.blob = fetchBlob(source).catch(() => null);
    if (
      !item.pixels &&
      item.tried !== el &&
      (el.tagName === "CANVAS" ||
        (el.complete && el.naturalWidth > 1 && el.currentSrc === source))
    ) {
      try {
        item.pixels = raster(el);
      } catch {} // Cross-origin bitmaps require a byte fetch.
      item.tried = el;
    }
    session.set(key, item);
  }
  if (!occurrences.has(el)) occurrences.set(el, ++nextOccurrence);
  return {
    text: `[Image: ${alt}]`,
    image: {
      key,
      alt,
      occurrence: occurrences.get(el),
      display: displayedImageBox(el, style, rect),
      link: linkOn(el),
    },
  };
}
function raster(el, printSize) {
  const width = el.naturalWidth || el.width,
    height = el.naturalHeight || el.height;
  if (!width || !height) throw new Error("Image has not loaded");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = printSize?.width || Math.max(1, Math.round(width * scale));
  canvas.height = printSize?.height || Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL("image/png");
  if (!printSize && data.length > 400000) {
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
export function decodeRaster(data) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,(.+)$/i.exec(
    data,
  );
  if (!match) throw new Error("Invalid raster data");
  return createImageBitmap(
    new Blob([Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))], {
      type: match[1],
    }),
  );
}
function localBlob(url, el) {
  if (!url.startsWith("blob:")) return false;
  try {
    return new URL(url).origin === el.ownerDocument.location.origin;
  } catch {
    return false;
  }
}
async function fetchBlob(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return response.ok && blob.size <= 12000000 ? blob : null;
}
function mayBeSVG(url) {
  if (url.startsWith("data:")) return svgDataURL.test(url);
  // A signed or extensionless image URL may resolve to SVG. Known bitmap
  // formats keep their existing pixel path without another network request.
  return !/\.(?:png|jpe?g|webp|gif|avif|bmp|ico)(?:[?#]|$)/i.test(url);
}
function printSize(vector, display) {
  const { width, height } = vector;
  const factor = Math.min(
    Math.max(
      1,
      (4 * (display.width || width)) / width,
      (4 * (display.height || height)) / height,
    ),
    4096 / Math.max(width, height),
    Math.sqrt(12000000 / (width * height)),
  );
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}
async function fromSVG(text, item, format, display, fragment = "") {
  if (!text) return;
  const source = readSVGImage(text, item.el);
  if (!source) return;
  if (format === "pdf" && source.svg && !fragment) return source;
  if (format !== "pdf" && item.pixels) return item.pixels;
  // Unsupported SVG effects are rendered in the browser's isolated image
  // mode. Size the SVG before decoding, so its intrinsic thumbnail resolution
  // cannot cap the print bitmap.
  const size =
    format === "pdf"
      ? printSize(source, display)
      : { width: source.width, height: source.height };
  const root =
    source.rasterRoot ||
    new DOMParser().parseFromString(
      (!fragment && source.svg) || text,
      "image/svg+xml",
    ).documentElement;
  root
    .querySelectorAll("script,animate,animateTransform,set,iframe,object,embed")
    .forEach((n) => n.remove());
  if (!root.hasAttribute("viewBox"))
    root.setAttribute("viewBox", `0 0 ${source.width} ${source.height}`);
  root.setAttribute("width", size.width);
  root.setAttribute("height", size.height);
  root.style.setProperty("width", size.width + "px", "important");
  root.style.setProperty("height", size.height + "px", "important");
  const img = new Image();
  img.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(root)) +
    fragment;
  await img.decode();
  const result = raster(img, format === "pdf" ? size : undefined);
  // Layout uses original proportions even when the fallback carries more pixels.
  return { ...result, width: source.width, height: source.height };
}
async function resolve(ref, format, display) {
  const item = session?.get(ref.key);
  if (!item) return null;
  const tryVector = format === "pdf" && item.urls.some(mayBeSVG);
  if (item.pixels && !tryVector) return item.pixels;
  if (
    item.el.tagName === "IMG" &&
    !item.el.complete &&
    item.el.currentSrc === item.source
  )
    await Promise.race([
      item.el.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 1600)),
    ]);
  if (
    !item.pixels &&
    (item.el.tagName === "CANVAS" ||
      (item.el.complete &&
        item.el.naturalWidth > 1 &&
        item.el.currentSrc === item.source))
  ) {
    try {
      item.pixels = raster(item.el);
    } catch {}
  }
  if (item.pixels && !tryVector) return item.pixels;
  let permissionOrigin;
  for (let source of item.urls) {
    try {
      let bitmap;
      const fragment = new URL(source).hash;
      if (localBlob(source, item.el)) {
        const blob = await (item.blob || fetchBlob(source));
        if (!blob) continue;
        if (
          blob.type.split(";")[0] === "image/svg+xml" ||
          svgHeader(
            svgText(new Uint8Array(await blob.slice(0, 65536).arrayBuffer())),
          )
        ) {
          const result = await fromSVG(
            svgText(new Uint8Array(await blob.arrayBuffer())),
            item,
            format,
            display,
            fragment,
          );
          if (result) return result;
          continue;
        }
        if (item.pixels) return item.pixels;
        bitmap = await createImageBitmap(blob);
      } else {
        if (!source.startsWith("data:")) {
          if (new URL(source).protocol !== "https:") continue;
          if (item.pixels && !mayBeSVG(source)) return item.pixels;
          const result = await chrome.runtime.sendMessage({
            type: "CGE_IMAGE",
            url: source,
          });
          if (!result?.ok) {
            permissionOrigin ||= result?.permissionOrigin;
            continue;
          }
          source = result.data;
        }
        if (svgDataURL.test(source)) {
          const result = await fromSVG(
            svgDataText(source),
            item,
            format,
            display,
            fragment,
          );
          if (result) return result;
          continue;
        }
        if (item.pixels) return item.pixels;
        bitmap = await decodeRaster(source);
      }
      try {
        return raster(bitmap);
      } finally {
        bitmap.close();
      }
    } catch {
      /* Try another source actually named in the displayed image. */
    }
  }
  if (
    item.pixels &&
    format === "pdf" &&
    item.el.tagName === "IMG" &&
    item.el.currentSrc === item.source &&
    (svgDataURL.test(item.source) || /\.svg(?:[?#]|$)/i.test(item.source))
  ) {
    // The browser may still have a drawable SVG even if its source bytes are
    // inaccessible on a second read. Redraw that image at print size.
    try {
      return {
        ...raster(item.el, printSize(item.pixels, display)),
        width: item.pixels.width,
        height: item.pixels.height,
      };
    } catch {}
  }
  return item.pixels || (permissionOrigin ? { permissionOrigin } : null);
}
export async function embedImages(
  messages,
  { requestAccess, format, signal } = {},
) {
  const slots = new Map(),
    pixels = new Map();
  function add(ref, set) {
    if (!slots.has(ref.key))
      slots.set(ref.key, {
        ref,
        setters: [],
        display: { width: 0, height: 0 },
      });
    const slot = slots.get(ref.key),
      box = ref.display?.crop || ref.display;
    slot.display.width = Math.max(slot.display.width, box?.width || 0);
    slot.display.height = Math.max(slot.display.height, box?.height || 0);
    slot.setters.push(set);
  }
  function visit(bs) {
    for (const b of bs) {
      if (b.type === "image" && !(format === "pdf" && b.image.display?.hidden))
        add(b.image, (data) => {
          const { alt, display, link } = b.image;
          b.image = { alt, display, link, ...data };
        });
      if (b.type === "layout" && format === "docx") {
        delete b.assets;
        delete b.svg;
      }
      if (b.type === "layout" && format === "pdf") b.blocks = [];
      for (const asset of b.assets || [])
        add(asset, (data) => {
          delete asset.key;
          delete asset.occurrence;
          Object.assign(asset, {
            data: data.data,
            svg: data.svg,
            rasterWidth: data.width,
            rasterHeight: data.height,
          });
        });
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
        const slot = slots.get(key);
        pixels.set(key, await resolve(slot.ref, format, slot.display));
      }
    }
    await Promise.all(Array.from({ length: Math.min(keys.length, 4) }, worker));
  }
  await resolveKeys([...slots.keys()]);
  const denied = [...pixels].filter(([, data]) => data?.permissionOrigin);
  if (
    denied.length &&
    requestAccess &&
    (await requestAccess([
      ...new Set(denied.map(([, d]) => d.permissionOrigin)),
    ]))
  ) {
    await resolveKeys(denied.map(([key]) => key));
  }
  for (const [key, item] of slots) {
    const data = pixels.get(key);
    for (const set of item.setters) set(data?.data || data?.svg ? data : {});
  }
}
// Move images out of inline runs so both document engines preserve their original order.
export function liftImages(bs) {
  return bs.flatMap((b) => {
    if (b.runs?.some((r) => r.image || r.diagram || r.widget)) {
      const out = [];
      let runs = [];
      const flush = () => {
        if (runs.length) out.push({ ...b, runs });
        runs = [];
      };
      for (const run of b.runs) {
        if (run.diagram || run.widget) {
          flush();
          out.push(run.diagram || run.widget);
        } else if (run.image) {
          flush();
          out.push({ type: "image", image: run.image, text: run.text });
        } else runs.push(run);
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
