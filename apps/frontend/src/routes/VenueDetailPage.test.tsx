import { render, screen, waitFor, within } from "@testing-library/react";
import { singaporeLocalToIso } from "@spm/shared";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueMock = vi.fn();
const listVenueBufferTimeChangesMock = vi.fn();
const loadEventDetailMock = vi.fn();
const submitVenueBookingRequestMock = vi.fn();
const requestReplacementVenueMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const listVenueBookingsForVenueMock = vi.fn();
const checkVenueBookingAvailabilityMock = vi.fn();
const recheckVenueConflictsMock = vi.fn();
const navigateMock = vi.fn();
let useRealNavigation = false;
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "coord-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/venues/services/venues", () => ({
  getVenue: (...args: unknown[]) => getVenueMock(...args),
  listVenueBufferTimeChanges: (...args: unknown[]) => listVenueBufferTimeChangesMock(...args),
  recheckVenueConflicts: (...args: unknown[]) => recheckVenueConflictsMock(...args),
  VENUE_AVAILABILITY_LABELS: {
    available: "Available",
    pending: "Pending",
    confirmed: "Confirmed",
    blocked: "Blocked",
  },
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/venues/services/venue-bookings", () => ({
  submitVenueBookingRequest: (...args: unknown[]) => submitVenueBookingRequestMock(...args),
  requestReplacementVenue: (...args: unknown[]) => requestReplacementVenueMock(...args),
  getActiveVenueBooking: (...args: unknown[]) => getActiveVenueBookingMock(...args),
  listVenueBookingsForVenue: (...args: unknown[]) => listVenueBookingsForVenueMock(...args),
  checkVenueBookingAvailability: (...args: unknown[]) => checkVenueBookingAvailabilityMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => {
    const navigate = actual.useNavigate();
    return useRealNavigation ? navigate : navigateMock;
  } };
});

import { VenueDetailPage } from "./VenueDetailPage";
import { VenueBlocksPage } from "./VenueBlocksPage";
import { VenueCard } from "@/features/venues/components/venue-card";

vi.mock("@/features/venues/services/venue-blocks", () => ({
  listVenueBlocks: vi.fn().mockResolvedValue([]),
  createVenueBlock: vi.fn(), previewVenueBlockImpact: vi.fn(),
  shortenVenueBlock: vi.fn(), removeVenueBlock: vi.fn(),
}));

const venue = {
  name: "Auditorium",
  location: "Campus",
  capacity: "250",
  operatingHours: [{ days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], opensAt: "00:00", closesAt: "23:59" }],
  description: "",
  accessibilityNotes: "",
  facilities: ["projector", "stage"],
  layouts: ["Open Floor"],
  updatedAt: "2026-09-26T06:11:00.000Z",
  updatedByName: "keith",
  setupTimeMinutes: "15",
  turnaroundTimeMinutes: "30",
};

const event = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Recruit interns",
  description: "Desc",
  eventType: "Fair",
  expectedAttendance: 200,
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  status: "planning",
  submittedAt: "2026-09-20T00:00:00.000Z",
  organiserId: "org-1",
  organiserName: "kenneth",
  assignedCoordinatorId: "coord-1",
  assignedCoordinatorName: "joyce",
  venue: {
    preferredLocation: "Campus",
    minimumCapacity: null,
    accessibilityNotes: null,
    layoutNotes: "",
    facilities: [],
  },
  equipment: [],
  registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false },
};

function CatalogueLocation() {
  return <p>{useLocation().search}</p>;
}

function renderPage(initialEntry: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: initialEntry.split("?")[0], search: `?${initialEntry.split("?")[1] ?? ""}`, state } : initialEntry]}>
      <Routes>
        <Route path="venues/:venueId" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getVenueMock.mockReset().mockResolvedValue(venue);
  listVenueBufferTimeChangesMock.mockReset().mockResolvedValue([]);
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  submitVenueBookingRequestMock.mockReset().mockResolvedValue("booking-1");
  requestReplacementVenueMock.mockReset().mockResolvedValue("replacement-1");
  getActiveVenueBookingMock.mockReset().mockResolvedValue(null);
  listVenueBookingsForVenueMock.mockReset().mockResolvedValue([]);
  checkVenueBookingAvailabilityMock.mockReset().mockResolvedValue({ available: true, reason: null });
  recheckVenueConflictsMock.mockReset().mockResolvedValue({ venueId: "venue-1", flaggedCount: 0, clearedCount: 0, activeCount: 0 });
  navigateMock.mockReset();
  useRealNavigation = false;
  authState.profile.role = "event_coordinator";
});

