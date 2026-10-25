"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useRef } from "react";
import { buttonQuiet, label } from "../ui";

export interface HistoryEntry {
  id: string;
  kind: "published" | "autosave";
  createdAt: string;
  by: string | null;
  live: boolean;
}

interface Props {
  open: boolean;
  entries: HistoryEntry[] | null;
  canRestore: boolean;
  busy: boolean;
  onRestore(entry: HistoryEntry): void;
  onClose(): void;
}

export function HistoryDialog({ open, entries, canRestore, busy, onRestore, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const published = entries?.filter((e) => e.kind === "published") ?? [];
  const autosaves = entries?.filter((e) => e.kind === "autosave") ?? [];

  const list = (title: string, items: HistoryEntry[], limit: number) => (
    <section className="mb-8">
      <div className={`${label} mb-2 flex justify-between border-b border-edge pb-2`}>
        <span>{title}</span>
        <span>
          {items.length} of {limit} kept
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">None yet.</p>
      ) : (
        <ul>
          {items.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 border-b border-edge py-2.5 last:border-none">
              <div>
                <div className="text-sm">
                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  {entry.live && <span className={`${label} ml-2 text-accent`}>Live</span>}
                </div>
                <div className={label}>
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.by && ` · ${entry.by}`}
                </div>
              </div>
              {canRestore && (
                <button type="button" disabled={busy} className={buttonQuiet} onClick={() => onRestore(entry)}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto w-[min(560px,calc(100vw-32px))] max-h-[80vh] overflow-y-auto border border-edge bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="p-6 sm:p-8">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-fraunces text-3xl font-light tracking-[-0.02em]">History</h2>
          <button type="button" className={buttonQuiet} onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mb-6 text-sm text-muted leading-relaxed">
          Restoring copies a version into the draft; the current draft is saved to the history first, so a restore can
          be undone. Nothing goes live until you publish.
        </p>
        {entries === null ? (
          <p className={label}>Loading…</p>
        ) : (
          <>
            {list("Published versions", published, 10)}
            {list("Autosaves", autosaves, 50)}
          </>
        )}
      </div>
    </dialog>
  );
}
