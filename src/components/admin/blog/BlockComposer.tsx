/**
 * BlockComposer — Beehiiv-inspired block editor for Titulares (newsletter posts).
 *
 * Built on Tiptap. Supports: paragraph, H2, H3, bullet/numbered lists,
 * blockquote, code block, divider, image (URL), inline links, bold/italic/code.
 *
 * Mobile-first 430px, dark-mode native, only existing design tokens.
 *
 * Persists Tiptap JSON to the parent (via `value` / `onChange`). The parent
 * is responsible for serializing to HTML on save (see `tiptapToHtml`).
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Link as LinkIcon, Code, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, Image as ImageIcon, Type, Plus, Code2,
} from "lucide-react";

interface BlockComposerProps {
  value: any | null; // Tiptap JSON doc
  onChange: (doc: any, html: string, wordCount: number) => void;
  placeholder?: string;
  language?: "es" | "en";
}

interface BlockOption {
  id: string;
  labelEs: string;
  labelEn: string;
  Icon: typeof Heading2;
  run: (editor: Editor) => void;
}

const BLOCK_OPTIONS: BlockOption[] = [
  { id: "p", labelEs: "Párrafo", labelEn: "Paragraph", Icon: Type,
    run: (e) => e.chain().focus().setParagraph().run() },
  { id: "h2", labelEs: "Encabezado", labelEn: "Heading", Icon: Heading2,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", labelEs: "Subencabezado", labelEn: "Subheading", Icon: Heading3,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "bul", labelEs: "Lista", labelEn: "Bullet list", Icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ord", labelEs: "Lista numerada", labelEn: "Numbered list", Icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "quote", labelEs: "Cita", labelEn: "Quote", Icon: Quote,
    run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "code", labelEs: "Código", labelEn: "Code block", Icon: Code2,
    run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "hr", labelEs: "Divisor", labelEn: "Divider", Icon: Minus,
    run: (e) => e.chain().focus().setHorizontalRule().run() },
];

export function BlockComposer({ value, onChange, placeholder, language = "es" }: BlockComposerProps) {
  const es = language === "es";
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastJsonRef = useRef<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: placeholder || (es ? "Escribe o presiona '/' para añadir bloques..." : "Write or press '/' to add blocks..."),
      }),
    ],
    content: value || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class: "tiptap-composer prose-tiptap focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const serialized = JSON.stringify(json);
      if (serialized === lastJsonRef.current) return;
      lastJsonRef.current = serialized;
      const html = editor.getHTML();
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      onChange(json, html, words);
    },
  });

  // Sync external value changes (e.g. when language toggle switches docs)
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(value || { type: "doc", content: [{ type: "paragraph" }] });
    if (incoming !== lastJsonRef.current) {
      lastJsonRef.current = incoming;
      editor.commands.setContent(value || { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)", minHeight: 280 }}>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Loading editor…</p>
      </div>
    );
  }

  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(es ? "URL del enlace" : "Link URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const promptImage = () => {
    const url = window.prompt(es ? "URL de la imagen" : "Image URL", "https://");
    if (!url) return;
    editor.chain().focus().setImage({ src: url, alt: "" }).run();
  };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}>
      {/* Static toolbar (mobile-friendly, always visible) */}
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--divider)", background: "var(--bg-base)" }}
      >
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="H2"
        >
          <Heading2 size={15} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="H3"
        >
          <Heading3 size={15} className="icon-bold" />
        </ToolbarButton>
        <Sep />
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("link")} onClick={promptLink} title="Link">
          <LinkIcon size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
          <Code size={14} className="icon-bold" />
        </ToolbarButton>
        <Sep />
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          <Quote size={14} className="icon-bold" />
        </ToolbarButton>
        <Sep />
        <ToolbarButton onClick={promptImage} title="Image">
          <ImageIcon size={14} className="icon-bold" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus size={14} className="icon-bold" />
        </ToolbarButton>

        <div className="ml-auto">
          <button
            onClick={() => setPickerOpen((s) => !s)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
            style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
          >
            <Plus size={12} className="icon-extrabold" />
            {es ? "Bloque" : "Block"}
          </button>
        </div>
      </div>

      {/* Block picker drawer */}
      {pickerOpen && (
        <div className="px-2 py-2 grid grid-cols-2 gap-1.5"
          style={{ borderBottom: "1px solid var(--divider)", background: "var(--bg-base)" }}>
          {BLOCK_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { opt.run(editor); setPickerOpen(false); }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left active:opacity-70"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
            >
              <opt.Icon size={14} className="icon-bold" style={{ color: "var(--text-secondary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {es ? opt.labelEs : opt.labelEn}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Bubble menu (text selection) */}
      <BubbleMenu editor={editor} className="flex items-center gap-0.5 rounded-lg p-1 shadow-lg"
        options={{ placement: "top" }}>
        <div className="flex items-center gap-0.5 rounded-lg p-1"
          style={{ background: "var(--bg-base)", border: "1px solid var(--divider)" }}>
          <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={13} className="icon-bold" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={13} className="icon-bold" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("link")} onClick={promptLink}>
            <LinkIcon size={13} className="icon-bold" />
          </ToolbarButton>
        </div>
      </BubbleMenu>

      {/* Editor surface */}
      <div className="px-3.5 py-3 min-h-[280px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* ───── Internal bits ───── */

function ToolbarButton({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
      style={{
        background: active ? "var(--accent-color)" : "transparent",
        color: active ? "var(--cta-fg)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 mx-0.5" style={{ background: "var(--divider)" }} />;
}