describe("VenueDetailPage", () => {
  it("shows the venue's full details", async () => {
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Campus")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("projector")).toBeInTheDocument();
    expect(screen.getByText("stage")).toBeInTheDocument();
    expect(screen.getByText("Open Floor")).toBeInTheDocument();
  });

  // SPM-18 AC08: the details page shows who last saved the venue, with the date and time.
  it("SPM-18 AC08: shows the date, time and staff member of the last update", async () => {
    renderPage("/venues/venue-1");

    const when = new Intl.DateTimeFormat("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Singapore",
    }).format(new Date("2026-09-26T06:11:00.000Z"));
    expect(await screen.findByText(`Last updated ${when} by keith`)).toBeInTheDocument();
  });

  // SPM-86 AC03: saved setup and turnaround times are shown on the details page.
  it("shows the venue's setup and turnaround time", async () => {
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Setup time")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("Turnaround time")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  // SPM-86 AC04/AC05: Venue Staff see who changed a value, from what, to what, and when.
  it("shows the setup and turnaround change history to Venue Staff", async () => {
    authState.profile.role = "venue_staff";
    listVenueBufferTimeChangesMock.mockResolvedValue([
      {
        id: 2,
        field: "turnaround_time_minutes",
        previousValue: 0,
        newValue: 30,
        changedByName: "Sam Staff",
        changedAt: "2026-10-01T02:00:00.000Z",
      },
      {
        id: 1,
        field: "setup_time_minutes",
        previousValue: 5,
        newValue: 15,
        changedByName: null,
        changedAt: "2026-09-30T02:00:00.000Z",
      },
    ]);
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Setup and turnaround time history")).toBeInTheDocument();
    expect(await screen.findByText(/Turnaround time changed/)).toBeInTheDocument();
    expect(screen.getByText(/Setup time changed/)).toBeInTheDocument();
    expect(screen.getByText("0 min →")).toBeInTheDocument();
    expect(screen.getByText("5 min →")).toBeInTheDocument();
    expect(screen.getByText(/Sam Staff/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    expect(listVenueBufferTimeChangesMock).toHaveBeenCalledWith("venue-1");
  });

  // SPM-86: the change log is a convenience; the venue's current values still show if it cannot be read.
  it("still shows the venue's setup and turnaround time when the change history cannot be loaded", async () => {
    authState.profile.role = "venue_staff";
    listVenueBufferTimeChangesMock.mockRejectedValue(new Error("history unavailable"));
    renderPage("/venues/venue-1");

    expect(await screen.findByText("15 min")).toBeInTheDocument();
    expect(await screen.findByText("No setup or turnaround time changes recorded yet.")).toBeInTheDocument();
  });

  it("ignores a change history that arrives after the page was left", async () => {
    authState.profile.role = "venue_staff";
    let resolveHistory: (rows: unknown[]) => void = () => {};
    listVenueBufferTimeChangesMock.mockReturnValueOnce(new Promise((resolve) => { resolveHistory = resolve; }));
    const view = renderPage("/venues/venue-1");
    await waitFor(() => expect(listVenueBufferTimeChangesMock).toHaveBeenCalledTimes(1));

    view.unmount();
    resolveHistory([{ id: 1, field: "setup_time_minutes", previousValue: 0, newValue: 5, changedByName: "Sam", changedAt: "2026-10-01T02:00:00.000Z" }]);

    expect(screen.queryByText(/Setup time changed/)).not.toBeInTheDocument();
  });

  it("tells Venue Staff when no setup or turnaround change has been recorded", async () => {
    authState.profile.role = "venue_staff";
    renderPage("/venues/venue-1");

    expect(
      await screen.findByText("No setup or turnaround time changes recorded yet."),
    ).toBeInTheDocument();
  });

  // SPM-88 AC01: Venue Staff re-check a single venue for conflicts.
  describe("Re-check conflicts (Venue Staff)", () => {
    it("SPM-88 AC01: re-checks this venue and reports how many bookings are flagged", async () => {
      authState.profile.role = "venue_staff";
      recheckVenueConflictsMock.mockResolvedValue({ venueId: "venue-1", flaggedCount: 2, clearedCount: 0, activeCount: 2 });
      const user = userEvent.setup();
      renderPage("/venues/venue-1");

      await user.click(await screen.findByRole("button", { name: "Re-check conflicts" }));

      expect(recheckVenueConflictsMock).toHaveBeenCalledWith("venue-1");
      expect(
        await screen.findByText("2 conflicts flagged for this venue. View them on the Flagged page."),
      ).toBeInTheDocument();
    });

    it("says so when the venue has no conflicts", async () => {
      authState.profile.role = "venue_staff";
      const user = userEvent.setup();
      renderPage("/venues/venue-1");

      await user.click(await screen.findByRole("button", { name: "Re-check conflicts" }));

      expect(await screen.findByText("No scheduling conflicts for this venue.")).toBeInTheDocument();
    });

    it("uses the singular for one conflict", async () => {
      authState.profile.role = "venue_staff";
      recheckVenueConflictsMock.mockResolvedValue({ venueId: "venue-1", flaggedCount: 0, clearedCount: 0, activeCount: 1 });
      const user = userEvent.setup();
      renderPage("/venues/venue-1");

      await user.click(await screen.findByRole("button", { name: "Re-check conflicts" }));

      expect(
        await screen.findByText("1 conflict flagged for this venue. View them on the Flagged page."),
      ).toBeInTheDocument();
    });

    it("shows progress and blocks a second click while re-checking", async () => {
      authState.profile.role = "venue_staff";
      recheckVenueConflictsMock.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderPage("/venues/venue-1");

      await user.click(await screen.findByRole("button", { name: "Re-check conflicts" }));

      expect(await screen.findByRole("button", { name: "Re-checking…" })).toBeDisabled();
      expect(recheckVenueConflictsMock).toHaveBeenCalledTimes(1);
    });

    it("shows the reason when the re-check fails", async () => {
      authState.profile.role = "venue_staff";
      recheckVenueConflictsMock.mockRejectedValue(new Error("Only Venue Staff can re-check conflicts"));
      const user = userEvent.setup();
      renderPage("/venues/venue-1");

      await user.click(await screen.findByRole("button", { name: "Re-check conflicts" }));

      expect(await screen.findByText("Only Venue Staff can re-check conflicts")).toBeInTheDocument();
    });

    it("is not offered to a coordinator", async () => {
      renderPage("/venues/venue-1");

      expect(await screen.findByText("Auditorium")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Re-check conflicts" })).not.toBeInTheDocument();
      expect(recheckVenueConflictsMock).not.toHaveBeenCalled();
    });
  });

  // Feedback: Venue Staff get a per-venue log of what happened to its bookings.
  describe("Activity (Venue Staff)", () => {
    const booking = (overrides: Record<string, unknown> = {}) => ({
      id: "booking-1", status: "cancelled", startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
      requestedAt: "2099-04-01T00:00:00.000Z", decidedAt: "2099-04-01T01:00:00.000Z", decisionNotes: null,
      expiresAt: null, venueId: "venue-1", venueName: "Auditorium", venueLayouts: [], eventId: "event-1",
      eventTitle: "Career Fair", eventExpectedAttendance: 50, requestedByName: "Priya", decidedByName: "Sam Staff",
      replacesBookingId: null, replacesVenueName: null, advisoryNotes: null, label: "Breakout 1",
      expectedHeadcount: 40, isMainVenue: false, venueLocation: "Campus", venueAreaTags: [],
      cancellationReason: "Speaker dropped out", cancelledAt: "2099-04-02T00:00:00.000Z",
      cancelledByName: "Priya", mainDesignatedAt: null, ...overrides,
    });

    it("lists what happened to bookings at the venue, with the event and the reason", async () => {
      authState.profile.role = "venue_staff";
      listVenueBookingsForVenueMock.mockResolvedValue([booking()]);
      renderPage("/venues/venue-1");

      const section = await screen.findByRole("region", { name: "Activity" });
      expect(await within(section).findByText("Cancelled")).toBeInTheDocument();
      expect(within(section).getAllByText("Career Fair").length).toBeGreaterThan(0);
      expect(within(section).getAllByText("Breakout 1").length).toBeGreaterThan(0);
      expect(within(section).getByText('Reason: "Speaker dropped out"')).toBeInTheDocument();
      expect(listVenueBookingsForVenueMock).toHaveBeenCalledWith("venue-1");
    });

    it("says so when nothing has been booked at the venue", async () => {
      authState.profile.role = "venue_staff";
      renderPage("/venues/venue-1");

      expect(await screen.findByText("No bookings have been requested at this venue yet.")).toBeInTheDocument();
    });

    it("is not shown, or requested, for a coordinator", async () => {
      renderPage("/venues/venue-1");

      await screen.findByText("Setup time");
      expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
      expect(listVenueBookingsForVenueMock).not.toHaveBeenCalled();
    });
  });

  // SPM-86 AC05: the history is Venue Staff only, so other roles never request it.
  it("does not show or request the change history for a coordinator", async () => {
    renderPage("/venues/venue-1");

    await screen.findByText("Setup time");
    expect(screen.queryByText("Change history")).not.toBeInTheDocument();
    expect(listVenueBufferTimeChangesMock).not.toHaveBeenCalled();
  });

  it("shows the selected location and a separate saved address", async () => {
    getVenueMock.mockResolvedValue({ ...venue, areaTags: ["Bugis"], location: "1 Beach Road" });
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Bugis")).toBeInTheDocument();
    expect(screen.getByText("1 Beach Road")).toBeInTheDocument();
  });

  it("does not offer to request a venue without a forEvent param", async () => {
    renderPage("/venues/venue-1");

    await screen.findByText("Auditorium");
    expect(screen.queryByText("Request this venue")).not.toBeInTheDocument();
  });

  // SPM-24 AC04: the request is made from the venue already reviewed, with no separate form.
  it("offers a Request this venue action for a coordinator with a forEvent param", async () => {
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText("Request this venue")).toBeInTheDocument();
    expect(await screen.findByText(/Career Fair/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });

  it("does not offer to request a venue for a non-coordinator", async () => {
    authState.profile.role = "event_organiser";
    renderPage("/venues/venue-1?forEvent=event-1");

    await screen.findByText("Auditorium");
    expect(screen.queryByText("Request this venue")).not.toBeInTheDocument();
  });

  // SPM-24 AC04: one confirmation submits the request for this event and venue.
  it("submits the booking request and navigates back to the event's venue page", async () => {
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1");

    await user.click(await screen.findByRole("button", { name: "Request venue" }));

    await waitFor(() => {
      expect(submitVenueBookingRequestMock).toHaveBeenCalledWith("event-1", "venue-1");
    });
    expect(navigateMock).toHaveBeenCalledWith("/events/event-1/venue");
  });

  // ---- SPM-82: requesting a venue as the replacement for a disrupted booking ----

  const activeOriginal = {
    id: "booking-1", venueId: "venue-0", venueName: "Auditorium", status: "approved",
    startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z", expiresAt: null,
    replacesBookingId: null,
  };

  // SPM-82 AC04: the event already has an (disrupted) active booking, which must not block
  // a request that replaces exactly that booking.
  it("requests the venue as a replacement and returns to the event's venue page", async () => {
    getActiveVenueBookingMock.mockResolvedValue(activeOriginal);
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1&replaces=booking-1");

    expect(await screen.findByText("Request this venue as a replacement")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Request replacement" }));

    await waitFor(() => expect(requestReplacementVenueMock).toHaveBeenCalledWith("booking-1", "venue-1"));
    expect(submitVenueBookingRequestMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/events/event-1/venue");
  });

  it("explains that the replacement keeps the same period", async () => {
    getActiveVenueBookingMock.mockResolvedValue(activeOriginal);
    renderPage("/venues/venue-1?forEvent=event-1&replaces=booking-1");

    expect(await screen.findByText(/replacement for the disrupted booking of "Career Fair"\. It keeps the same period/)).toBeInTheDocument();
  });

  it("is also allowed for a Confirmed event, since approving it returns the event to Planning", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "confirmed" });
    getActiveVenueBookingMock.mockResolvedValue(activeOriginal);
    renderPage("/venues/venue-1?forEvent=event-1&replaces=booking-1");

    expect(await screen.findByRole("button", { name: "Request replacement" })).toBeEnabled();
  });

  it("does not let a Confirmed event request an ordinary new venue", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "confirmed" });
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(
      await screen.findByText("This event is Confirmed. Venues can only be requested while it is in Planning."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("says when the event has no schedule yet", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning", startsAt: null, endsAt: null });
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText("Add the event's start and end time before requesting a venue.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("shows the server's reason when the replacement is refused", async () => {
    getActiveVenueBookingMock.mockResolvedValue(activeOriginal);
    requestReplacementVenueMock.mockRejectedValue(
      new Error("This venue's capacity (10) is below the event's expected attendance (200)"),
    );
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1&replaces=booking-1");

    await user.click(await screen.findByRole("button", { name: "Request replacement" }));

    expect(await screen.findByText(/capacity \(10\) is below the event's expected attendance/)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("still blocks an ordinary request while the event has an active booking", async () => {
    getActiveVenueBookingMock.mockResolvedValue(activeOriginal);
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText(/already has an active venue request/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  // SPM-24 AC02 + AC06: a refused request (conflict, block, outside hours) says why.
  it("shows the specific error identifying why the request failed", async () => {
    submitVenueBookingRequestMock.mockRejectedValue(
      new Error("This event already has an active venue booking request"),
    );
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1");

    await user.click(await screen.findByRole("button", { name: "Request venue" }));

    expect(
      await screen.findByText("This event already has an active venue booking request"),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables the request action for a venue tagged as reference-only", async () => {
    checkVenueBookingAvailabilityMock.mockResolvedValue({
      available: false,
      reason: "This venue is not available for the event's saved schedule.",
    });
    renderPage("/venues/venue-1?forEvent=event-1&status=confirmed");

    expect(await screen.findByText("Request this venue")).toBeInTheDocument();
    expect(
      await screen.findByText("This venue is not available for the event's saved schedule."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  // SPM-26 / SPM-87 AC02 + AC03: the database refuses a venue whose effective window
  // (with setup and turnaround) overlaps another booking, and the coordinator
  // sees that window and cannot request it.
  it("blocks the request and shows the conflicting effective window", async () => {
    const reason =
      "This venue is already booked from 9:30 AM to 12:45 PM on 6 Apr 2099, including setup and turnaround time.";
    checkVenueBookingAvailabilityMock.mockResolvedValue({ available: false, reason });
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
    expect(checkVenueBookingAvailabilityMock.mock.calls[0]?.slice(0, 2)).toEqual(["venue-1", "event-1"]);
  });

  // SPM-87 AC02: windows that only touch are not a conflict, so the request stays open.
  it("keeps the request open when the database finds the venue available", async () => {
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByRole("button", { name: "Request venue" })).toBeEnabled();
  });

  it("does not trust a direct link when fresh availability fails", async () => {
    checkVenueBookingAvailabilityMock.mockResolvedValue({
      available: false,
      reason: "This venue is not available for the event's saved schedule.",
    });
    renderPage("/venues/venue-1?forEvent=event-1");
    expect(
      await screen.findByText("This venue is not available for the event's saved schedule."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("keeps an exploratory result review-only", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&fromSearch=1&explore=1");
    expect(await screen.findByText(/discuss a schedule change with the organiser/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("explains the next step when a venue is outside the organiser's preferred location", async () => {
    getVenueMock.mockResolvedValue({ ...venue, location: "West Wing" });
    renderPage("/venues/venue-1?forEvent=event-1&fromSearch=1");

    expect(await screen.findByText(/The organiser requested Campus, but this venue is in West Wing/)).toBeInTheDocument();
    expect(screen.getByText(/Check the alternative with the organiser before requesting it/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "update the event’s venue requirements" })).toHaveAttribute(
      "href", "/events/event-1/coordinator-edit",
    );
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });

  it("still allows requesting a venue tagged as available", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&status=available");

    expect(await screen.findByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });

  // ---- SPM-85: requesting a venue as an additional booking (breakout room) ----

  const additionalState = {
    additional: true,
    bookingLabel: "Breakout 1",
    venueSearch: {
      startsAt: "2099-04-06T10:00",
      endsAt: "2099-04-06T11:30",
      minimumCapacity: "40",
      location: "",
      layout: "Classroom",
      facilities: ["Whiteboard"],
      accessibility: "",
    },
  };
  const approvedMain = {
    id: "booking-1", venueId: "venue-0", venueName: "Auditorium", status: "approved",
    startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z", expiresAt: null,
    replacesBookingId: null,
  };

  // SPM-85 AC01/AC09: the event's existing booking does not block an additional one, and the
  // booking's own label, period, headcount and needs are what is requested.
  it("SPM-85 AC01/AC09: requests the venue as an additional booking with its own details", async () => {
    getActiveVenueBookingMock.mockResolvedValue(approvedMain);
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1&additional=1", additionalState);

    expect(await screen.findByText("Request this venue as Breakout 1")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Request additional venue" }));

    await waitFor(() => {
      expect(submitVenueBookingRequestMock).toHaveBeenCalledWith("event-1", "venue-1", {
        label: "Breakout 1",
        startsAt: singaporeLocalToIso("2099-04-06T10:00"),
        endsAt: singaporeLocalToIso("2099-04-06T11:30"),
        expectedHeadcount: 40,
        layoutNotes: "Classroom",
        accessibilityNotes: undefined,
        requiredFacilities: ["Whiteboard"],
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/events/event-1/venue");
  });

  // SPM-85 AC04: availability is checked for the booking's own period, not the event's.
  it("SPM-85 AC04: checks availability for the booking's own period", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&additional=1", additionalState);

    await screen.findByText("Request this venue as Breakout 1");
    await waitFor(() => {
      expect(checkVenueBookingAvailabilityMock).toHaveBeenCalledWith("venue-1", "event-1", {
        startsAt: singaporeLocalToIso("2099-04-06T10:00"),
        endsAt: singaporeLocalToIso("2099-04-06T11:30"),
      });
    });
  });

  it("SPM-85 AC04: a venue smaller than the booking's headcount cannot be requested", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&additional=1", {
      ...additionalState,
      venueSearch: { ...additionalState.venueSearch, minimumCapacity: "300" },
    });

    expect(await screen.findByText(/capacity \(250\) is below this booking's expected headcount \(300\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request additional venue" })).toBeDisabled();
  });

  it("asks the coordinator to describe the booking first when the details were lost", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&additional=1");

    expect(await screen.findByText(/Describe this booking first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request additional venue" })).toBeDisabled();
    expect(submitVenueBookingRequestMock).not.toHaveBeenCalled();
  });
});

// SPM-85 / SPM-82 / SPM-24: the venue page a coordinator reviews before requesting a booking.
describe("VenueDetailPage loading and requesting", () => {
  it("says why the venue could not be loaded, and that it was not found", async () => {
    getVenueMock.mockRejectedValueOnce(new Error("Venue lookup failed"));
    const failed = renderPage("/venues/venue-1");
    expect(await screen.findByText("Venue unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Venue lookup failed");
    failed.unmount();

    getVenueMock.mockRejectedValueOnce("boom");
    const unknown = renderPage("/venues/venue-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("This venue is unavailable or you do not have access to it.");
    unknown.unmount();

    getVenueMock.mockResolvedValueOnce(null);
    renderPage("/venues/venue-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("This venue could not be found.");
  });

  it("ignores a venue that arrives after the coordinator has left the page", async () => {
    let resolveVenue: (value: unknown) => void = () => {};
    getVenueMock.mockReturnValueOnce(new Promise((resolve) => { resolveVenue = resolve; }));
    const first = renderPage("/venues/venue-1");
    first.unmount();
    resolveVenue(venue);

    let rejectVenue: (reason: unknown) => void = () => {};
    getVenueMock.mockReturnValueOnce(new Promise((_, reject) => { rejectVenue = reject; }));
    const second = renderPage("/venues/venue-1");
    second.unmount();
    rejectVenue(new Error("too late"));

    await waitFor(() => expect(getVenueMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Auditorium")).not.toBeInTheDocument();
    expect(screen.queryByText("Venue unavailable")).not.toBeInTheDocument();
  });

  it("returns to the catalogue when opened directly", async () => {
    const user = userEvent.setup();
    renderPage("/venues/venue-1");

    await user.click(await screen.findByRole("button", { name: /Back to venues/ }));

    expect(navigateMock).toHaveBeenCalledWith("/venues");
  });

  // SPM-19: returning from block management must not trap staff in history.
  it("returns to the filtered catalogue after visiting Manage blocks twice", async () => {
    useRealNavigation = true;
    authState.profile.role = "venue_staff";
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/venues?search=Hall"]}><Routes>
      <Route path="venues" element={<><h1>Filtered catalogue</h1><CatalogueLocation /><VenueCard venue={{ ...venue, id: "venue-1", areaTags: [], imageUrl: null, operatingHours: [], capacity: 250, setupTimeMinutes: 15, turnaroundTimeMinutes: 30, needsReviewCount: 0 }} canManageVenues /></>} />
      <Route path="venues/:venueId" element={<VenueDetailPage />} />
      <Route path="venues/:venueId/blocks" element={<VenueBlocksPage />} />
    </Routes></MemoryRouter>);
    await user.click(screen.getByRole("link", { name: /View details/ }));
    for (let i = 0; i < 2; i++) {
      await user.click(await screen.findByRole("link", { name: "Manage blocks" }));
      await screen.findByText("Block history");
      await user.click(screen.getByRole("link", { name: "Back to venue" }));
    }
    await user.click(await screen.findByRole("button", { name: "Back to venues" }));
    expect(await screen.findByRole("heading", { name: "Filtered catalogue" })).toBeInTheDocument();
    expect(screen.getByText("?search=Hall")).toBeInTheDocument();
  });

  it("preserves catalogue filters and rejects unrelated return destinations", async () => {
    const user = userEvent.setup();
    const first = renderPage("/venues/venue-1", { venueCatalogueUrl: "/venues?search=Hall&location=Bugis" });
    await user.click(await screen.findByRole("button", { name: "Back to venues" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/venues?search=Hall&location=Bugis");
    first.unmount();
    renderPage("/venues/venue-1", { venueCatalogueUrl: "/events" });
    await user.click(await screen.findByRole("button", { name: "Back to venues" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/venues");
  });

  // SPM-85: a notification about a cancelled booking opens the venue's Activity section.
  it("scrolls to the Activity section when opened from a notification", async () => {
    authState.profile.role = "venue_staff";
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPage("/venues/venue-1#activity");

    await screen.findByText("No bookings have been requested at this venue yet.");

    // The page scrolls in an effect that runs just after it first draws, so wait for it
    // rather than checking once (a slow machine can check first).
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("still shows the venue when its activity cannot be loaded", async () => {
    authState.profile.role = "venue_staff";
    listVenueBookingsForVenueMock.mockRejectedValue(new Error("activity unavailable"));
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Auditorium")).toBeInTheDocument();
    expect(await screen.findByText("No bookings have been requested at this venue yet.")).toBeInTheDocument();
  });

  // SPM-24: when availability cannot be confirmed, the coordinator cannot request the venue.
  it("does not let the coordinator request a venue whose availability could not be verified", async () => {
    checkVenueBookingAvailabilityMock.mockRejectedValue(new Error("offline"));
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText("Availability could not be verified. Return to the event and try again.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("uses a plain message when a request fails without one", async () => {
    submitVenueBookingRequestMock.mockRejectedValue("boom");
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1");

    await user.click(await screen.findByRole("button", { name: "Request venue" }));

    expect(await screen.findByText("This venue booking request could not be submitted.")).toBeInTheDocument();
  });
});

// SPM-21 / SPM-85: the coordinator is told when a venue is outside the organiser's preferred location.
describe("VenueDetailPage preferred location advisory", () => {
  const withPreferred = (preferredLocation: string) =>
    loadEventDetailMock.mockResolvedValue({ ...event, venue: { ...event.venue, preferredLocation } });

  it("says nothing when the venue is tagged with the organiser's preferred area", async () => {
    withPreferred("Bugis");
    getVenueMock.mockResolvedValue({ ...venue, location: "Block A", areaTags: ["Bugis"] });
    renderPage("/venues/venue-1?forEvent=event-1");

    await screen.findByRole("button", { name: "Request venue" });
    expect(screen.queryByText(/The organiser requested/)).not.toBeInTheDocument();
  });

  it("falls back to the venue's address when it has no area tags", async () => {
    withPreferred("Bugis");
    getVenueMock.mockResolvedValue({ ...venue, location: "Bugis Junction", areaTags: [] });
    renderPage("/venues/venue-1?forEvent=event-1");

    await screen.findByRole("button", { name: "Request venue" });
    expect(screen.queryByText(/The organiser requested/)).not.toBeInTheDocument();
  });

  it("names the venue's area when it is tagged with a different one", async () => {
    withPreferred("Bugis");
    getVenueMock.mockResolvedValue({ ...venue, location: "Block A", areaTags: ["Central Area"] });
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText(/The organiser requested Bugis, but this venue is in Central Area/)).toBeInTheDocument();
  });

  it("says nothing when a free-text preferred location appears in the venue's address", async () => {
    withPreferred("campus");
    renderPage("/venues/venue-1?forEvent=event-1");

    await screen.findByRole("button", { name: "Request venue" });
    expect(screen.queryByText(/The organiser requested/)).not.toBeInTheDocument();
  });
});
