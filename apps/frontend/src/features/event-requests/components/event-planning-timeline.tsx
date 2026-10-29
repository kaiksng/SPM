import { CornerDownRight } from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "@/lib/utils";

/**
 * The coordinator's at-a-glance lifecycle sidebar on the event detail page —
 * a coarser, three-stage view than EventStatusTimeline's literal status
 * history strip (Draft/Requested/Planning/... chips). "Reached" is derived
 * from the event's current status only, not its full history, which is a
 * simplification for the Rejected/Cancelled branches: since either can be
 * reached from several different prior stages, this can't know exactly how
 * far a rejected/cancelled event actually got, so it conservatively shows
 * only "Event Request" as reached for both.
 *
 * The dot shows progress (filled = reached). A stage with no page is greyed
 * until reached. A linked stage stays a link throughout, but is greyed until
 * the stage before it is reached: a coordinator opens Safety Check while
 * still in Planning to see whether they can submit, but it means nothing to
 * a request that hasn't been approved yet. The page being viewed is
 * highlighted.
 */
const STAGE_RANK: Record<string, number> = {
  draft: 0,
  requested: 1,
  clarification_requested: 1,
  planning: 2,
  approved: 2,
  pending_safety_check: 3,
  confirmed: 4,
  completed: 4,
  rejected: 1,
  cancelled: 1,
};

const STAGES = [
  { id: "requested", label: "Event Request", rank: 1 },
  {
    id: "planning",
    label: "Planning",
    rank: 2,
    // Venue and Equipment each link to their own page. Equipment shows the
    // reservations Technical Support Staff made for this event.
    children: [
      { id: "venue", label: "Venue", href: "venue" },
      { id: "equipment", label: "Equipment", href: "equipment" },
    ],
  },
  // Its own top-level link (like "requested"), not a Planning child: the
  // readiness checklist and submit action are reachable from Planning
  // onwards, and this is also where the event lands once Pending Safety
  // Check is reached, so it can't be nested under Planning without showing
  // up twice.
  { id: "pending_safety_check", label: "Safety Check", rank: 3, href: "safety-check" },
  { id: "confirmed", label: "Event Confirmed", rank: 4 },
] as const;

export function EventPlanningTimeline({
  status,
  eventId,
}: {
  status: string;
  eventId: string;
}) {
  const currentRank = STAGE_RANK[status] ?? 0;
  const { pathname } = useLocation();
  // Venue and Equipment have nothing to work on until the event is in
  // Planning (venue bookings and equipment are refused before then). A
  // Cancelled event keeps them, since it may have reached Planning and its
  // arrangements stay on record.
  const planningRank = STAGES.find((stage) => stage.id === "planning")?.rank ?? 2;
  const childrenOpen = currentRank >= planningRank || status === "cancelled";

  return (
    <nav aria-label="Event lifecycle" className="w-56 shrink-0">
      <ol>
        {STAGES.map((stage, index) => {
          const reached = currentRank >= stage.rank;
          // A linked stage reads as usable from the stage before it: Safety
          // Check is worked on during Planning, so it only greys out while
          // the event is still a request.
          const usable = currentRank >= stage.rank - 1;
          const linkHref =
            stage.id === "requested"
              ? `/events/${eventId}`
              : "href" in stage
                ? `/events/${eventId}/${stage.href}`
                : undefined;
          return (
            <li key={stage.id} className="relative pb-8 pl-7 last:pb-0">
              {index < STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 left-[7px] h-full w-px bg-slate-200"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0.5 left-0 size-3.5 rounded-full border-2",
                  reached ? "border-primary bg-primary" : "border-slate-300 bg-white",
                )}
              />
              {linkHref ? (
                <Link
                  to={linkHref}
                  aria-current={pathname === linkHref ? "page" : undefined}
                  className={cn(
                    "text-sm font-medium hover:text-primary hover:underline",
                    pathname === linkHref
                      ? "font-semibold text-primary"
                      : usable
                        ? "text-slate-900"
                        : "text-slate-400",
                  )}
                >
                  {stage.label}
                </Link>
              ) : (
                <p
                  className={cn(
                    "text-sm font-medium",
                    reached ? "text-slate-900" : "text-slate-400",
                  )}
                >
                  {stage.label}
                </p>
              )}
              {"children" in stage && (
                <ul className="mt-2 space-y-1.5">
                  {stage.children.map((child) => {
                    const childHref = `/events/${eventId}/${child.href}`;
                    const current = pathname === childHref;
                    return (
                      <li
                        key={child.id}
                        className="flex items-center gap-1.5 text-xs text-slate-600"
                      >
                        <CornerDownRight
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-slate-300"
                        />
                        {childrenOpen ? (
                          <Link
                            to={childHref}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "hover:text-primary hover:underline",
                              current && "font-semibold text-primary",
                            )}
                          >
                            {child.label}
                          </Link>
                        ) : (
                          <span className="text-slate-400">{child.label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
