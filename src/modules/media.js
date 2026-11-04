import { displayedImageBox } from "./image-box.js";
import { linkOn } from "./links.js";
// Only images actually displayed in an exported message enter this export-scoped cache.
let session;
export function beginImages() {
  session = new Map();
}
export function endImages() {
  session = null;
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
    };
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
function raster(el) {
  const width = el.naturalWidth || el.width,
    height = el.naturalHeight || el.height;
  if (!width || !height) throw new Error("Image has not loaded");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL("image/png");
  if (data.length > 400000) {
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
async function resolve(ref) {
  const item = session?.get(ref.key);
  if (!item) return null;
  if (item.pixels) return item.pixels;
  if (
    item.el.tagName === "IMG" &&
    !item.el.complete &&
    item.el.currentSrc === item.source
  ) {
    await Promise.race([
      item.el.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 1600)),
    ]);
  }
  if (
    item.el.tagName === "CANVAS" ||
    (item.el.complete &&
      item.el.naturalWidth > 1 &&
      item.el.currentSrc === item.source)
  ) {
    try {
      return raster(item.el);
    } catch {}
  }
  let permissionOrigin;
  for (let source of item.urls) {
    try {
      const u = new URL(source, item.el.ownerDocument.baseURI);
      let bitmap;
      if (
        u.protocol === "blob:" &&
        u.origin === item.el.ownerDocument.location.origin
      ) {
        const response = await fetch(u.href);
        const blob = await response.blob();
        if (!response.ok || blob.size > 12_000_000) continue;
        bitmap = await createImageBitmap(blob);
      } else {
        if (!/^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(source)) {
          if (u.protocol !== "https:") continue;
          const result = await chrome.runtime.sendMessage({
            type: "CGE_IMAGE",
            url: u.href,
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
      /* Try the source or responsive alternative actually named in the page. */
    }
  }
  return permissionOrigin ? { permissionOrigin } : null;
}
export async function embedImages(
  messages,
  { requestAccess, format, signal } = {},
) {
  const slots = new Map(),
    pixels = new Map();
  function add(ref, set) {
    if (!slots.has(ref.key)) slots.set(ref.key, { ref, setters: [] });
    slots.get(ref.key).setters.push(set);
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
        pixels.set(key, await resolve(slots.get(key).ref));
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
    for (const set of item.setters) set(data?.data ? data : {});
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
