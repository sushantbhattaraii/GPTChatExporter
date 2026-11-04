export function documentWarnings(doc) {
  const warnings = [];
  if (doc.scope === "conversation")
    warnings.push(
      "Exported from the active branch rendered by ChatGPT. Older content unavailable to the page cannot be verified.",
    );
  let unreadable = false;
  function walk(bs) {
    for (const b of bs) {
      if (
        (b.type === "image" && !b.image?.display?.hidden && !b.image?.data) ||
        b.assets?.some((a) => !a.data)
      )
        unreadable = true;
      if (
        b.type === "table" &&
        b.rows.some((r) => r.some((c) => c.colSpan > 1 || c.rowSpan > 1))
      )
        spans = true;
      if (b.blocks) walk(b.blocks);
      if (b.items) b.items.forEach(walk);
      if (b.rows) b.rows.forEach((r) => r.forEach((c) => walk(c.blocks)));
    }
  }
  let spans = false;
  doc.messages.forEach((m) => walk(m.blocks));
  if (unreadable || doc.messages.some((m) => m.hasInteractive))
    warnings.push("Some images or interactive content could not be embedded.");
  if (spans)
    warnings.push("Merged table cells are flattened to a regular grid.");
  return warnings;
}
export function prepareDocument(doc, s) {
  if (
    !doc ||
    !Array.isArray(doc.messages) ||
    !["pair", "conversation"].includes(doc.scope)
  )
    throw new Error("Invalid export request.");
  const filter = (bs) =>
    bs
      .filter((b) => s.includeCode || (b.type !== "code" && !b.fromCode))
      .map((b) => ({
        ...b,
        ...(b.blocks ? { blocks: filter(b.blocks) } : {}),
        ...(b.items ? { items: b.items.map(filter) } : {}),
        ...(b.rows
          ? {
              rows: b.rows.map((row) =>
                row.map((c) => ({ ...c, blocks: filter(c.blocks) })),
              ),
            }
          : {}),
      }));
  const messages = doc.messages
    .filter((m) => s.includeUsers || m.role !== "user")
    .map((m) => ({ ...m, blocks: filter(m.blocks) }));
  if (!messages.length)
    throw new Error("No messages remain with these settings.");
  return { ...doc, messages, warnings: documentWarnings(doc) };
}
// Flatten merged cells while retaining their text and logical column position.
export function tableGrid(rows) {
  const grid = [];
  let max = 0;
  rows.forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of row) {
      while (grid[r][c]) c++;
      grid[r][c] = cell;
      for (let dr = 0; dr < Math.min(cell.rowSpan || 1, 100); dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < Math.min(cell.colSpan || 1, 100); dc++)
          if (dr || dc)
            grid[r + dr][c + dc] = { blocks: [], header: cell.header };
      }
      c += Math.min(cell.colSpan || 1, 100);
    }
    max = Math.max(max, grid[r].length);
  });
  return grid.map((row) =>
    Array.from(
      { length: max },
      (_, i) => row[i] || { blocks: [], header: false },
    ),
  );
}
