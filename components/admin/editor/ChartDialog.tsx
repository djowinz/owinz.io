"use client";

// The full-screen chart dialog: paste spreadsheet data, adjust a few settings
// against a live preview, and Insert/Save a canonical ```chart block. The
// model lives in lib/charts/draft.ts; this is the form around it.
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { analyzeData, buildDraft, effectiveLayout, emptySettings, fromSource, summarize, type ChartSettings } from "@/lib/charts/draft";
import { PALETTE, colorVar } from "@/lib/charts/palette";
import type { ChartType, Layout } from "@/lib/charts/spec";
import { buttonPrimary, buttonQuiet, buttonSecondary, input as inputClass, label } from "../ui";

// Recharts loads only once the dialog shows a chart.
const ChartView = lazy(() => import("@/components/charts/ChartView"));

interface Props {
  open: boolean;
  /** An existing block's inner text: edit mode. */
  initial?: string;
  onCancel(): void;
  onSave(source: string): void;
}

const TYPES: { value: ChartType; name: string }[] = [
  { value: "line", name: "Line" },
  { value: "bar", name: "Bar" },
  { value: "area", name: "Area" },
  { value: "scatter", name: "Scatter" },
  { value: "pie", name: "Pie" },
];
const LAYOUTS: { value: Layout; name: string }[] = [
  { value: "single", name: "One chart" },
  { value: "stacked", name: "Stacked" },
  { value: "dual", name: "Two axes" },
];
const fieldLabel = `${label} mb-1.5 block`;

