import { generatePDF } from "./modules/pdf-exporter.js";
import { generateDOCX } from "./modules/docx-exporter.js";
const blobs = new Map();
let generating = false;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "RELEASE") {
    const entry = blobs.get(msg.key);
    if (entry) {
      URL.revokeObjectURL(entry.url);
      clearTimeout(entry.timer);
      blobs.delete(msg.key);
    }
    reply({ ok: true });
    return;
  }
  if (msg.type !== "GENERATE") return;
  if (generating) {
    reply({
      ok: false,
      error: "Another document is being generated. Retry after it finishes.",
    });
    return;
  }
  generating = true;
  const heartbeat = setInterval(
    () => chrome.runtime.sendMessage({ type: "CGE_PING" }).catch(() => {}),
    20000,
  );
  (async () => {
    const blob = await (msg.format === "pdf"
      ? generatePDF(msg.document, msg.settings)
      : generateDOCX(msg.document, msg.settings));
    const url = URL.createObjectURL(blob);
    const timer = setTimeout(
      () => {
        URL.revokeObjectURL(url);
        blobs.delete(msg.key);
      },
      30 * 60 * 1000,
    );
    blobs.set(msg.key, { url, timer });
    return { ok: true, url };
  })()
    .then(reply)
    .catch((e) =>
      reply({
        ok: false,
        error: `Document generation failed: ${e.message || e}`,
      }),
    )
    .finally(() => {
      clearInterval(heartbeat);
      generating = false;
    });
  return true;
});
