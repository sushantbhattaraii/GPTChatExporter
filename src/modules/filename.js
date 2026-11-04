const pad = (n) => String(n).padStart(2, "0");
export function filename(doc, format, date = new Date()) {
  if (!["pdf", "docx"].includes(format))
    throw new Error("Unsupported document format.");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (doc.scope === "pair")
    return `ChatGPT_QA_${day}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.${format}`;
  const title =
    (doc.title || "Conversation")
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "")
      .slice(0, 90)
      .trim() || "Conversation";
  return `ChatGPT_${title}_${day}.${format}`;
}
