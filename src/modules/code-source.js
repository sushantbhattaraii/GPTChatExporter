// The isolated content script requests only the document bound to this code pane.
export const editorBody =
  ".cm-content,.CodeMirror-code,.monaco-editor .view-lines";
export const codeFrame =
  "pre,[data-code-block],[data-testid*=code-block i],.code-block";
export const codeBlock =
  "pre,.cm-editor,.cm-content,.CodeMirror,.monaco-editor,textarea[readonly][data-language]";
export const sourceRequest = "cge-read-code-document";
export const sourceReply = "cge-code-document";
const indexedLine = "[data-line-number],[aria-rowindex],[data-line]";
const totalSelector = "[data-line-count],[aria-rowcount]";
const gaps = ".cm-gap,.cm-lineGap,.cm-foldPlaceholder,[data-code-gap]";
const incomplete =
  "The full code for a scrollable snippet could not be verified. Expand the snippet in the chat and retry.";
let active;
class PendingPane extends Error {}

function editorSource(code) {
  let answer;
  const receive = (e) => {
    if (e.target !== code || typeof e.detail !== "string") return;
    try {
      const value = JSON.parse(e.detail);
      if (typeof value?.text === "string") answer = value;
    } catch {}
  };
  code.addEventListener(sourceReply, receive);
  try {
    code.dispatchEvent(
      new code.ownerDocument.defaultView.Event(sourceRequest, {
        bubbles: true,
        composed: true,
      }),
    );
  } finally {
    code.removeEventListener(sourceReply, receive);
  }
  return answer;
}
function numberedRows(code) {
  return [...code.querySelectorAll(indexedLine)].filter(
    (n) =>
      !n.closest(
        ".cm-gutters,.CodeMirror-gutters,.margin-view-overlays,[aria-hidden=true]",
      ) && !n.querySelector(indexedLine),
  );
}
function numberOf(row) {
  return Number(
    row.getAttribute("data-line-number") ??
      row.getAttribute("aria-rowindex") ??
      row.getAttribute("data-line"),
  );
}
export function codeSource(code, wrapper, readLine) {
  if (code.matches(editorBody)) {
    const model = editorSource(code);
    if (model) return model;
  }
  // A copy control may declare its full source. It belongs to this snippet
  // only when there is a single code body in this bounded frame.
  const frame = wrapper.closest(codeFrame) || wrapper;
  const scope =
    frame.closest(
      "[data-code-block],[data-testid*=code-block i],.code-block",
    ) || frame;
  const oneBody =
    scope.querySelectorAll("pre").length <= 1 &&
    scope.querySelectorAll(editorBody).length <= 1;
  const source =
    code.getAttribute("data-raw-code") ||
    wrapper.getAttribute("data-raw-code") ||
    code.getAttribute("data-source-code") ||
    (oneBody && scope.getAttribute("data-code")) ||
    (oneBody &&
      (scope.getAttribute("data-clipboard-text") ||
        scope
          .querySelector("[data-clipboard-text]")
          ?.getAttribute("data-clipboard-text")));
  if (typeof source === "string" && source) return { text: source };
  if (code.matches("textarea[readonly]")) return { text: code.value };
  const raw =
    oneBody &&
    scope.querySelector(
      "textarea[readonly][data-code-source],textarea[readonly][data-raw-code]",
    );
  if (raw) return { text: raw.value };
  if (!active) return;
  if (active.has(code)) return active.get(code);
  const ancestor = code.closest(totalSelector);
  const counts = ancestor && scope.contains(ancestor) ? ancestor : null;
  const count = Number(
    counts?.getAttribute("data-line-count") ??
      counts?.getAttribute("aria-rowcount"),
  );
  const indexed =
    Number.isSafeInteger(count) && count > 0 && numberedRows(code).length > 0;
  const blockGap =
    code.matches(".cm-content") &&
    code.querySelector(
      ":scope > .cm-gap,:scope > [data-code-gap],:scope > [contenteditable=false]:not(.cm-line)",
    );
  if (indexed || blockGap) {
    const pane = new PendingPane(incomplete);
    Object.assign(pane, { code, count: indexed ? count : 0, readLine });
    throw pane;
  }
  if (
    code.querySelector(gaps) ||
    code.matches(".CodeMirror-code,.monaco-editor .view-lines")
  )
    throw new Error(incomplete);
}
function localScroller(code) {
  for (
    let el = code;
    el &&
    !el.matches(
      "main,body,article,[data-message-author-role],[data-turn-key],.markdown",
    );
    el = el.parentElement
  ) {
    if (
      el.clientHeight &&
      el.scrollHeight > el.clientHeight + 1 &&
      /auto|scroll/.test(
        el.ownerDocument.defaultView.getComputedStyle(el).overflowY,
      )
    )
      return el;
  }
}
async function collectPane({ code, count, readLine }, signal) {
  const lines = new Map();
  const css = code.ownerDocument.defaultView.getComputedStyle(code);
  const padding = parseFloat(css.paddingTop) || 0;
  const scroller = localScroller(code);
  function collect() {
    if (signal?.aborted) throw new Error("Export cancelled.");
    if (!code.isConnected) throw new Error(incomplete);
    const origin =
      code.getBoundingClientRect().top +
      code.clientTop +
      padding -
      code.scrollTop;
    const rect = scroller?.getBoundingClientRect();
    const center = rect ? (rect.top + rect.bottom) / 2 : 0;
    let covered = false;
    const rows = count
      ? numberedRows(code)
      : code.querySelectorAll(":scope > .cm-line");
    for (const row of rows) {
      // Folded or horizontally omitted text cannot be reconstructed from y coordinates.
      if (row.querySelector(gaps + ",[contenteditable=false][style*=width]"))
        throw new Error(incomplete);
      const r = row.getBoundingClientRect();
      const key = count ? numberOf(row) : Math.round((r.top - origin) * 4) / 4;
      if (count && (!Number.isInteger(key) || key < 1 || key > count))
        throw new Error(incomplete);
      if (!count && !r.height) throw new Error(incomplete);
      const text = readLine(row);
      if (lines.has(key) && lines.get(key).text !== text)
        throw new Error("A code snippet changed during export. Please retry.");
      lines.set(key, { text, bottom: r.bottom - origin });
      if (r.top <= center && r.bottom >= center) covered = true;
    }
    return covered;
  }
  collect();
  if (!count || lines.size !== count) {
    if (!scroller) throw new Error(incomplete);
    const top = scroller.scrollTop,
      left = scroller.scrollLeft;
    try {
      const step = Math.max(1, Math.floor(scroller.clientHeight * 0.7));
      let previous = -1;
      for (let y = 0; ; y = scroller.scrollTop + step) {
        scroller.scrollTo({ top: y, left, behavior: "instant" });
        const deadline = Date.now() + 1600;
        do {
          await new Promise((resolve) => setTimeout(resolve, 40));
          if (collect() || (count && lines.size === count)) break;
        } while (Date.now() < deadline);
        if (
          (count && lines.size === count) ||
          scroller.scrollTop >=
            scroller.scrollHeight - scroller.clientHeight - 1
        )
          break;
        if (scroller.scrollTop <= previous) throw new Error(incomplete);
        previous = scroller.scrollTop;
      }
    } finally {
      scroller.scrollTo({ top, left, behavior: "instant" });
    }
  }
  const ordered = [...lines.entries()].sort(([a], [b]) => a - b);
  if (count) {
    if (lines.size !== count) throw new Error(incomplete);
  } else {
    // Unnumbered editors get a stronger check: line boxes must tile the entire
    // content area, including the space previously occupied by virtual spacers.
    let bottom = 0;
    for (const [top, row] of ordered) {
      if (Math.abs(top - bottom) > 1) throw new Error(incomplete);
      bottom = row.bottom;
    }
    const height =
      code.scrollHeight - padding - (parseFloat(css.paddingBottom) || 0);
    if (!ordered.length || Math.abs(bottom - height) > 1)
      throw new Error(incomplete);
  }
  return { text: ordered.map(([, r]) => r.text).join("\n") };
}
// Extraction is synchronous for normal blocks and model-backed editors. Only
// a virtual DOM-only pane needs to mount more rows, before its turn can unmount.
export async function withCompleteCode(
  read,
  { signal, includeCode = true } = {},
) {
  const sources = new WeakMap();
  for (;;) {
    if (signal?.aborted) throw new Error("Export cancelled.");
    let missing;
    active = includeCode ? sources : null;
    try {
      return read();
    } catch (e) {
      if (!(e instanceof PendingPane)) throw e;
      missing = e;
    } finally {
      active = null;
    }
    sources.set(missing.code, await collectPane(missing, signal));
  }
}
