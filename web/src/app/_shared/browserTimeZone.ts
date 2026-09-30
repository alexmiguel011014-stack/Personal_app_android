import { DEFAULT_TIME_ZONE } from "../../domain/dates";

/**
 * The person's own calendar: the browser's zone, which is where they are. The one place the app
 * asks the machine for a zone — domain/dates.ts takes every zone as an argument, on purpose.
 */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}
