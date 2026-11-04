// Chrome messages have a per-message size limit. Transfer large models in
// acknowledged chunks, keeping all content in extension memory.
export const CHUNK = 512 * 1024;
export const BUDGET = 96 * 1024 * 1024;
export async function sendExport(document, format, signal, progress) {
  const json = JSON.stringify(document);
  if (json.length < 2 * CHUNK)
    return chrome.runtime.sendMessage({ type: "CGE_EXPORT", format, document });
  const bytes = new Blob([json]).size;
  if (bytes > BUDGET)
    throw new Error("This document exceeds the 96 MiB in-memory export limit.");
  const key = crypto.randomUUID();
  try {
    for (let offset = 0; offset < json.length; ) {
      signal.throwIfAborted();
      let end = Math.min(json.length, offset + CHUNK);
      if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
      const result = await chrome.runtime.sendMessage({
        type: "CGE_STAGE",
        key,
        offset,
        bytes,
        chunk: json.slice(offset, end),
      });
      if (!result?.ok)
        throw new Error(result?.error || "Document transfer interrupted.");
      offset = end;
      progress(
        `Preparing document… ${Math.round((100 * offset) / json.length)}%`,
      );
    }
    signal.throwIfAborted();
    return await chrome.runtime.sendMessage({
      type: "CGE_EXPORT",
      key,
      format,
      meta: { title: document.title, scope: document.scope },
    });
  } finally {
    await chrome.runtime
      .sendMessage({ type: "CGE_DISCARD", key })
      .catch(() => {});
  }
}
export function stagedDocuments() {
  const jobs = new Map();
  function release(key) {
    clearTimeout(jobs.get(key)?.timer);
    jobs.delete(key);
  }
  function append({ key, owner, offset, bytes, chunk }) {
    if (
      typeof key !== "string" ||
      key.length > 64 ||
      typeof owner !== "string" ||
      typeof chunk !== "string" ||
      !chunk.length ||
      chunk.length > CHUNK ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > BUDGET
    )
      throw new Error("Invalid document chunk.");
    let job = jobs.get(key);
    if (!job) {
      const reserved = [...jobs.values()].reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      if (offset !== 0 || reserved + bytes > BUDGET)
        throw new Error(
          "Document transfer is out of order or memory is in use.",
        );
      job = { owner, bytes, received: 0, offset: 0, parts: [] };
    }
    if (owner !== job.owner || offset !== job.offset || bytes !== job.bytes)
      throw new Error("Unexpected document chunk.");
    const size = new TextEncoder().encode(chunk).length;
    if (job.received + size > bytes)
      throw new Error("Document chunk exceeds the declared size.");
    jobs.set(key, job);
    job.parts.push(chunk);
    job.offset += chunk.length;
    job.received += size;
    clearTimeout(job.timer);
    job.timer = setTimeout(() => release(key), 120000);
  }
  function take(key, owner) {
    const job = jobs.get(key);
    if (!job || job.owner !== owner || job.received !== job.bytes)
      throw new Error("Document transfer is incomplete. Please retry.");
    release(key);
    return JSON.parse(job.parts.join(""));
  }
  return {
    append,
    take,
    discard(key, owner) {
      if (jobs.get(key)?.owner === owner) release(key);
    },
  };
}
