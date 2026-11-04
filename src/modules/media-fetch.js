// This path accepts only known image delivery endpoints and OpenAI's media CDN.
export function allowedAsset(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password)
      return false;
    if (url.hostname === "chatgpt.com")
      return /^\/backend-api\/(?:estuary\/content(?:\/|$)|files\/)/.test(
        url.pathname,
      );
    return (
      url.hostname === "oaiusercontent.com" ||
      url.hostname.endsWith(".oaiusercontent.com")
    );
  } catch {
    return false;
  }
}
export async function readDisplayedAsset(value, sender) {
  if (
    !sender.tab ||
    !sender.url?.startsWith("https://chatgpt.com/") ||
    !allowedAsset(value)
  )
    throw new Error("Image origin is unavailable");
  const res = await fetch(value, {
    credentials: new URL(value).hostname === "chatgpt.com" ? "include" : "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(12000),
  });
  let type = res.headers.get("Content-Type")?.split(";")[0].toLowerCase();
  if (
    !res.ok ||
    !allowedAsset(res.url) ||
    !(
      type === "application/octet-stream" ||
      /^image\/(png|jpeg|webp|gif|avif)$/.test(type)
    )
  )
    throw new Error("Image could not be read");
  const reader = res.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value: bytes } = await reader.read();
    if (done) break;
    size += bytes.length;
    if (size > 12_000_000) {
      await reader.cancel();
      throw new Error("Image exceeds 12 MB");
    }
    chunks.push(bytes);
  }
  const joined = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    joined.set(chunk, pos);
    pos += chunk.length;
  }
  if (type === "application/octet-stream") {
    const head = String.fromCharCode(...joined.subarray(0, 16));
    if (head.startsWith("\x89PNG\r\n\x1a\n")) type = "image/png";
    else if (joined[0] === 255 && joined[1] === 216 && joined[2] === 255)
      type = "image/jpeg";
    else if (head.startsWith("GIF87a") || head.startsWith("GIF89a"))
      type = "image/gif";
    else if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
      type = "image/webp";
    else throw new Error("Asset is not a supported image.");
  }
  let binary = "";
  for (let i = 0; i < size; i += 8192)
    binary += String.fromCharCode(...joined.subarray(i, i + 8192));
  return { ok: true, data: `data:${type};base64,${btoa(binary)}` };
}
