/** ISO timestamp -> the browser-local value a datetime-local input expects. */
export function localDateTime(isoValue: string | null) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}
