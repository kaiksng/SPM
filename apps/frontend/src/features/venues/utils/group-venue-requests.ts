import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

/**
 * SPM-82: the staff Requests page groups a replacement with the disrupted
 * booking it replaces, so one event reads as one story instead of several
 * unrelated cards. An ordinary request stays on its own.
 */
export type VenueRequestItem =
  | { kind: "single"; key: string; request: VenueBookingRequestSummary; needsDecision: boolean; latestRequestedAt: string }
  | {
      kind: "replacement";
      key: string;
      /** The disrupted booking being replaced. */
      original: VenueBookingRequestSummary;
      /** The attempt to show: the one awaiting a decision, else the most recent. */
      current: VenueBookingRequestSummary;
      /** Other attempts at replacing the same booking (rejected or withdrawn), newest first. */
      earlier: VenueBookingRequestSummary[];
      needsDecision: boolean;
      latestRequestedAt: string;
    };

/** A request still waiting on Venue Staff (a hold is a pause, not a decision). */
export function awaitsDecision(request: VenueBookingRequestSummary) {
  return request.status === "pending" || request.status === "on_hold";
}

export function groupVenueRequests(requests: VenueBookingRequestSummary[]): VenueRequestItem[] {
  const byId = new Map(requests.map((request) => [request.id, request]));

  // Replacements whose disrupted booking is in the list, grouped by that booking.
  const attemptsByOriginal = new Map<string, VenueBookingRequestSummary[]>();
  for (const request of requests) {
    if (request.replacesBookingId && byId.has(request.replacesBookingId)) {
      const attempts = attemptsByOriginal.get(request.replacesBookingId) ?? [];
      attempts.push(request);
      attemptsByOriginal.set(request.replacesBookingId, attempts);
    }
  }
  const groupedRequestIds = new Set<string>();
  for (const [originalId, attempts] of attemptsByOriginal) {
    groupedRequestIds.add(originalId);
    for (const attempt of attempts) groupedRequestIds.add(attempt.id);
  }

  const items: VenueRequestItem[] = [];

  for (const [originalId, attempts] of attemptsByOriginal) {
    const newestFirst = [...attempts].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const current = newestFirst.find(awaitsDecision) ?? newestFirst[0]!;
    items.push({
      kind: "replacement",
      key: `replacement-${originalId}`,
      original: byId.get(originalId)!,
      current,
      earlier: newestFirst.filter((attempt) => attempt.id !== current.id),
      needsDecision: newestFirst.some(awaitsDecision),
      latestRequestedAt: newestFirst[0]!.requestedAt,
    });
  }

  for (const request of requests) {
    if (groupedRequestIds.has(request.id)) continue;
    items.push({
      kind: "single",
      key: request.id,
      request,
      needsDecision: awaitsDecision(request),
      latestRequestedAt: request.requestedAt,
    });
  }

  return items.sort((a, b) => b.latestRequestedAt.localeCompare(a.latestRequestedAt));
}

/** Case-insensitive match on event, venues and requester, across a whole group. */
export function venueRequestItemMatches(item: VenueRequestItem, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const requests =
    item.kind === "single" ? [item.request] : [item.original, item.current, ...item.earlier];
  return requests.some(
    (request) =>
      request.eventTitle.toLowerCase().includes(trimmed) ||
      request.venueName.toLowerCase().includes(trimmed) ||
      (request.requestedByName ?? "").toLowerCase().includes(trimmed),
  );
}
