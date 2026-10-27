/** Fixed chart palette, in default-assignment order. Stored blocks name colors, never hex. */
export const PALETTE = ["violet", "rust", "teal", "gold", "blue", "magenta", "olive", "slate"] as const;
export type PaletteName = (typeof PALETTE)[number];

export function colorVar(name: PaletteName): string {
  return `var(--chart-${name})`;
}