export function ChartDialog({ open, initial, onCancel, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // What to run once the dialog has closed: Save's callback, else Cancel.
  const after = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!open) {
      if (el.open) el.close();
      return;
    }
    if (!el.open) el.showModal();
    el.querySelector("textarea")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Close first, so the browser's focus return happens before the editor takes focus.
  const close = (then?: () => void) => {
    after.current = then ?? null;
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={() => {
        const then = after.current ?? onCancel;
        after.current = null;
        then();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      {open && (
        <ChartForm
          titleId={titleId}
          initial={initial}
          onCancel={() => close()}
          onSave={(source) => close(() => onSave(source))}
        />
      )}
    </dialog>
  );
}

function ChartForm({
  titleId,
  initial,
  onCancel,
  onSave,
}: {
  titleId: string;
  initial?: string;
  onCancel(): void;
  onSave(source: string): void;
}) {
  const editing = initial !== undefined;
  const start = useMemo(() => (editing ? fromSource(initial) : { csv: "", settings: emptySettings() }), [editing, initial]);
  const [text, setText] = useState(start.csv);
  const [settings, setSettings] = useState<ChartSettings>(start.settings);
  const set = (patch: Partial<ChartSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const id = useId();

  const analysis = useMemo(() => (text.trim() ? analyzeData(text) : null), [text]);
  const data = analysis?.ok ? analysis : null;
  const draft = useMemo(() => (data ? buildDraft(data, settings) : null), [data, settings]);
  const errors = analysis && !analysis.ok ? analysis.errors : draft && !draft.ok ? draft.errors : [];
  const series = data ? data.columns.slice(1) : [];
  const type = settings.type ?? data?.suggestion.type ?? "line";
  const layout = effectiveLayout(settings.layout, series.length);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-edge px-5 py-4 sm:px-8">
        <h2 id={titleId}className="font-fraunces-italic text-2xl font-light italic tracking-[-0.02em]">
          {editing ? "Edit chart" : "Add a chart"}
        </h2>
        <span className={cn(label, "hidden sm:inline")}>Esc to close</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:overflow-hidden">
        {/* Settings */}
        <div className="flex flex-col gap-6 border-b border-edge px-5 py-6 sm:px-8 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div>
            <label htmlFor={`${id}-paste`} className={fieldLabel}>
              Paste your data
            </label>
            <textarea
              id={`${id}-paste`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={"Copy cells from a spreadsheet, or CSV.\nFirst row: column names. First column: the x-axis."}
              className={cn(inputClass, "resize-y whitespace-pre font-mono text-xs leading-relaxed")}
            />
            {data && (
              <p role="status" className="mt-2 text-xs text-muted">
                {summarize(data)}
              </p>
            )}
            {errors.length > 0 && (
              <ul role="alert" className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-400">
                {errors.slice(0, 3).map((e, i) => (
                  <li key={`${i}-${e}`}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className={fieldLabel}>
              Chart type
              {data && <span className="ml-2 normal-case tracking-normal">— suggested: {data.suggestion.reason}</span>}
            </div>
            <Segmented options={TYPES} value={type} onChange={(t) => set({ type: t })} label="Chart type" />
          </div>

          {series.length >= 2 && (
            <div>
              <div className={fieldLabel}>Layout</div>
              <Segmented
                options={LAYOUTS}
                value={layout}
                disabled={(l) => l === "dual" && series.length !== 2}
                onChange={(l) => set({ layout: l })}
                label="Layout"
              />
            </div>
          )}

          <TextField id={`${id}-title`} name="Title" value={settings.title} onChange={(title) => set({ title })} />
          <TextField id={`${id}-caption`} name="Caption" value={settings.caption} onChange={(caption) => set({ caption })} />
          <TextField id={`${id}-xlabel`} name="X label" value={settings.xLabel} onChange={(xLabel) => set({ xLabel })} />

          {series.length > 0 && (
            <div>
              <div className={fieldLabel}>Series</div>
              <ul className="space-y-4">
                {series.map((name, i) => {
                  const color = settings.colors[name] ?? PALETTE[i % PALETTE.length];
                  return (
                    <li key={name}>
                      <div className="mb-1.5 text-sm">{name}</div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div role="group" aria-label={`Color for ${name}`} className="flex gap-1">
                          {PALETTE.map((p) => (
                            <button
                              key={p}
                              type="button"
                              title={p}
                              aria-label={p}
                              aria-pressed={color === p}
                              onClick={() => set({ colors: { ...settings.colors, [name]: p } })}
                              className={cn(
                                "size-6 border-2 border-transparent outline-offset-1",
                                color === p && "border-background outline-2 outline-foreground",
                              )}
                              style={{ background: colorVar(p) }}
                            />
                          ))}
                        </div>
                        <input
                          aria-label={`Unit for ${name}`}
                          placeholder="Unit (optional)"
                          value={settings.units[name] ?? ""}
                          onChange={(e) => set({ units: { ...settings.units, [name]: e.target.value } })}
                          className={cn(inputClass, "w-36 py-1.5")}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <div className={fieldLabel}>Markers</div>
            <ul className="space-y-2">
              {settings.markers.map((m, i) => {
                const change = (patch: Partial<typeof m>) =>
                  set({ markers: settings.markers.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
                return (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      aria-label="Marker x"
                      placeholder={data?.xKind === "time" ? "2026-06-08" : "x"}
                      value={m.x}
                      onChange={(e) => change({ x: e.target.value })}
                      className={cn(inputClass, "w-36 py-1.5")}
                    />
                    <input
                      aria-label="Marker label"
                      placeholder="Label"
                      value={m.label}
                      onChange={(e) => change({ label: e.target.value })}
                      className={cn(inputClass, "py-1.5")}
                    />
                    <button
                      type="button"
                      aria-label="Remove marker"
                      className={buttonQuiet}
                      onClick={() => set({ markers: settings.markers.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className={cn(buttonQuiet, "mt-2 text-accent")}
              onClick={() => set({ markers: [...settings.markers, { x: "", label: "" }] })}
            >
              + Add marker
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="px-5 py-6 sm:px-8 lg:overflow-y-auto">
          <div className={cn(label, "mb-4")}>Preview · as readers will see it</div>
          {draft?.ok ? (
            <figure className="chart">
              {(draft.spec.title || draft.spec.caption) && (
                <figcaption>
                  {draft.spec.title && <span className="chart-title">{draft.spec.title}</span>}
                  {draft.spec.caption && <span className="chart-caption">{draft.spec.caption}</span>}
                </figcaption>
              )}
              <Suspense fallback={null}>
                <ChartView spec={draft.spec} />
              </Suspense>
            </figure>
          ) : (
            <p className="text-sm text-muted">The chart appears here once the data reads cleanly.</p>
          )}
        </div>
      </div>

      <footer className="flex justify-end gap-3 border-t border-edge px-5 py-4 sm:px-8">
        <button type="button" className={buttonSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!draft?.ok}
          onClick={() => draft?.ok && onSave(draft.source)}
        >
          {editing ? "Save" : "Insert chart"}
        </button>
      </footer>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label: groupLabel,
}: {
  options: { value: T; name: string }[];
  value: T;
  onChange(value: T): void;
  disabled?(value: T): boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={groupLabel} className="flex border border-edge">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled?.(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 border-r border-edge px-2 py-2 text-xs transition-colors last:border-r-0 hover:text-accent disabled:opacity-30 disabled:hover:text-current",
            value === o.value && "bg-foreground text-background hover:text-background",
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function TextField({ id, name, value, onChange }: { id: string; name: string; value: string; onChange(v: string): void }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {name}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}
