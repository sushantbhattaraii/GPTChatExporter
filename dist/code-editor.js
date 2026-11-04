(() => {
  // src/modules/code-source.js
  var editorBody = ".cm-content,.CodeMirror-code,.monaco-editor .view-lines";
  var sourceRequest = "cge-read-code-document";
  var sourceReply = "cge-code-document";

  // src/code-editor.js
  var message = '[data-message-author-role="assistant"],[data-message-author-role="user"],[data-chatgpt-search-unit-key],[data-content-search-unit-key],[data-turn-key],[data-testid^="conversation-turn-"],[data-turn="assistant"],[data-turn="user"],[data-markdown-text-style],.markdown';
  document.addEventListener(
    sourceRequest,
    (event) => {
      const path = event.composedPath(), el = path[0];
      if (!(el instanceof HTMLElement) || !el.isConnected || !el.matches(editorBody))
        return;
      if (path.some(
        (n) => n.nodeType === 1 && n.matches("form,nav,aside,[data-cge]")
      ))
        return;
      if (!path.some((n) => n.nodeType === 1 && n.matches(message)) && !window.frameElement?.closest(message))
        return;
      let text, starts;
      try {
        if (el.matches(".cm-content")) {
          const view = window.EditorView?.findFromDOM?.(el) || el.cmTile?.root?.view || el.cmTile?.view || el.cmView?.rootView?.view || el.cmView?.view || el.cmView?.root?.view;
          if (view?.contentDOM !== el || !view.state?.doc) return;
          text = view.state.doc.toString();
          starts = [...el.querySelectorAll(":scope > .cm-line")].map((line) => {
            try {
              return view.posAtDOM(line, 0);
            } catch {
              return null;
            }
          });
        } else if (el.matches(".CodeMirror-code")) {
          const owner = el.closest(".CodeMirror"), cm = owner?.CodeMirror;
          if (cm?.getWrapperElement() !== owner) return;
          text = cm.getValue("\n");
        } else {
          const owner = el.closest(".monaco-editor");
          const editor = window.monaco?.editor?.getEditors?.().find((e) => {
            const dom = e.getDomNode();
            return dom && (dom === owner || dom.closest(".monaco-editor") === owner);
          });
          text = editor?.getValue();
        }
        if (typeof text === "string")
          el.dispatchEvent(
            new CustomEvent(sourceReply, {
              detail: JSON.stringify({ text, starts })
            })
          );
      } catch {
      }
    },
    true
  );
})();
