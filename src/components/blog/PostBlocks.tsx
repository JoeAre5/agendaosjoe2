/**
 * PostBlocks — native React renderer for Tiptap JSON documents authored
 * in the admin BlockComposer.
 *
 * Renders the same allow-list as `tiptapToHtml`, but with richer affordances
 * the HTML cache cannot express:
 *   - heading anchors (auto-id from text) for TOC deep-links
 *   - figures with captions (uses `alt` as caption when present)
 *   - safer link rel handling
 *   - code blocks with optional language label
 *
 * Pure render — no side effects, no Tiptap dependency at runtime.
 */
import { Fragment, type ReactNode } from "react";

export type TiptapMark = { type: string; attrs?: Record<string, unknown> };
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

interface PostBlocksProps {
  doc: TiptapNode | null | undefined;
  className?: string;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function nodeText(n: TiptapNode | undefined): string {
  if (!n) return "";
  if (n.type === "text") return n.text || "";
  return (n.content || []).map(nodeText).join("");
}

function renderText(node: TiptapNode, key: string): ReactNode {
  let el: ReactNode = node.text || "";
  const marks = node.marks || [];
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        el = <strong>{el}</strong>;
        break;
      case "italic":
        el = <em>{el}</em>;
        break;
      case "code":
        el = <code>{el}</code>;
        break;
      case "link": {
        const href = String(mark.attrs?.href || "#");
        const isExternal = /^https?:\/\//i.test(href);
        el = (
          <a
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
          >
            {el}
          </a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <Fragment key={key}>{el}</Fragment>;
}

function renderChildren(nodes: TiptapNode[] | undefined): ReactNode[] {
  if (!nodes) return [];
  return nodes.map((n, i) => renderNode(n, String(i)));
}

function renderNode(node: TiptapNode, key: string): ReactNode {
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{renderChildren(node.content)}</Fragment>;
    case "paragraph":
      return <p key={key}>{renderChildren(node.content)}</p>;
    case "heading": {
      const rawLevel = Number(node.attrs?.level) || 2;
      const level = Math.min(Math.max(rawLevel, 2), 3) as 2 | 3;
      const text = nodeText(node);
      const id = text ? slugifyHeading(text) : undefined;
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} id={id} className="blog-prose-heading">
          {renderChildren(node.content)}
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node.content)}</ul>;
    case "orderedList":
      return <ol key={key}>{renderChildren(node.content)}</ol>;
    case "listItem":
      return <li key={key}>{renderChildren(node.content)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node.content)}</blockquote>;
    case "codeBlock": {
      const language = (node.attrs?.language as string) || "";
      const text = (node.content || []).map((c) => c.text || "").join("");
      return (
        <pre key={key} data-language={language || undefined}>
          <code>{text}</code>
        </pre>
      );
    }
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = String(node.attrs?.src || "");
      const alt = String(node.attrs?.alt || "");
      const title = (node.attrs?.title as string) || "";
      if (!src) return null;
      const caption = title || alt;
      return (
        <figure key={key} className="blog-prose-figure">
          <img src={src} alt={alt} loading="lazy" />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    }
    case "hardBreak":
      return <br key={key} />;
    case "text":
      return renderText(node, key);
    default:
      return <Fragment key={key}>{renderChildren(node.content)}</Fragment>;
  }
}

export function PostBlocks({ doc, className }: PostBlocksProps) {
  if (!doc) return null;
  return (
    <div
      className={`blog-prose ${className || ""}`.trim()}
      style={{ color: "var(--text-primary)" }}
    >
      {renderNode(doc, "root")}
    </div>
  );
}
