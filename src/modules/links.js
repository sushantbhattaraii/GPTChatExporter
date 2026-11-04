// A popover button may have a readable name without exposing a navigation URL.
export function safeLink(value, base = "https://chatgpt.com/") {
  if (typeof value !== "string" || !value.trim() || value.trim() === "#")
    return undefined;
  try {
    const u = new URL(value, base);
    return ["https:", "http:", "mailto:"].includes(u.protocol)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function linkOn(el) {
  const link = el.closest("a[href],[href][role=link],[data-href],[data-url]");
  if (!link) return undefined;
  return [link.getAttribute("href"), link.dataset.href, link.dataset.url]
    .map((value) => safeLink(value, el.ownerDocument.baseURI))
    .find(Boolean);
}
export function publicLabel(el) {
  const labelled = (el.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => el.getRootNode().getElementById?.(id)?.textContent?.trim())
    .filter(Boolean)
    .join(" ");
  return (
    el.getAttribute("data-entity-name") ||
    el.getAttribute("aria-label") ||
    labelled ||
    el.getAttribute("title") ||
    ""
  ).trim();
}
export function contentButton(el) {
  if (
    el.closest(
      "nav,aside,form,pre,code,[data-cge],.turn-action-controls,[role=toolbar],[data-code-block-controls]",
    )
  )
    return false;
  const label = el.textContent.trim() || publicLabel(el);
  if (
    !label ||
    /^(?:copy(?: code| response| answer)?|delete|share|retry|regenerate|read aloud|good response|bad response|more actions|open in new tab)$/i.test(
      label,
    )
  )
    return false;
  return Boolean(
    linkOn(el) ||
      el.querySelector("a[href]") ||
      el.closest(
        "td,th,h1,h2,h3,h4,h5,h6,b,strong,p,li,figcaption,[role=cell],[role=heading],[role=link],[data-entity-name],[data-testid*=entity i],[aria-haspopup]",
      ) ||
      (el.parentElement?.childElementCount === 1 &&
        el.parentElement.textContent.trim() === label),
  );
}
