// "Today" is decided in Canadian (Eastern) time, so the app never jumps to tomorrow in the evening the way UTC does.
// Dates are stored as UTC midnight of the calendar day, so the helpers below work with the day, not the clock.

export const APP_TIMEZONE = "America/Toronto";

/** Today's calendar day in Canadian time as YYYY-MM-DD. */
export function todayInCanada(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "numeric" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day").padStart(2, "0")}`;
}

/** Today's calendar day in Canadian time, as UTC midnight (the way dates are stored). */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(`${todayInCanada(now)}T00:00:00.000Z`);
}
