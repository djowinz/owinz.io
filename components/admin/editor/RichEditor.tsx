"use client";

import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import { NodeSelection, type Selection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { chartNode, editorExtensions } from "@/lib/cms/editor-schema";
import { cn } from "@/lib/utils";
import { input as inputClass, label } from "../ui";
import { chartNodeView } from "./chart-node-view";
import { photoSrc, type EditorPhoto } from "./upload";

export type Placement = "" | "left" | "right";

export interface BodyEditorHandle {
  insertImage(name: string, placement: Placement): void;
  /** Inserts a ```chart block with this source at the selection and selects it. */
  insertChart(source: string): void;
  /** Replaces the chart block at `pos` (from onEditChart) with this source. */
  replaceChart(pos: number, source: string): void;
  focus(): void;
}

interface Props {
  value: string;
  onChange(markdown: string): void;
  disabled?: boolean;
  photos: EditorPhoto[];
  onFiles?(files: File[]): Promise<void>;
  /** A chart block's Edit button: its document position and current source. */
  onEditChart?(pos: number, source: string): void;
  /** The toolbar's Chart button. */
  onAddChart?(): void;
}

const placementOf = (src: string): Placement => (src.match(/#(left|right)$/)?.[1] as Placement) ?? "";
const withPlacement = (src: string, placement: Placement) =>
  src.replace(/#(left|right)$/, "") + (placement ? `#${placement}` : "");

/**
 * Where a new chart block goes: after a selected node (not over it), in place
 * of an empty paragraph, or after the block holding the caret.
 */
function chartSlot(selection: Selection): [number, number] {
  if (selection instanceof NodeSelection) return [selection.to, selection.to];
  const { $from } = selection;
  if ($from.depth === 0) return [$from.pos, $from.pos];
  // A cell selection or the like: after the whole top-level block.
  if (!$from.parent.isTextblock) return [$from.after(1), $from.after(1)];
  if ($from.parent.content.size === 0) return [$from.before(), $from.after()];
  return [$from.after(), $from.after()];
}

/** WYSIWYG editing that reads and writes Markdown (lib/cms/editor-schema.ts). */
export const RichEditor = forwardRef<BodyEditorHandle, Props>(function RichEditor(
  { value, onChange, disabled, photos, onFiles, onEditChart, onAddChart },
  ref,
) {
  const photosRef = useRef(photos);
  const onFilesRef = useRef(onFiles);
  const onEditChartRef = useRef(onEditChart);
  useEffect(() => {
    photosRef.current = photos;
    onFilesRef.current = onFiles;
    onEditChartRef.current = onEditChart;
  }, [photos, onFiles, onEditChart]);
  // The Markdown this editor last produced, to tell our own updates from outside ones (a restore).
  const emitted = useRef(value);

  // Built once. displaySrc and the chart Edit button read the latest props
  // through refs when TipTap draws or clicks a node — later, not during React's render.
  // eslint-disable-next-line react-hooks/refs
  const [extensions] = useState(() => [
    ...editorExtensions({
      displaySrc: (src) => {
        const name = src.replace(/#(left|right)$/, "").replace(/^\.\//, "");
        const photo = photosRef.current.find((p) => p.name === name);
        return photo ? photoSrc(photo) : src;
      },
      chartView: chartNodeView((pos, source) => onEditChartRef.current?.(pos, source)),
    }),
    Markdown,
    Placeholder.configure({ placeholder: "Start writing… drop photos anywhere." }),
  ]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: value,
    contentType: "markdown",
    extensions,
    editorProps: {
      attributes: { class: "prose min-h-[60vh] px-1 py-2 outline-none", "aria-label": "Post body" },
      handleDrop: (_view, event) => takeImages(event.dataTransfer?.files, event),
      handlePaste: (_view, event) => takeImages(event.clipboardData?.files, event),
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      emitted.current = markdown;
      onChange(markdown);
    },
  });

  function takeImages(list: FileList | undefined, event: Event): boolean {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length || !onFilesRef.current) return false;
    event.preventDefault();
    void onFilesRef.current(files);
    return true;
  }

  // Outside changes (restoring a version) replace the document.
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useImperativeHandle(ref, () => ({
    insertImage(name, placement) {
      editor
        ?.chain()
        .focus()
        .setImage({ src: withPlacement(name, placement), alt: "" })
        .run();
    },
    insertChart(source) {
      if (!editor) return;
      const chart = editor.schema.nodeFromJSON(chartNode(source));
      const [from, to] = chartSlot(editor.state.selection);
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.replaceWith(from, to, chart);
          // Select the new chart, so the caret never lands somewhere hidden.
          const start = tr.mapping.map(from, -1);
          let at = -1;
          tr.doc.nodesBetween(start, tr.mapping.map(to, 1), (node, pos) => {
            if (at === -1 && node.type.name === "chart") at = pos;
            return at === -1;
          });
          if (at !== -1) tr.setSelection(NodeSelection.create(tr.doc, at));
          return true;
        })
        .run();
    },
    replaceChart(pos, source) {
      if (!editor || pos < 0 || pos > editor.state.doc.content.size) return;
      // The document may have moved on (a restore); only ever replace a chart.
      if (editor.state.doc.nodeAt(pos)?.type.name !== "chart") return;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { source });
          tr.setSelection(NodeSelection.create(tr.doc, pos));
          return true;
        })
        .run();
    },
    focus: () => editor?.commands.focus(),
  }));

  return (
    <div className="border border-edge">
      {editor && <Toolbar editor={editor} disabled={disabled} onAddChart={onAddChart} />}
      {editor && <ImagePanel editor={editor} />}
      <div className="px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

function Toolbar({ editor, disabled, onAddChart }: { editor: Editor; disabled?: boolean; onAddChart?(): void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      quote: e.isActive("blockquote"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      codeBlock: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  function link() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link to", previous ?? "https://");
    if (href === null) return;
    if (href.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  const tools: { label: string; title: string; active?: boolean; run(): void; enabled?: boolean; className?: string }[] = [
    { label: "B", title: "Bold (⌘B)", active: state.bold, run: () => editor.chain().focus().toggleBold().run(), className: "font-bold" },
    { label: "I", title: "Italic (⌘I)", active: state.italic, run: () => editor.chain().focus().toggleItalic().run(), className: "italic" },
    { label: "S", title: "Strikethrough", active: state.strike, run: () => editor.chain().focus().toggleStrike().run(), className: "line-through" },
    { label: "Link", title: "Link", active: state.link, run: link },
    { label: "H2", title: "Section heading", active: state.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "H3", title: "Subheading", active: state.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Quote", title: "Quote", active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "• List", title: "Bulleted list", active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "1. List", title: "Numbered list", active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Code", title: "Inline code", active: state.code, run: () => editor.chain().focus().toggleCode().run() },
    { label: "{ }", title: "Code block", active: state.codeBlock, run: () => editor.chain().focus().toggleCodeBlock().run() },
    { label: "Chart", title: "Insert chart", run: () => onAddChart?.(), enabled: Boolean(onAddChart) },
    { label: "—", title: "Divider", run: () => editor.chain().focus().setHorizontalRule().run() },
    { label: "↶", title: "Undo (⌘Z)", run: () => editor.chain().focus().undo().run(), enabled: state.canUndo },
    { label: "↷", title: "Redo (⇧⌘Z)", run: () => editor.chain().focus().redo().run(), enabled: state.canRedo },
  ];

  return (
    <div className="sticky top-[57px] z-[5] flex flex-wrap items-center gap-0.5 border-b border-edge bg-background px-2 py-1.5">
      {tools.map((tool) => (
        <button
          key={tool.label}
          type="button"
          title={tool.title}
          aria-pressed={tool.active}
          disabled={disabled || tool.enabled === false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={tool.run}
          className={cn(
            "px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-30",
            tool.active && "bg-accent/10 text-accent",
            tool.className,
          )}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}

/** Alt text, caption, and placement for the selected photo. */
function ImagePanel({ editor }: { editor: Editor }) {
  const image = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e.isActive("image") ? (e.getAttributes("image") as { src: string; alt?: string; title?: string }) : null,
  });
  if (!image || !editor.isEditable) return null;
  const placement = placementOf(image.src);
  const set = (attrs: Record<string, string | null>) => editor.chain().updateAttributes("image", attrs).run();

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-edge bg-(--sidebar) px-3 py-3">
      <label className="min-w-[200px] flex-1">
        <span className={`${label} mb-1 block`}>Alt text {image.alt ? "" : "· needed"}</span>
        <input
          className={cn(inputClass, !image.alt && "border-accent")}
          value={image.alt ?? ""}
          placeholder="What the photo shows, for screen readers and search"
          onChange={(e) => set({ alt: e.target.value })}
        />
      </label>
      <label className="min-w-[200px] flex-1">
        <span className={`${label} mb-1 block`}>Caption</span>
        <input
          className={inputClass}
          value={image.title ?? ""}
          placeholder="Optional, shown under the photo"
          onChange={(e) => set({ title: e.target.value || null })}
        />
      </label>
      <div>
        <span className={`${label} mb-1 block`}>Placement</span>
        <div className="flex border border-edge">
          {(
            [
              ["left", "◧ Left"],
              ["", "Center"],
              ["right", "Right ◨"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={placement === value}
              onClick={() => set({ src: withPlacement(image.src, value) })}
              className={cn("px-3 py-2 text-xs transition-colors", placement === value ? "bg-foreground text-background" : "hover:text-accent")}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
