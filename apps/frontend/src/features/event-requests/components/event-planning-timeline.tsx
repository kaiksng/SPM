import { CornerDownRight } from "lucide-react";
import { Link } from "react-router";

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

  return (
    <nav aria-label="Event lifecycle" className="w-56 shrink-0">
      <ol>
        {STAGES.map((stage, index) => {
          const reached = currentRank >= stage.rank;
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
                  className={cn(
                    "text-sm font-medium hover:underline",
                    reached ? "text-slate-900" : "text-slate-400",
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
                  {stage.children.map((child) => (
                    <li
                      key={child.id}
                      className="flex items-center gap-1.5 text-xs text-slate-500"
                    >
                      <CornerDownRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-slate-300"
                      />
                      <Link
                        to={`/events/${eventId}/${child.href}`}
                        className="hover:text-primary hover:underline"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
