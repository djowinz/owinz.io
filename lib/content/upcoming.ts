// The upcoming/past rule for talks, shared by the site (render.ts splitTalks)
// and the CMS. Kept dependency-light so the talk editor can use it client-side.
import { parseDate } from "../dates";

/**
 * The `upcoming` override when set, otherwise by date. A talk stays upcoming
 * through its own day; dates are calendar days read as local midnight.
 */
export function isUpcomingTalk(talk: { date: string; upcoming?: boolean | null }, now: Date): boolean {
  if (talk.upcoming != null) return talk.upcoming;
  const day = parseDate(talk.date);
  if (!day) return false;
  return day.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
