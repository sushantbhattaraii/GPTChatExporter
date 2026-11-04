export const CSS = `
:host{all:initial;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#172335;color-scheme:light;--ink:#172335;--accent:#146d62}
*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer;border:1px solid #cfd8df;background:#fff;color:var(--ink);border-radius:8px;padding:7px 11px}button:hover{background:#edf6f4}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #3aa694;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.primary:hover{background:#0c594f}.pair{display:inline-block;margin:8px 0}.menu[hidden]{display:none}.menu{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.toolbar{position:fixed;right:12px;top:min(62px,9vh);max-width:calc(100vw - 24px);max-height:var(--cge-room,80vh);overflow:auto;z-index:2147483645;box-shadow:0 5px 24px #0002;border:1px solid #d8e3e0;background:#fff;border-radius:12px;padding:9px}.toolbar>div{display:flex;gap:6px}.status{max-width:320px;white-space:pre-wrap;font-size:12px;margin-top:7px}.status:empty{display:none}.status[data-state=error]{color:#a51c30}.status[data-state=success]{color:#08644d}dialog{color:var(--ink);background:#fff;border:1px solid #d8e3e0;border-radius:16px;padding:24px;width:min(520px,90vw);box-shadow:0 20px 90px #0004}dialog::backdrop{background:#14202a77}h2{font-size:20px;margin:0 0 12px}p{margin:10px 0}.preview{background:#f2f5f7;border-radius:8px;padding:12px;max-height:160px;overflow:auto;white-space:pre-wrap}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.small{font-size:12px;color:#536472}.check{display:flex;align-items:start;gap:8px}a{color:#146d62}
`;
// Keep a growing composer clear even with zoom, a short viewport or a multiline prompt.
export function positionToolbar(toolbar) {
  let composer, frame;
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const input = document.querySelector(
        'form[data-chatgpt-composer],#prompt-textarea,[contenteditable="true"][role="textbox"]',
      );
      const next = input?.closest("form,[data-chatgpt-composer]") || input;
      if (next !== composer) {
        observer.disconnect();
        composer = next;
        if (composer) observer.observe(composer);
      }
      const box = composer?.getBoundingClientRect();
      const top = Math.min(62, innerHeight * 0.09);
      const edge =
        box && box.height && box.right > innerWidth - 360
          ? Math.min(innerHeight, box.top)
          : innerHeight;
      const room = Math.floor(edge - top - 12);
      toolbar.style.setProperty("--cge-room", Math.max(0, room) + "px");
      toolbar.hidden = room < 46;
    });
  };
  const observer = new ResizeObserver(refresh);
  window.addEventListener("resize", refresh);
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  refresh();
  return refresh;
}
export function mount(parent, className) {
  const host = document.createElement("div");
  host.dataset.cge = className;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.append(style);
  parent?.append(host);
  return { host, shadow };
}
export function button(text, fn, primary = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (primary) b.className = "primary";
  b.addEventListener("click", fn);
  return b;
}
export function menu(shadow, label, onExport) {
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
  const run = (format) => {
    options.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    onExport(format);
  };
  const pdf = button("PDF", () => run("pdf")),
    word = button("Word (.docx)", () => run("docx"));
  const visual = button("PDF as shown", () => run("appearance"));
  visual.title =
    "Capture the displayed messages as static PDF pages. Click the Chrome extension icon first to allow tab capture.";
  options.append(pdf, visual, word);
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
  return () => {};
}
export async function review(shadow, data, format, settings) {
  const dialog = document.createElement("dialog");
  const h = document.createElement("h2");
  h.textContent = "Review conversation export";
  const p = document.createElement("p");
  p.textContent = `Collected ${data.messages.length} messages from the displayed branch. Check the beginning and end before downloading.`;
  const preview = document.createElement("div");
  preview.className = "preview";
  const { plainText } = await import("./normalize.js");
  preview.textContent = `FIRST: ${plainText(data.messages[0].blocks).slice(0, 220)}\n\nLAST: ${plainText(data.messages.at(-1).blocks).slice(0, 220)}`;
  const note = document.createElement("p");
  note.className = "small";
  note.textContent =
    "ChatGPT does not expose a DOM-only guarantee of complete history. Hidden branches are excluded. Equations are typeset where supported. Formatted exports embed readable images. PDF as shown captures the displayed pixels. " +
    (!settings.includeUsers ? "Your settings exclude user messages. " : "") +
    (!settings.includeCode ? "Your settings exclude code blocks. " : "");
  const label = document.createElement("label");
  label.className = "check";
  const check = document.createElement("input");
  check.type = "checkbox";
  label.append(
    check,
    document.createTextNode(
      "I have checked that the collected range is the one I want to export.",
    ),
  );
  const actions = document.createElement("div");
  actions.className = "actions";
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const cancel = button("Cancel", () => finish(false));
    const go = button(
      `Download ${format === "docx" ? "Word" : format === "appearance" ? "PDF as shown" : "PDF"}`,
      () => finish(true),
      true,
    );
    go.disabled = true;
    check.addEventListener("change", () => (go.disabled = !check.checked));
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
