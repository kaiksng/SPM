import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listVenueBookingRequestsMock = vi.fn();
const decideVenueBookingRequestMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
const placeVenueBookingHoldMock = vi.fn();

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ profile: { full_name: "Sam Staff", role: "venue_staff" }, user: { id: "staff-1" }, loading: false, session: {} }),
}));

vi.mock("@/features/venues/services/venue-bookings", () => ({
  listVenueBookingRequests: (...args: unknown[]) => listVenueBookingRequestsMock(...args),
  decideVenueBookingRequest: (...args: unknown[]) => decideVenueBookingRequestMock(...args),
  placeVenueBookingHold: (...args: unknown[]) => placeVenueBookingHoldMock(...args),
}));

vi.mock("@/features/venues/services/venue-disruptions", () => ({
  listVenueDisruptionsForCoordinator: (...args: unknown[]) => listVenueDisruptionsMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { VenueRequestsPage } from "./VenueRequestsPage";

const baseRequest = {
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  decidedAt: null,
  decisionNotes: null,
  expiresAt: null,
  venueLayouts: [],
  eventId: "event-1",
  eventTitle: "Career Fair",
  eventExpectedAttendance: 50,
  requestedByName: "Priya Coordinator",
  decidedByName: null,
  replacesBookingId: null,
  replacesVenueName: null,
  advisoryNotes: null,
};

// The disrupted original and the replacement requested for it.
const original = {
  ...baseRequest, id: "booking-1", status: "approved" as const, venueId: "venue-1",
  venueName: "Test Auditorium", requestedAt: "2099-04-01T00:00:00.000Z",
};
const replacement = {
  ...baseRequest, id: "booking-2", status: "pending" as const, venueId: "venue-2",
  venueName: "Grand Hall", requestedAt: "2099-04-02T00:00:00.000Z",
  replacesBookingId: "booking-1", replacesVenueName: "Test Auditorium",
};
// An unrelated, ordinary request for another event.
const ordinary = {
  ...baseRequest, id: "booking-3", status: "pending" as const, venueId: "venue-3",
  venueName: "Seminar Room", requestedAt: "2099-04-03T00:00:00.000Z",
  eventId: "event-2", eventTitle: "Evening Talk",
};

const disruption = {
  id: "disruption-1", bookingId: "booking-1", eventId: "event-1", venueId: "venue-1",
  state: "replacement_requested" as const, blockReasonCategory: "maintenance" as const,
  blockReason: "Air-conditioning repair",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/venue-requests"]}>
      <VenueRequestsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listVenueBookingRequestsMock.mockReset();
  decideVenueBookingRequestMock.mockReset().mockResolvedValue(undefined);
  listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
  placeVenueBookingHoldMock.mockReset().mockResolvedValue(undefined);
});

describe("VenueRequestsPage", () => {
  const rowFor = (title: RegExp) => screen.getByRole("button", { name: title });

  // Master-detail: a compact list on the left, the selected event's detail on the right.
  describe("list and detail", () => {
    it("lists each event once, with the venue change and tags, and selects the first", async () => {
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary]);
      listVenueDisruptionsMock.mockResolvedValue([disruption]);
      renderPage();

      const list = await screen.findByRole("list", { name: "Requests" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);

      // Newest first: the ordinary request is selected by default.
      const talk = within(list).getByRole("button", { name: /Evening Talk/ });
      expect(talk).toHaveAttribute("aria-current", "true");
      expect(within(talk).getByText("Seminar Room")).toBeInTheDocument();

      const fair = within(list).getByRole("button", { name: /Career Fair/ });
      expect(fair).not.toHaveAttribute("aria-current");
      expect(within(fair).getByText("Test Auditorium → Grand Hall")).toBeInTheDocument();
      expect(within(fair).getByText("Replacement")).toBeInTheDocument();
      expect(within(fair).getByText("Pending")).toBeInTheDocument();
      expect(within(fair).getByText("Disrupted")).toBeInTheDocument();
    });

    it("shows the detail of the selected event and switches when another is chosen", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary]);
      renderPage();

      expect(within(await screen.findByRole("article")).getByText("Evening Talk")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(1);

      await user.click(rowFor(/Career Fair/));

      expect(screen.getByRole("article", { name: "Replacement request for Career Fair" })).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(rowFor(/Career Fair/)).toHaveAttribute("aria-current", "true");
      expect(rowFor(/Evening Talk/)).not.toHaveAttribute("aria-current");
    });

    // On a narrow screen the list and the detail take turns.
    it("offers a way back to the list from the detail", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary]);
      renderPage();

      const list = await screen.findByRole("list", { name: "Requests" });
      expect(list.className).not.toContain("hidden");

      await user.click(rowFor(/Career Fair/));
      expect(list.className).toContain("hidden");

      await user.click(screen.getByRole("button", { name: "← All requests" }));
      expect(list.className).not.toContain("hidden");
    });
  });

  // SPM-82: a disrupted booking and its replacement read as one story.
  describe("a replacement request", () => {
    async function openCareerFair() {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary]);
      listVenueDisruptionsMock.mockResolvedValue([disruption]);
      renderPage();
      await user.click(await screen.findByRole("button", { name: /Career Fair/ }));
      return { user, card: screen.getByRole("article", { name: "Replacement request for Career Fair" }) };
    }

    it("shows the disrupted booking next to the proposed replacement", async () => {
      const { card } = await openCareerFair();

      const disrupted = within(card).getByRole("region", { name: "Disrupted booking" });
      expect(within(disrupted).getByText("Test Auditorium")).toBeInTheDocument();
      expect(within(disrupted).getByText("Confirmed Booking")).toBeInTheDocument();
      expect(within(disrupted).getByText("Disrupted")).toBeInTheDocument();
      expect(within(disrupted).getByText("Maintenance – Air-conditioning repair")).toBeInTheDocument();

      const proposed = within(card).getByRole("region", { name: "Proposed replacement" });
      expect(within(proposed).getByText("Grand Hall")).toBeInTheDocument();
      expect(within(proposed).getByText("Pending")).toBeInTheDocument();
      // The decision is made on the proposal only.
      expect(within(card).getAllByRole("button", { name: "Approve" })).toHaveLength(1);
      expect(within(proposed).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    });

    // SPM-82: layout and accessibility are guidance for Venue Staff, not a block.
    it("shows Venue Staff any requirement the replacement venue does not appear to meet", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([
        original,
        { ...replacement, advisoryNotes: 'Layout: the event asked for "Theatre" but this venue lists no matching layout.' },
      ]);
      renderPage();
      await user.click(await screen.findByRole("button", { name: /Career Fair/ }));

      const proposed = screen.getByRole("region", { name: "Proposed replacement" });
      const note = within(proposed).getByRole("note");
      expect(note).toHaveTextContent("Check before deciding:");
      expect(note).toHaveTextContent('Layout: the event asked for "Theatre"');
      // It does not stop them deciding.
      expect(within(proposed).getByRole("button", { name: "Approve" })).toBeEnabled();
    });

    it("shows no note when the replacement meets the event's requirements", async () => {
      await openCareerFair();

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });

    // Both venues carry the same standard picture as an ordinary request card.
    it("shows the venue picture on both the disrupted booking and the proposed replacement", async () => {
      const { card } = await openCareerFair();

      const disrupted = within(card).getByRole("region", { name: "Disrupted booking" });
      const proposed = within(card).getByRole("region", { name: "Proposed replacement" });
      expect(within(disrupted).getAllByTestId("venue-thumbnail")).toHaveLength(1);
      expect(within(proposed).getAllByTestId("venue-thumbnail")).toHaveLength(1);
    });

    it("approves the replacement through the usual decision dialog", async () => {
      const { user, card } = await openCareerFair();

      await user.click(within(within(card).getByRole("region", { name: "Proposed replacement" })).getByRole("button", { name: "Approve" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /approve/i }));

      await waitFor(() => expect(decideVenueBookingRequestMock).toHaveBeenCalledWith("booking-2", "approved", expect.anything()));
    });

    it("moves a decided request out of Needs decision and selects the next one", async () => {
      const { user, card } = await openCareerFair();

      await user.click(within(within(card).getByRole("region", { name: "Proposed replacement" })).getByRole("button", { name: "Approve" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /approve/i }));

      await waitFor(() => expect(screen.queryByRole("button", { name: /Career Fair/ })).not.toBeInTheDocument());
      expect(within(screen.getByRole("article")).getByText("Evening Talk")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Decided (1)" })).toBeInTheDocument();
    });
  });

  it("shows the same venue picture on an ordinary request", async () => {
    listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
    renderPage();

    expect(within(await screen.findByRole("article")).getAllByTestId("venue-thumbnail")).toHaveLength(1);
  });

  it("flags an ordinary request that a venue block has disrupted", async () => {
    listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
    listVenueDisruptionsMock.mockResolvedValue([
      { ...disruption, bookingId: "booking-3", eventId: "event-2", state: "replacement_required" },
    ]);
    renderPage();

    const card = await screen.findByRole("article");
    expect(await within(card).findByText("Disrupted")).toBeInTheDocument();
    expect(within(card).getByText(/Maintenance – Air-conditioning repair/)).toBeInTheDocument();
    // ...and in its list row.
    expect(within(rowFor(/Evening Talk/)).getByText("Disrupted")).toBeInTheDocument();
  });

  it("does not flag a request whose disruption is resolved", async () => {
    listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
    listVenueDisruptionsMock.mockResolvedValue([{ ...disruption, bookingId: "booking-3", state: "resolved" }]);
    renderPage();

    await screen.findByRole("article");
    expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
  });

  it("still lists the requests when the disruptions cannot be loaded", async () => {
    listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
    listVenueDisruptionsMock.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
  });

  describe("filter", () => {
    const decided = {
      ...baseRequest, id: "booking-9", status: "approved" as const, venueId: "venue-9",
      venueName: "Old Hall", requestedAt: "2099-03-01T00:00:00.000Z", eventId: "event-9", eventTitle: "Old Event",
    };

    it("defaults to what needs a decision, with counts, and switches views", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary, decided]);
      renderPage();

      expect(await screen.findByRole("button", { name: "Needs decision (2)" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Decided (1)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All (3)" })).toBeInTheDocument();
      expect(rowFor(/Evening Talk/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Old Event/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Decided (1)" }));
      expect(rowFor(/Old Event/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Evening Talk/ })).not.toBeInTheDocument();
      // The first decided item is selected, so its detail is shown.
      expect(within(screen.getByRole("article")).getByText("Old Event")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "All (3)" }));
      expect(rowFor(/Old Event/)).toBeInTheDocument();
      expect(rowFor(/Evening Talk/)).toBeInTheDocument();
    });

    it("says so when nothing is waiting for a decision", async () => {
      listVenueBookingRequestsMock.mockResolvedValue([decided]);
      renderPage();

      expect(await screen.findByText("Nothing is waiting for a decision.")).toBeInTheDocument();
    });

    it("keeps a replacement that was approved under Decided, with its earlier attempts", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([
        { ...original, status: "cancelled" as const },
        { ...replacement, id: "booking-4", status: "rejected" as const, decisionNotes: "Reserved for an exam", requestedAt: "2099-04-02T00:00:00.000Z" },
        { ...replacement, id: "booking-5", status: "approved" as const, requestedAt: "2099-04-04T00:00:00.000Z" },
      ]);
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Decided (1)" }));
      const card = await screen.findByRole("article", { name: "Replacement request for Career Fair" });
      expect(within(card).getByRole("region", { name: "Replacement" })).toBeInTheDocument();
      await user.click(within(card).getByText("Earlier attempts (1)"));
      expect(within(card).getByText("Reason: Reserved for an exam")).toBeInTheDocument();
    });
  });

  it("finds a group by the venue of any of its bookings", async () => {
    const user = userEvent.setup();
    listVenueBookingRequestsMock.mockResolvedValue([original, replacement, ordinary]);
    renderPage();

    await user.type(await screen.findByPlaceholderText("Search by event or venue"), "grand hall");

    expect(screen.getByRole("article", { name: "Replacement request for Career Fair" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Evening Talk/ })).not.toBeInTheDocument();
  });

  it("explains when the requests cannot be loaded", async () => {
    listVenueBookingRequestsMock.mockRejectedValue(new Error("Venue booking requests are unavailable."));
    renderPage();

    expect(await screen.findByText("Venue booking requests are unavailable.")).toBeInTheDocument();
  });

  it("falls back to a generic message when the load fails without an Error", async () => {
    listVenueBookingRequestsMock.mockRejectedValue("boom");
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load venue booking requests.");
  });

  it("shows a loading state, then the empty state when nobody has requested a venue", async () => {
    let finish!: (value: unknown[]) => void;
    listVenueBookingRequestsMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPage();

    expect(screen.getByLabelText("Loading requests")).toBeInTheDocument();

    finish([]);

    expect(await screen.findByRole("heading", { name: "No venue booking requests" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading requests")).not.toBeInTheDocument();
  });

  // Placing a request on hold pauses it with a deadline instead of deciding.
  describe("place on hold", () => {
    function setDeadline(value: string) {
      // datetime-local takes the whole value at once (partial keystrokes aren't valid dates).
      fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Expires at"), { target: { value } });
    }

    it("places the hold on the selected request and shows it as On Hold with its deadline", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Place on hold" }));
      const dialog = screen.getByRole("dialog", { name: "Place this request on hold" });
      expect(within(dialog).getByText("Evening Talk · Seminar Room")).toBeInTheDocument();
      setDeadline("2099-04-05T09:00");
      await user.click(within(dialog).getByRole("button", { name: "Place on hold" }));

      // Singapore 09:00 is 01:00 UTC.
      expect(placeVenueBookingHoldMock).toHaveBeenCalledWith("booking-3", "2099-04-05T01:00:00.000Z");
      const card = screen.getByRole("article");
      expect(await within(card).findByText("On Hold")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(within(card).getByText("Hold expires")).toBeInTheDocument();
      expect(within(card).getByText(formatDateTime(new Date("2099-04-05T01:00:00.000Z")))).toBeInTheDocument();
      expect(within(card).getByText(/Waiting on the coordinator to confirm/)).toBeInTheDocument();
      expect(within(card).queryByRole("button", { name: "Place on hold" })).not.toBeInTheDocument();
      // An On Hold request is still waiting for a decision.
      expect(screen.getByRole("button", { name: "Needs decision (1)" })).toBeInTheDocument();
    });

    // SPM-82: the hold applies to the proposed replacement, not the disrupted original.
    it("places the hold on a proposed replacement", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([original, replacement]);
      renderPage();

      const proposed = await screen.findByRole("region", { name: "Proposed replacement" });
      await user.click(within(proposed).getByRole("button", { name: "Place on hold" }));
      expect(within(screen.getByRole("dialog")).getByText("Career Fair · Grand Hall")).toBeInTheDocument();
      setDeadline("2099-04-05T09:00");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Place on hold" }));

      expect(placeVenueBookingHoldMock).toHaveBeenCalledWith("booking-2", "2099-04-05T01:00:00.000Z");
      const held = await screen.findByRole("region", { name: "Proposed replacement" });
      expect(await within(held).findByText(/^On hold until/)).toHaveTextContent(
        `On hold until ${formatDateTime(new Date("2099-04-05T01:00:00.000Z"))}. Waiting on the coordinator to confirm.`,
      );
      expect(within(held).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    });

    it("keeps the dialog open with the database's reason when the hold is refused", async () => {
      const user = userEvent.setup();
      placeVenueBookingHoldMock.mockRejectedValue(new Error("The hold must expire before the requested period starts"));
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Place on hold" }));
      setDeadline("2099-04-07T09:00");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Place on hold" }));

      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
        "The hold must expire before the requested period starts",
      );
      expect(within(screen.getByRole("article")).getByText("Pending")).toBeInTheDocument();
    });

    it("closes without placing a hold on Cancel", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Place on hold" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(placeVenueBookingHoldMock).not.toHaveBeenCalled();
    });
  });

  describe("request states", () => {
    it("shows an On Hold request's deadline, still waiting for a decision, without decision buttons", async () => {
      listVenueBookingRequestsMock.mockResolvedValue([{ ...ordinary, status: "on_hold" as const, expiresAt: "2099-04-05T01:00:00.000Z" }]);
      renderPage();

      const card = await screen.findByRole("article");
      expect(within(card).getByText("On Hold")).toBeInTheDocument();
      expect(within(card).getByText(formatDateTime(new Date("2099-04-05T01:00:00.000Z")))).toBeInTheDocument();
      expect(within(card).getByText(/This request still blocks other bookings for this period/)).toBeInTheDocument();
      expect(within(card).queryByRole("button", { name: /Approve|Reject|Place on hold/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Needs decision (1)" })).toBeInTheDocument();
    });

    it("files an Expired request under Decided and says the venue is free again", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([{ ...ordinary, status: "expired" as const, expiresAt: "2099-04-02T01:00:00.000Z" }]);
      renderPage();

      expect(await screen.findByText("Nothing is waiting for a decision.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Decided (1)" }));

      const card = screen.getByRole("article");
      expect(within(card).getByText("Expired")).toBeInTheDocument();
      expect(
        within(card).getByText("This request lapsed without confirmation. The venue is available again."),
      ).toBeInTheDocument();
      expect(within(card).queryByText("Hold expires")).not.toBeInTheDocument();
    });

    it("shows who rejected a request, when, and why", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([
        {
          ...ordinary,
          status: "rejected" as const,
          decidedByName: "Sam Staff",
          decidedAt: "2099-04-02T03:00:00.000Z",
          decisionNotes: "Hall is under renovation",
        },
      ]);
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Decided (1)" }));

      const card = screen.getByRole("article");
      expect(within(card).getByText(`Sam Staff · ${formatDateTime(new Date("2099-04-02T03:00:00.000Z"))}`)).toBeInTheDocument();
      expect(within(card).getByText("Reason for rejection")).toBeInTheDocument();
      expect(within(card).getByText("Hall is under renovation")).toBeInTheDocument();
    });
  });

  describe("approve and reject", () => {
    it("requires a reason before rejecting, then moves the request to Decided with that reason", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Reject" }));
      const dialog = screen.getByRole("dialog", { name: "Reject venue booking request" });
      await user.click(within(dialog).getByRole("button", { name: "Reject request" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Explain the reason for rejecting this venue booking request.",
      );
      expect(decideVenueBookingRequestMock).not.toHaveBeenCalled();

      await user.type(within(dialog).getByLabelText("Reason for rejecting"), "  Hall is under renovation  ");
      await user.click(within(dialog).getByRole("button", { name: "Reject request" }));

      expect(decideVenueBookingRequestMock).toHaveBeenCalledWith("booking-3", "rejected", "Hall is under renovation");
      expect(await screen.findByText("Nothing is waiting for a decision.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Decided (1)" }));
      expect(within(screen.getByRole("article")).getByText("Hall is under renovation")).toBeInTheDocument();
    });

    it("approves an ordinary request without notes", async () => {
      const user = userEvent.setup();
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Approve" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve request" }));

      expect(decideVenueBookingRequestMock).toHaveBeenCalledWith("booking-3", "approved", "");
      await user.click(await screen.findByRole("button", { name: "Decided (1)" }));
      expect(within(screen.getByRole("article")).getByText("Confirmed Booking")).toBeInTheDocument();
    });

    it("keeps the dialog open with the error when the decision fails", async () => {
      const user = userEvent.setup();
      decideVenueBookingRequestMock.mockRejectedValue(new Error("This request is no longer Pending"));
      listVenueBookingRequestsMock.mockResolvedValue([ordinary]);
      renderPage();

      await user.click(within(await screen.findByRole("article")).getByRole("button", { name: "Approve" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve request" }));

      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
        "This request is no longer Pending",
      );
      expect(within(screen.getByRole("article")).getByText("Pending")).toBeInTheDocument();
    });
  });
});

// Same formatter as the page, so expected dates don't depend on the machine's time zone.
function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(date);
}
