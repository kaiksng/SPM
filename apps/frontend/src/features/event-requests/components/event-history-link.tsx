import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";

/**
 * Links to the event's full change-history page (lifecycle, clarifications,
 * field edits) — its own page rather than a popup, so it can be linked to
 * directly and doesn't compete for space with the event detail page it's
 * shown on. See routes/EventHistoryPage.tsx.
 */
export function EventHistoryButton({ eventId }: { eventId: string }) {
  return (
    <Link
      to={`/events/${eventId}/history`}
      className={buttonVariants({ size: "sm", variant: "outline", className: "mt-3" })}
    >
      View change history
    </Link>
  );
}
