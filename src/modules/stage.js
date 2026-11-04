// Present the original live surface in Chrome's top layer. Its ancestors can no
// longer clip it. Keep its measured size and reserve its former place in flow.
export function stageSurface(part) {
  let surface = part;
  while (
    surface &&
    (typeof surface.showPopover !== "function" ||
      !surface.getBoundingClientRect().width)
  ) {
    surface = surface.parentElement;
  }
  if (
    !surface ||
    surface === document.body ||
    surface === document.documentElement ||
    surface.matches(":popover-open,dialog[open]")
  )
    throw new Error("This surface cannot be isolated while it is open.");
  const rect = surface.getBoundingClientRect(),
    source = part.getBoundingClientRect();
  const cs = getComputedStyle(surface),
    original = surface.getAttribute("popover");
  const spacer = document.createElement("span");
  const backdrop = document.createElement("style");
  // Put placement rules in a temporary stylesheet. This leaves the message's
  // inline style (including its exact formatting) intact in the ordinary case.
  const placement = document.createElement("style");
  let rule;
  const inlineOverrides = new Map();
  const originalStyle = surface.getAttribute("style");
  const keep = (name, value) => {
    if (surface.style.getPropertyPriority(name) === "important") {
      if (!inlineOverrides.has(name))
        inlineOverrides.set(name, surface.style.getPropertyValue(name));
      surface.style.removeProperty(name);
    }
    rule.style.setProperty(name, value, "important");
  };
  const paint = {};
  for (const key of [
    "display",
    "color",
    "background-color",
    "overflow-x",
    "overflow-y",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "border-top",
    "border-bottom",
    "border-left",
    "border-right",
  ])
    paint[key] = cs.getPropertyValue(key);
  const scale = Math.min(1, innerWidth / Math.max(source.width, 1));
  const marker = "cge-stage-" + crypto.randomUUID();
  let base = "white";
  for (let p = surface.parentElement; p; p = p.parentElement) {
    const color = getComputedStyle(p).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
      base = color;
      break;
    }
  }
  spacer.setAttribute("aria-hidden", "true");
  spacer.inert = true;
  spacer.style.cssText =
    "visibility:hidden!important;pointer-events:none!important;box-sizing:border-box!important;";
  for (const key of [
    "display",
    "margin-top",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "flex",
    "align-self",
    "grid-area",
    "order",
  ])
    spacer.style.setProperty(key, cs.getPropertyValue(key));
  spacer.style.width = rect.width + "px";
  spacer.style.height = rect.height + "px";
  const hadClass = surface.hasAttribute("class");
  let expectedStyle = originalStyle;
  function restore() {
    if (surface.matches(":popover-open")) surface.hidePopover();
    if (original === null) surface.removeAttribute("popover");
    else surface.setAttribute("popover", original);
    surface.classList.remove(marker);
    if (!hadClass && !surface.className) surface.removeAttribute("class");
    placement.remove();
    if (inlineOverrides.size) {
      if (surface.getAttribute("style") === expectedStyle) {
        if (originalStyle === null) surface.removeAttribute("style");
        else surface.setAttribute("style", originalStyle);
      } else
        for (const [name, val] of inlineOverrides)
          if (!surface.style.getPropertyValue(name))
            surface.style.setProperty(name, val, "important");
    }
    spacer.remove();
    backdrop.remove();
  }
  try {
    placement.textContent = `.${marker}.${marker}:popover-open{}`;
    document.head.append(placement);
    rule = placement.sheet.cssRules[0];
    surface.before(spacer);
    surface.classList.add(marker);
    backdrop.textContent = `.${marker}::backdrop{background:${base}!important;opacity:1!important;pointer-events:none!important}`;
    document.head.append(backdrop);
    surface.setAttribute("popover", "manual");
    for (const [key, value] of Object.entries(paint)) keep(key, value);
    for (const [key, value] of Object.entries({
      position: "fixed",
      inset: "auto",
      margin: "0",
      "box-sizing": "border-box",
      width: rect.width + "px",
      height: rect.height + "px",
      "max-width": "none",
      "max-height": "none",
      "min-width": "0",
      "min-height": "0",
      transform: `scale(${scale})`,
      "transform-origin": "0 0",
      transition: "none",
      animation: "none",
      left: "0px",
      top: "0px",
    }))
      keep(key, value);
    expectedStyle = surface.getAttribute("style");
    surface.showPopover();
    const initial = part.getBoundingClientRect();
    // Anchor the crop itself, including SVG descendants of an HTML surface.
    keep("left", -initial.left + "px");
    return {
      scale,
      width: source.width,
      height: source.height,
      originalLeft: source.left,
      reveal(offset) {
        keep("top", -initial.top - offset * scale + "px");
      },
      restore,
    };
  } catch (e) {
    restore();
    throw e;
  }
}
