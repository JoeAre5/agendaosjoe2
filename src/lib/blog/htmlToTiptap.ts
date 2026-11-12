/**
 * HTML → Tiptap JSON converter.
 *
 * Used in two places:
 *  - When loading a legacy post that only has plain `body` HTML (no `body_blocks_*`).
 *  - When the translate flow returns HTML for the other language: we need to
 *    re-hydrate it into Tiptap blocks so headings, blockquotes, bold/italic,
 *    bullet lists, links, etc. all survive the round-trip.
 *
 * Browser DOMParser is used when available (admin editor + reader run in the
 * browser). Falls back to a small markdown-ish parser otherwise (SSR / tests).
 */

type TiptapNode = { type: string; attrs?: any; content?: TiptapNode[]; text?: string; marks?: any[] };

const EMPTY_DOC: TiptapNode = { type: "doc", content: [{ type: "paragraph" }] };

// ---------- DOM-based parser (preserves inline marks + block types) ----------

type Mark = { type: string; attrs?: Record<string, any> };

function parseInlineDom(node: Node, marks: Mark[] = []): TiptapNode[] {
  const out: TiptapNode[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* text */) {
      const t = (child as Text).data;
      if (t) out.push({ type: "text", text: t, ...(marks.length ? { marks: [...marks] } : {}) });
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    let nextMarks = marks;
    if (tag === "strong" || tag === "b") nextMarks = [...marks, { type: "bold" }];
    else if (tag === "em" || tag === "i") nextMarks = [...marks, { type: "italic" }];
    else if (tag === "code") nextMarks = [...marks, { type: "code" }];
    else if (tag === "a") {
      const href = el.getAttribute("href") || "#";
      nextMarks = [...marks, { type: "link", attrs: { href } }];
    } else if (tag === "br") {
      out.push({ type: "hardBreak" });
      return;
    }
    out.push(...parseInlineDom(el, nextMarks));
  });
  return out;
}

function blockFromEl(el: HTMLElement): TiptapNode | TiptapNode[] | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Math.min(Math.max(Number(tag[1]), 2), 3);
      return { type: "heading", attrs: { level }, content: parseInlineDom(el) };
    }
    case "p":
      return { type: "paragraph", content: parseInlineDom(el) };
    case "blockquote": {
      // Recurse into children; if no block children, wrap text as paragraph.
      const inner = parseBlocksDom(el);
      return { type: "blockquote", content: inner.length ? inner : [{ type: "paragraph", content: parseInlineDom(el) }] };
    }
    case "ul":
    case "ol": {
      const items: TiptapNode[] = [];
      el.querySelectorAll(":scope > li").forEach((li) => {
        items.push({ type: "listItem", content: [{ type: "paragraph", content: parseInlineDom(li as HTMLElement) }] });
      });
      return { type: tag === "ol" ? "orderedList" : "bulletList", content: items };
    }
    case "hr":
      return { type: "horizontalRule" };
    case "pre": {
      const text = el.textContent || "";
      return { type: "codeBlock", content: text ? [{ type: "text", text }] : [] };
    }
    case "img": {
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";
      if (!src) return null;
      return { type: "image", attrs: { src, alt } };
    }
    case "div":
    case "section":
    case "article":
      return parseBlocksDom(el);
    default:
      // Unknown tag with text — wrap as paragraph
      if ((el.textContent || "").trim()) {
        return { type: "paragraph", content: parseInlineDom(el) };
      }
      return null;
  }
}

function parseBlocksDom(root: HTMLElement): TiptapNode[] {
  const out: TiptapNode[] = [];
  root.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const t = ((child as Text).data || "").trim();
      if (t) out.push({ type: "paragraph", content: [{ type: "text", text: t }] });
      return;
    }
    if (child.nodeType !== 1) return;
    const block = blockFromEl(child as HTMLElement);
    if (!block) return;
    if (Array.isArray(block)) out.push(...block);
    else out.push(block);
  });
  return out;
}

function tryDomParse(input: string): TiptapNode | null {
  if (typeof DOMParser === "undefined") return null;
  // Quick check: does this look like HTML (has any tag)?
  if (!/<[a-z][\s\S]*>/i.test(input)) return null;
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${input}</div>`, "text/html");
    const root = doc.getElementById("r");
    if (!root) return null;
    const content = parseBlocksDom(root);
    return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
  } catch {
    return null;
  }
}

// ---------- Markdown-ish fallback (kept for SSR / tests / plain text) ----------

function parseInlineMd(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1]) nodes.push({ type: "text", text: m[2], marks: [{ type: "bold" }] });
    else if (m[3]) nodes.push({ type: "text", text: m[4], marks: [{ type: "italic" }] });
    else if (m[5]) nodes.push({ type: "text", text: m[6], marks: [{ type: "code" }] });
    else if (m[7]) nodes.push({ type: "text", text: m[8], marks: [{ type: "link", attrs: { href: m[9] } }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.length > 0 ? nodes : [{ type: "text", text }];
}

function fallbackParse(input: string): TiptapNode {
  const normalized = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/```+[a-zA-Z]*\n?/g, "")
    .replace(/'''+[a-zA-Z]*\n?/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n/g, "\n")
    .trim();

  const blocks = normalized.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const content: TiptapNode[] = [];
  for (const block of blocks) {
    const h = /^(#{1,3})\s+(.+)$/.exec(block);
    if (h) {
      content.push({ type: "heading", attrs: { level: Math.min(h[1].length, 3) }, content: parseInlineMd(h[2]) });
      continue;
    }
    if (/^>\s+/.test(block)) {
      const text = block.replace(/^>\s+/gm, "").trim();
      content.push({ type: "blockquote", content: [{ type: "paragraph", content: parseInlineMd(text) }] });
      continue;
    }
    if (/^[-*]\s+/.test(block) && !/^\*\*/.test(block)) {
      const items = block.split(/\n/).map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
      content.push({
        type: "bulletList",
        content: items.map((t) => ({ type: "listItem", content: [{ type: "paragraph", content: parseInlineMd(t) }] })),
      });
      continue;
    }
    const lines = block.split(/\n/);
    const paraContent: TiptapNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) paraContent.push({ type: "hardBreak" });
      paraContent.push(...parseInlineMd(line));
    });
    content.push({ type: "paragraph", content: paraContent });
  }
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

export function htmlToTiptap(input: string | null | undefined): TiptapNode {
  if (!input || !input.trim()) return EMPTY_DOC;
  const dom = tryDomParse(input);
  if (dom && (dom.content?.length ?? 0) > 0) return dom;
  return fallbackParse(input);
}

export function emptyTiptapDoc(): TiptapNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
