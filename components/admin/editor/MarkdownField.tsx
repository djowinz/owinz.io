"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { label } from "../ui";
import type { BodyEditorHandle } from "./RichEditor";


interface Props {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  /** Uploads dropped or pasted images; resolves to the inserted file names. */
  onFiles?(files: File[]): Promise<void>;
}

const TOOLS: { label: string; title: string; key?: string; wrap?: [string, string]; line?: string }[] = [
  { label: "B", title: "Bold (⌘B)", key: "b", wrap: ["**", "**"] },
  { label: "I", title: "Italic (⌘I)", key: "i", wrap: ["*", "*"] },
  { label: "Link", title: "Link (⌘K)", key: "k", wrap: ["[", "](https://)"] },
  { label: "H2", title: "Section heading", line: "## " },
  { label: "H3", title: "Subheading", line: "### " },
  { label: "Quote", title: "Quote", line: "> " },
  { label: "List", title: "Bulleted list", line: "- " },
  { label: "Code", title: "Code", wrap: ["`", "`"] },
];

export const MarkdownField = forwardRef<BodyEditorHandle, Props>(function MarkdownField(
  { value, onChange, disabled, onFiles },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);

  // execCommand keeps the browser's undo history; setRangeText is the fallback.
  function replaceSelection(text: string, selectFrom?: number, selectTo?: number) {
    const el = area.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart;
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    }
    onChange(el.value);
    if (selectFrom !== undefined) el.setSelectionRange(start + selectFrom, start + (selectTo ?? selectFrom));
  }

  useImperativeHandle(ref, () => ({
    insertImage(name, placement) {
      const text = `\n\n![Describe the photo](${placement ? `${name}#${placement}` : name})\n\n`;
      const offset = text.indexOf("Describe the photo");
      replaceSelection(text, offset, offset + "Describe the photo".length);
    },
    insertChart(source) {
      replaceSelection("\n\n```chart\n" + source + "\n```\n\n");
    },
    // Chart positions come from the rich editor's Edit button; Markdown mode edits the text directly.
    replaceChart() {},
    focus: () => area.current?.focus(),
  }));

  function apply(tool: (typeof TOOLS)[number]) {
    const el = area.current;
    if (!el || disabled) return;
    const selected = el.value.slice(el.selectionStart, el.selectionEnd);
    if (tool.wrap) {
      const [before, after] = tool.wrap;
      const inner = selected || (tool.label === "Link" ? "link text" : "text");
      replaceSelection(`${before}${inner}${after}`, before.length, before.length + inner.length);
    } else if (tool.line) {
      const lineStart = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      el.setSelectionRange(lineStart, el.selectionEnd);
      const lines = el.value.slice(lineStart, el.selectionEnd);
      replaceSelection(lines.split("\n").map((l) => tool.line + l.replace(/^(#{1,6} |> |- )/, "")).join("\n"));
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const tool = TOOLS.find((t) => t.key === event.key.toLowerCase());
    if (tool) {
      event.preventDefault();
      apply(tool);
    }
  }

  function imagesFrom(list: FileList | null | undefined): File[] {
    return [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
  }

  return (
    <div className={cn("border border-edge transition-colors", dragging && "border-accent")}>
      <div className="flex flex-wrap items-center gap-1 border-b border-edge px-2 py-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.title}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(tool)}
            className={cn(
              "px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-40",
              tool.label === "B" && "font-bold",
              tool.label === "I" && "italic",
            )}
          >
            {tool.label}
          </button>
        ))}
        <span className={cn(label, "ml-auto hidden pr-1 sm:inline")}>Markdown · drop photos here</span>
      </div>
      <textarea
        ref={area}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          if (onFiles && e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          const files = imagesFrom(e.dataTransfer.files);
          if (onFiles && files.length) {
            e.preventDefault();
            void onFiles(files);
          }
        }}
        onPaste={(e) => {
          const files = imagesFrom(e.clipboardData.files);
          if (onFiles && files.length) {
            e.preventDefault();
            void onFiles(files);
          }
        }}
        spellCheck
        aria-label="Post body (Markdown)"
        placeholder={"Start writing…\n\n## Use ## for sections\n\nDrop a photo here to add it."}
        className="block min-h-[60vh] w-full resize-y bg-background px-4 py-4 font-mono text-[14px] leading-[1.7] outline-none disabled:opacity-60"
      />
    </div>
  );
});
