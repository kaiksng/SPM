import { History } from "lucide-react";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";

/**
 * Links to the event's full change-history page (lifecycle, clarifications,
 * field edits) — its own page rather than a popup, so it can be linked to
 * directly and doesn't compete for space with the event detail page it's
 * shown on. See routes/EventHistoryPage.tsx.
 *
 * The one change-history link: event cards and the event page top bar all
 * render this. `subtle` is the small text link under an event card's main
 * action, so the card keeps one prominent button.
 */
export function EventHistoryButton({ eventId, subtle = false }: { eventId: string; subtle?: boolean }) {
  return (
    <Link
      to={`/events/${eventId}/history`}
      className={
        subtle
          ? "inline-flex w-fit items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-primary hover:underline"
          : buttonVariants({ size: "sm", variant: "outline", className: "w-fit" })
      }
    >
      <History aria-hidden="true" className={subtle ? "size-3.5" : undefined} /> View change history
    </Link>
  );
}
