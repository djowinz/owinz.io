"use client";

import { useRef } from "react";
import { buttonDanger, buttonQuiet, label } from "../ui";
import { photoSrc, type EditorPhoto } from "./upload";

interface Props {
  photos: EditorPhoto[];
  disabled?: boolean;
  uploading: number;
  onUpload(files: File[]): void;
  onInsert(photo: EditorPhoto, placement: "" | "left" | "right"): void;
  onRemove(photo: EditorPhoto): void;
}

export function PhotoTray({ photos, disabled, uploading, onUpload, onInsert, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-edge pb-2.5">
        <h2 className={label}>Photos{photos.length ? ` · ${photos.length}` : ""}</h2>
        <button type="button" disabled={disabled} className={buttonQuiet} onClick={() => input.current?.click()}>
          {uploading ? `Uploading ${uploading}…` : "Upload"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
          multiple
          hidden
          onChange={(e) => {
            onUpload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {photos.length === 0 ? (
        <p className="py-3 text-xs text-muted">
          Drop photos into the text, paste them, or upload. Large photos are resized, rotated upright, and stripped of
          location data.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="group">
              {/* eslint-disable-next-line @next/next/no-img-element -- private CMS thumbnail */}
              <img
                src={photoSrc(photo)}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full border border-edge bg-(--sidebar) object-cover"
              />
              <div className="mt-1 truncate font-mono text-[10px] text-muted" title={photo.name}>
                {photo.name}
              </div>
              <div className="mt-0.5 flex gap-2.5">
                <button type="button" disabled={disabled} className={buttonQuiet} title="Insert centered" onClick={() => onInsert(photo, "")}>
                  Insert
                </button>
                <button type="button" disabled={disabled} className={buttonQuiet} title="Insert floated left (#left)" onClick={() => onInsert(photo, "left")}>
                  ◧
                </button>
                <button type="button" disabled={disabled} className={buttonQuiet} title="Insert floated right (#right)" onClick={() => onInsert(photo, "right")}>
                  ◨
                </button>
                <button type="button" disabled={disabled} className={`${buttonDanger} ml-auto`} title="Remove photo" onClick={() => onRemove(photo)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
