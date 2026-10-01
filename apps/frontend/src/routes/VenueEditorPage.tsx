import {
  emptyVenueFormValues,
  getRoleDestination,
  hasPermission,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { VenueForm } from "@/features/venues/components/venue-form";
import {
  createVenue,
  getVenue,
  listAtRiskBookings,
  updateVenue,
} from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/**
 * PB Venue Catalogue AC01/AC03. Mirrors EventRequestEditorPage's shape:
 * local load state, a shared form component, and a save handler that calls
 * the venue service (public.create_venue/public.update_venue via RPC).
 */
export function VenueEditorPage() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const editing = Boolean(venueId);

  usePageTitle(editing ? "Edit venue" : "Create venue");

  const [initialValues, setInitialValues] = useState<VenueFormValues>();
  const [atRiskBookings, setAtRiskBookings] = useState<VenueBookingAtRisk[]>([]);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState<string>();

  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");

  useEffect(() => {
    if (!venueId) {
      setInitialValues(structuredClone(emptyVenueFormValues));
      setLoading(false);
      return;
    }

    let active = true;
    Promise.all([getVenue(venueId), listAtRiskBookings(venueId)])
      .then(([values, bookings]) => {
        if (active) {
          setInitialValues(values);
          setAtRiskBookings(bookings);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This venue could not be loaded.",
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

  if (!canManageVenues) {
    return (
      <RoleGate>
        <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-red-700">Access denied</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Venue Staff access is required
            </h1>
            <Link
              to={profile ? getRoleDestination(profile.role) : "/login"}
              className={buttonVariants({ variant: "outline", className: "mt-6" })}
            >
              Return to your workspace
            </Link>
          </div>
        </div>
      </RoleGate>
    );
  }

  async function handleSave(values: VenueFormValues) {
    if (venueId) {
      await updateVenue(venueId, values);
      navigate("/venues", { replace: true, state: { notice: "Venue updated." } });
      return;
    }

    await createVenue(values);
    navigate("/venues", { replace: true, state: { notice: "Venue added." } });
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link to="/venues" className={buttonVariants({ variant: "ghost", className: "-ml-2" })}>
            <ArrowLeft /> Back to venues
          </Link>
          <header className="mt-6 border-b border-slate-200 pb-7">
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              {editing ? "Edit venue" : "Add a venue"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Name, location, capacity, room layout and operating hours are required so
              coordinators can find and book this venue.
            </p>
          </header>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h2 className="font-semibold text-red-900">Venue unavailable</h2>
              <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>
              <Link to="/venues" className={buttonVariants({ variant: "outline", className: "mt-5" })}>
                Return to venues
              </Link>
            </section>
          ) : initialValues ? (
            <div className="mt-7">
              <VenueForm
                key={venueId ?? "new"}
                initialValues={initialValues}
                atRiskBookings={atRiskBookings}
                onSave={handleSave}
                onCancel={() => navigate("/venues")}
                submitLabel={editing ? "Save changes" : "Add venue"}
              />
            </div>
          ) : null}
        </div>
      </div>
    </RoleGate>
  );
}
