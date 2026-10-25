import { getMonth } from "date-fns";

const getSeason = () => {
  const month = getMonth(new Date());
  switch (month) {
    case 0:
    case 1:
    case 2:
      return "Winter";
    case 3:
    case 4:
    case 5:
      return "Spring";
    case 6:
    case 7:
    case 8:
      return "Summer";
    case 9:
    case 10:
    case 11:
      return "Fall";
    default:
      return "Unknown";
  }
};

export { getSeason };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Frontmatter date → string. YAML turns unquoted `2026-03-15` into a Date at
 * UTC midnight; keep its calendar day rather than the local-time instant.
 */
export function normalizeDate(raw: unknown): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
  }
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Parse a content date. Bare ISO days ("2026-03-15") are read as local
 * midnight — `new Date()` would read them as UTC and land on the previous
 * day anywhere west of Greenwich.
 */
export function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const day = raw.match(ISO_DAY);
  const date = day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
