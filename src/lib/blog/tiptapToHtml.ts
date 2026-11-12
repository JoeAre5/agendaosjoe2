/**
 * Serialize a Tiptap JSON document to a sanitized HTML string for the public reader.
 *
 * We only emit a small allow-list of node/mark types — everything the BlockComposer
 * can produce. Unknown nodes degrade to their text content; unknown marks are stripped.
 *
 * Kept pure (no DOM / no Tiptap import) so it can be reused server-side later.
 */

type TiptapNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  text?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function renderMarks(text: string, marks?: TiptapNode["marks"]): string {
  let out = escapeHtml(text);
  if (!marks || marks.length === 0) return out;
  // Apply marks in reverse so the innermost wraps the text first.
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = mark.attrs?.href ? escapeAttr(String(mark.attrs.href)) : "#";
        out = `<a href="${href}" target="_blank" rel="noopener noreferrer">${out}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function renderChildren(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  return nodes.map(renderNode).join("");
}

function renderNode(node: TiptapNode): string {
  switch (node.type) {
    case "doc":
      return renderChildren(node.content);
    case "paragraph":
      return `<p>${renderChildren(node.content)}</p>`;
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 3);
      return `<h${level}>${renderChildren(node.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node.content)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node.content)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node.content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node.content)}</blockquote>`;
    case "codeBlock":
      // Only text children inside code blocks
      return `<pre><code>${escapeHtml(
        (node.content || []).map((c) => c.text || "").join(""),
      )}</code></pre>`;
    case "horizontalRule":
      return `<hr />`;
    case "image": {
      const src = node.attrs?.src ? escapeAttr(String(node.attrs.src)) : "";
      const alt = node.attrs?.alt ? escapeAttr(String(node.attrs.alt)) : "";
      if (!src) return "";
      return `<img src="${src}" alt="${alt}" loading="lazy" />`;
    }
    case "hardBreak":
      return `<br />`;
    case "text":
      return renderMarks(node.text || "", node.marks);
    default:
      // Unknown node — recurse children if any, otherwise drop
      return renderChildren(node.content);
  }
}

export function tiptapToHtml(doc: TiptapNode | null | undefined): string {
  if (!doc) return "";
  return renderNode(doc);
}

/** Word count over a Tiptap doc (text nodes only). */
export function tiptapWordCount(doc: TiptapNode | null | undefined): number {
  if (!doc) return 0;
  let text = "";
  const walk = (n: TiptapNode) => {
    if (n.type === "text" && n.text) text += " " + n.text;
    if (n.content) n.content.forEach(walk);
  };
  walk(doc);
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
