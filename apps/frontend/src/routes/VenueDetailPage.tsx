import { hasPermission } from "@spm/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { getVenue, type VenueDetail } from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/** Read-only view of a venue catalogue entry — the entry point from the venue list card. */
export function VenueDetailPage() {
  const { venueId } = useParams();
  const { profile } = useAuth();
  const [venue, setVenue] = useState<VenueDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");

  usePageTitle(venue?.name ?? "Venue details");

  useEffect(() => {
    if (!venueId) return;
    let active = true;
    setLoading(true);
    getVenue(venueId)
      .then((detail) => {
        if (active) setVenue(detail);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This venue is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [venueId]);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/venues"
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to venues
          </Link>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !venue ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Venue unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This venue could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  {venue.name}
                </h1>
                {canManageVenues && (
                  <Link
                    to={`/venues/${venueId}/edit`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                    })}
                  >
                    Edit venue
                  </Link>
                )}
              </div>
              {/* AC09: who last updated this entry, and when. */}
              <p className="mt-2 text-sm text-slate-500">
                Last updated {dateTimeFormatter.format(new Date(venue.updatedAt))}
                {venue.updatedByName && ` by ${venue.updatedByName}`}
              </p>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  Overview
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Location" value={venue.location} />
                  <Field label="Capacity" value={venue.capacity} />
                  <Field label="Operating hours" value={venue.operatingHours} />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Facilities</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {venue.facilities.length > 0 ? (
                        venue.facilities.map((facility) => (
                          <span
                            key={facility}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                          >
                            {facility}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">None listed</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Description</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                      {venue.description || "Not provided"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Accessibility notes</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                      {venue.accessibilityNotes || "Not provided"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value || "Not provided"}</dd>
    </div>
  );
}
