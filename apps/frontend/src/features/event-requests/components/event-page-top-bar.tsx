import { ArrowLeft, History } from "lucide-react";
import { Link, useNavigate } from "react-router";

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
  useHistoryBack = false,
}: {
  backTo: string;
  backLabel: string;
  eventId: string | undefined;
  /**
   * Go back in browser history instead of linking to `backTo` directly, so
   * the Events list's search/filter state — kept in its own URL — is still
   * there when the user returns, rather than resetting to a bare path.
   */
  useHistoryBack?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {useHistoryBack ? (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
        >
          <ArrowLeft /> {backLabel}
        </button>
      ) : (
        <Link to={backTo} className={buttonVariants({ variant: "ghost", className: "-ml-2" })}>
          <ArrowLeft /> {backLabel}
        </Link>
      )}
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
