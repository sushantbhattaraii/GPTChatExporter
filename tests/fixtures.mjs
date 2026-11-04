export const rich = `<h2>Technical answer</h2><p>A <strong>bold</strong> and <em>italic</em> explanation with <a href="https://example.com/paper">paper link</a>. Café, Ελληνικά, Кириллица, ∑, ≤.</p><p>Inline <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2 + y^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">duplicate formula</span></span>.</p><div class="katex-display"><span class="katex"><math><annotation encoding="application/x-tex">\\frac{a}{b} \\leq 1</annotation></math></span></div><pre><button>Copy code</button><code class="language-python">def greet(name):\n    return f"Hello, {name}"\n\nprint(greet("world"))</code></pre><ol start="3"><li>First item<ul><li>Nested bullet</li></ul></li><li>Second item</li></ol><table><thead><tr><th>Algorithm</th><th>Time</th></tr></thead><tbody><tr><td>Arrow</td><td>O(n)</td></tr><tr><td>OPArrow</td><td>O(n log n)</td></tr></tbody></table><blockquote><p>A useful observation.</p></blockquote><p><img alt="A labeled graph" src="data:image/png;base64,iVBORw0KGgo="></p>`;
export function turn(
  index,
  role,
  html,
  { id = `${role}-${index}`, done = true, hidden = false } = {},
) {
  return `<article data-testid="conversation-turn-${index}"${hidden ? " hidden" : ""}><div data-message-author-role="${role}" data-message-id="${id}">${role === "assistant" ? `<div class="markdown">${html}</div>` : html}</div>${role === "assistant" && done ? '<button data-testid="copy-turn-action-button">Copy</button>' : ""}</article>`;
}
export function fixture(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Research Chat - ChatGPT</title><style>body{font:16px Arial;margin:0}main{max-width:780px;margin:auto;padding:20px}article{padding:20px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}[hidden]{display:none!important}</style></head><body><nav>Unrelated sidebar</nav><main>${content}</main></body></html>`;
}
export const standard = fixture(
  turn(0, "user", "Question ONE") +
    turn(1, "assistant", "<p>Answer ONE</p>") +
    turn(2, "user", "Question TWO") +
    turn(3, "assistant", rich) +
    turn(4, "user", "Question THREE") +
    turn(5, "assistant", "<p>Answer THREE</p>"),
);
