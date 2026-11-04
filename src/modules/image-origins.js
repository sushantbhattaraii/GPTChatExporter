// Session credentials apply only to ChatGPT's image delivery endpoints.
export function allowedAsset(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.port || u.username || u.password)
      return false;
    if (u.hostname === "chatgpt.com")
      return /^\/backend-api\/(?:estuary\/content(?:\/|$)|files\/)/.test(
        u.pathname,
      );
    return (
      u.hostname === "images.openai.com" ||
      u.hostname === "oaiusercontent.com" ||
      u.hostname.endsWith(".oaiusercontent.com")
    );
  } catch {
    return false;
  }
}
export function publicImageOrigin(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.port ||
      u.username ||
      u.password ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|intranet|home|test)$/.test(
        u.hostname,
      ) ||
      u.hostname === "chatgpt.com" ||
      u.hostname.endsWith(".chatgpt.com")
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
