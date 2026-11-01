/**
 * Router state the venue page puts on its "View availability" link: the
 * venue page's own address (with any ?forEvent=... context), so the
 * availability calendar's "Back to <venue>" can link straight back to it.
 * A direct link, not a step back in history, so it lands on the venue page
 * however the calendar was reached.
 */
export function venueDetailReturnState(pathname: string, search: string) {
  return { venueReturnTo: `${pathname}${search}` };
}

/** Where "Back to <venue>" goes: the venue page it came from, else that venue's own page. */
export function venueReturnPath(state: unknown, venueId: string) {
  const returnTo = (state as { venueReturnTo?: unknown } | null)?.venueReturnTo;
  const venuePath = `/venues/${venueId}`;
  return typeof returnTo === "string" && (returnTo === venuePath || returnTo.startsWith(`${venuePath}?`))
    ? returnTo
    : venuePath;
}
