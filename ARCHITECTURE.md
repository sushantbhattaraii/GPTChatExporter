# Design and trust boundaries

## Requirements decisions

The highest-priority invariant is: clicking under response A2 must never export another prompt. The DOM adapter discovers visible user/assistant role roots in `main`, associates an assistant with the preceding visible user, and checks consecutive available turn indexes. It refuses absent parents and indexed gaps. Alternative branches hidden with HTML/ARIA/computed visibility are excluded. Regeneration uses current DOM content at export time. Multiple consecutive assistant messages can share the same preceding user; a pair includes only the clicked assistant message.

This is a visible-DOM protocol, not an account-history API client. It cannot establish hidden server ancestry or prove that unseen content exists. Without ordered indexes, local pairing uses the displayed order; unorderable virtualization is refused for full export. A frontend that silently exposes nonconsecutive messages without identifiers remains an inherent limitation of DOM-only extraction, not a solvable server-side guarantee.

## Components

| Component | Responsibilities | Boundaries |
|---|---|---|
| Content script | Locate completed messages; isolated controls; normalize the selected range; scan/review history | No credentials, private endpoints, or application-state introspection |
| Normalized model | Role, id, turn index, order, parent id, blocks, optional timestamp/media flag | Plain structured data; no page HTML execution |
| Worker | Validate origin/format and payload size; load settings; coordinate generation/download status | Does not retain message content in storage |
| Offscreen page | Generate files, hold and revoke Blob URLs | Bundled code and fonts, local rendering, one generator at a time |
| Popup/options | Active-tab entry point and device-local formatting settings | No unrelated-tab content access |

Message blocks are paragraph, heading, code, math, list, table, quote or rule. Inline runs carry text and basic emphasis, link, sub/superscript or code/math hints. Renderer-specific features degrade deliberately (PDF sub/superscript retains text without exact positioning). Unsafe link protocols are discarded. Image blocks carry raster data or explicit fallback labels; approved image URLs already referenced by the selected message can be fetched locally.

## Streaming and observers

A global visible stop control or explicit streaming/busy state prevents exporting the last response. Recognized completion action controls, `data-is-streaming=false`, or a subsequent user turn provide positive completion evidence. Unknown final responses receive no button. Roles and test identifiers are preferred over layout position or styling classes. The root observer watches child insertion and a small attribute list and debounces scans. It ignores its own UI nodes; each completed node has one registered control.

## Full-history algorithm

1. Refuse streaming/unknown completion; record current URL and scroll offset.
2. Find the message scroll container and repeatedly visit its top until three stable observations.
3. Traverse downward in overlapping viewport steps, merging by role-qualified search-unit key or message ID. Turn and unit indexes establish chronological order. A changing snapshot is discarded and retried once.
4. Refuse changed IDs/text at an existing position, missing indexes, or unindexed virtualization.
5. Reorder indexed turns, deduplicate stable IDs, associate each assistant with its nearest preceding user, and restore scroll offset.
6. Present count and start/end previews. Require range confirmation, including a completeness disclosure.
7. Recheck currently mounted content and URL after review, before submitting the snapshot.

A progress watchdog tracks newly collected messages, scroll advances and increases in scroll height. It stops a stalled scan after 90 seconds. Escape cancels. Updated and visible turns are reread; unchanged offscreen turns can reuse their model. Mutation during review invalidates the export. The collector never treats arbitrary scroll stability as proof of complete backend history. Partial content is not silently called a verified complete conversation.

## Documents

PDF uses the pinned pdfmake public synchronous `getStream` interface. This lets font/layout errors reject the generation request rather than escaping an asynchronous callback. All font bytes are bundled. Code can wrap and span pages. Standard tables repeat header rows; very wide tables flatten. Word uses `docx` for an OOXML ZIP with native paragraphs, heading styles, numbering, tables, hyperlinks and page fields.

MathJax compiles recognized equations locally. PDF uses vector formula graphics and short inline expressions. Word imports Office Math XML generated from MathML. Unsupported expressions receive a labelled source fallback. Unicode text is retained in Word; PDF glyph coverage is limited by the bundled fonts and disclosed in warnings.

## Download lifecycle

1. Generate a Blob in the offscreen document.
2. Worker calls Chrome Downloads API and stores only download ID, filename, tab ID and Blob key in `storage.session`.
3. Report “started”; wait for `downloads.onChanged` to say complete or interrupted.
4. Query download state immediately after storing the record to reconcile fast-completion races.
5. Revoke the Blob and remove the session record. A 30-minute expiry releases abandoned URLs.

Worker restart is tolerated for downloads whose session record exists; no success is inferred from document creation. Extension/browser shutdown can interrupt an in-flight job; it is not automatically replayed. The last status remains session-scoped until browser shutdown and is shown in the popup for two minutes.

## PDF styling

The content script serializes computed paragraph alignments and styled text runs for code. The PDF generator embeds those runs as text and paginates each message in a continuous transcript. Prompts use a narrower right-aligned measure. Replies use the full text width. Both scopes call the same PDF layout code. Figure rows carry their items and column count; tables can carry measured column proportions. Document warnings are kept in the PDF Subject field. Each image occurrence carries its measured CSS box and crop independently of the cached source pixels. Search-result cards use the painted text ranges and the actual link hit boxes in separate PDF objects.

The selected image's DOM source, responsive alternatives and loaded pixels are kept for the duration of the export. Approved ChatGPT endpoints and anonymous HTTPS image reads use the worker. A blocked external image can require an origin-specific optional grant, initiated by a popup click. The same export retries blocked assets after the grant.

The content script records bounded HTML components from browser layout rectangles, text ranges, computed paint and local SVG paths. It includes safe hyperlink destinations and places resolved images in the vector drawing. The document engine keeps these components together as space permits. Word uses their semantic content.

Large documents transfer through the service worker in sequenced chunks. The offscreen document checks the tab/document identity, offsets and UTF-8 length before parsing. Abandoned partial transfers expire. The extension never stores chat content in Chrome storage.
