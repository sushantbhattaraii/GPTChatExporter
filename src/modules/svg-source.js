// A byte response is treated as SVG only if it starts with an SVG document.
export function svgText(bytes) {
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}
export function svgHeader(text) {
  return /^\s*(?:(?:<\?xml\b[^?]*\?>|<!--[\s\S]*?-->|<!DOCTYPE\s+svg\b[^>[\]]*>)\s*)*<(?:[\w.-]+:)?svg(?=[\s/>])/i.test(
    text,
  );
}
export const svgDataURL = /^data:image\/svg\+xml(?:;[^,]*)?,/i;
export function svgDataText(url) {
  const header = svgDataURL.exec(url);
  if (!header || url.length > 36000000) return;
  const payload = url
    .slice(header[0].length)
    .split("#")[0]
    .replace(/%(?![\da-f]{2})/gi, "%25");
  const text = /;base64(?:;|,)/i.test(header[0])
    ? svgText(
        Uint8Array.from(atob(decodeURIComponent(payload)), (c) =>
          c.charCodeAt(0),
        ),
      )
    : decodeURIComponent(payload);
  if (text.length <= 12000000 && svgHeader(text)) return text;
}
