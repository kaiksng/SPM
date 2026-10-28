/**
 * Router state the Events list puts on the event links it opens, so the event
 * page knows the previous history entry really is the list (and can go back
 * to it with its search and filters intact).
 */
export const FROM_EVENTS_LIST_STATE = { fromEventsList: true } as const;

export function cameFromEventsList(state: unknown) {
  return (state as { fromEventsList?: boolean } | null)?.fromEventsList === true;
}
