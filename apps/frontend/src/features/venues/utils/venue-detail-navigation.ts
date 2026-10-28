/**
 * Router state the venue page puts on its "View availability" link, so the
 * availability calendar knows the previous history entry really is that venue
 * page (and can go back to it with its ?forEvent=... context intact).
 */
export const FROM_VENUE_DETAIL_STATE = { fromVenueDetail: true } as const;

export function cameFromVenueDetail(state: unknown) {
  return (state as { fromVenueDetail?: boolean } | null)?.fromVenueDetail === true;
}
