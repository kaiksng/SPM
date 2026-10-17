import { ArrowLeft, History } from "lucide-react";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";

/**
 * The top row of every event page: the way back on the left and, on the right,
 * the event's change history. History is one click away at every stage of the
 * event and on every sub-page (details, venue, equipment, edit), instead of
 * sitting at the bottom of one page.
 */
export function EventPageTopBar({
  backTo,
  backLabel,
  eventId,
}: {
  backTo: string;
  backLabel: string;
  eventId: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link to={backTo} className={buttonVariants({ variant: "ghost", className: "-ml-2" })}>
        <ArrowLeft /> {backLabel}
      </Link>
      {eventId && (
        <Link
          to={`/events/${eventId}/history`}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          <History aria-hidden="true" /> Change history
        </Link>
      )}
    </div>
  );
}
