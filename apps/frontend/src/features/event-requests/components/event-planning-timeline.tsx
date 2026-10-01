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
  confirmed: 3,
  completed: 3,
  rejected: 1,
  cancelled: 1,
};

const STAGES = [
  { id: "requested", label: "Event Request", rank: 1 },
  {
    id: "planning",
    label: "Planning",
    rank: 2,
    // Venue links to its own page; Equipment has no booking flow yet (its
    // own catalogue page exists at /equipment, but nothing here books
    // equipment for a specific event) — shown as a label only.
    children: [
      { id: "venue", label: "Venue", href: "venue" },
      { id: "equipment", label: "Equipment", href: undefined },
    ],
  },
  { id: "confirmed", label: "Event Confirmed", rank: 3 },
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
              {stage.id === "requested" ? (
                <Link
                  to={`/events/${eventId}`}
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
                      {child.href ? (
                        <Link
                          to={`/events/${eventId}/${child.href}`}
                          className="hover:text-primary hover:underline"
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <>
                          {child.label}
                          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                            Coming soon
                          </span>
                        </>
                      )}
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
