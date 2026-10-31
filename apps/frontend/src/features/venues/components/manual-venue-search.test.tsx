import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchAvailableVenuesMock = vi.fn();

vi.mock("@/features/venues/services/venue-search", () => ({
  searchAvailableVenues: (...args: unknown[]) => searchAvailableVenuesMock(...args),
}));
vi.mock("@/features/venues/hooks/use-room-layout-options", () => ({
  useRoomLayoutOptions: () => ["Classroom", "Theatre"],
}));
// The facility picker is a popover covered by its own tests; a button keeps this test about the search.
vi.mock("@/components/ui/amenity-picker", () => ({
  AmenityPicker: ({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) => (
    <button type="button" onClick={() => onChange(["Microphone"])}>
      Pick facility ({value.length})
    </button>
  ),
}));

import type { EventDetail } from "@/features/event-requests/services/event-details";
import type { VenueSummary } from "@/features/venues/services/venues";

import { additionalSearchDefaults, eventSearchDefaults, ManualVenueSearch } from "./manual-venue-search";

const event: EventDetail = {
  id: "event-1", title: "Planning event", purpose: null, description: null, eventType: null,
  expectedAttendance: 20,
  startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
  status: "planning", submittedAt: null, organiserId: "organiser-1", organiserName: null,
  assignedCoordinatorId: "coordinator-1", assignedCoordinatorName: null, bannerPath: null,
  venue: {
    preferredLocation: "Bugis", minimumCapacity: 30, accessibilityNotes: "wheelchair",
    layoutNotes: "Theatre", facilities: ["Projector"],
  },
  equipment: [],
  registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
};

const noDates: EventDetail = { ...event, startsAt: null, endsAt: null };

function venue(overrides: Partial<VenueSummary> = {}): VenueSummary {
  return {
    id: "venue-1", name: "Conference Room A", location: "Bugis", areaTags: [], capacity: 50,
    operatingHours: [{ days: ["mon", "tue", "wed", "thu", "fri"], opensAt: "08:00", closesAt: "18:00" }],
    description: null, accessibilityNotes: "Step-free entrance", facilities: ["Projector"], layouts: ["Theatre"],
    imageUrl: null, updatedAt: "2026-09-20T00:00:00.000Z", updatedByName: null, needsReviewCount: 0,
    availabilityStatus: "available", setupTimeMinutes: 30, turnaroundTimeMinutes: 15,
    ...overrides,
  };
}

type Props = Partial<React.ComponentProps<typeof ManualVenueSearch>>;

function renderSearch(props: Props = {}, state?: unknown, eventDetail: EventDetail = event) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/events/event-1/venue", state }]}>
      <ManualVenueSearch event={eventDetail} hasActiveBooking={false} {...props} />
    </MemoryRouter>,
  );
}

const startInput = () => screen.getByLabelText(/Start date and time/);
const endInput = () => screen.getByLabelText(/End date and time/);
const capacityInput = () => screen.getByLabelText(/capacity/i);

beforeEach(() => {
  searchAvailableVenuesMock.mockReset().mockResolvedValue([venue()]);
});

describe("eventSearchDefaults", () => {
  // SPM-21 AC: search inputs start from the event's requirements.
  it("starts from the event's period and requirements", () => {
    expect(eventSearchDefaults(event)).toEqual({
      startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00", minimumCapacity: "30",
      location: "Bugis", layout: "Theatre", facilities: ["Projector"], accessibility: "wheelchair",
    });
  });

  // SPM-21 AC: the initial capacity is the greater of expected attendance and the saved minimum.
  it("uses the greater of expected attendance and the saved minimum capacity", () => {
    const withAttendance = (expectedAttendance: number | null, minimumCapacity: number | null) =>
      eventSearchDefaults({ ...event, expectedAttendance, venue: { ...event.venue, minimumCapacity } }).minimumCapacity;

    expect(withAttendance(80, 30)).toBe("80");
    expect(withAttendance(20, 30)).toBe("30");
    expect(withAttendance(25, null)).toBe("25");
    expect(withAttendance(null, 40)).toBe("40");
    expect(withAttendance(null, null)).toBe("");
  });

  it("leaves unknown values blank", () => {
    expect(
      eventSearchDefaults({
        ...noDates,
        venue: { ...event.venue, preferredLocation: null as unknown as string, accessibilityNotes: null, layoutNotes: null as unknown as string },
      }),
    ).toMatchObject({ startsAt: "", endsAt: "", location: "", layout: "", accessibility: "" });
  });
});

describe("additionalSearchDefaults", () => {
  // SPM-85 AC: an additional venue starts from the event's period and the main venue's area, with no headcount.
  it("starts from the event period, the main venue's area and no headcount or filters", () => {
    expect(additionalSearchDefaults(event, "Bugis")).toEqual({
      startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00", minimumCapacity: "",
      location: "Bugis", layout: "", facilities: [], accessibility: "",
    });
    expect(additionalSearchDefaults(noDates, "Bugis")).toMatchObject({ startsAt: "", endsAt: "" });
  });
});

describe("ManualVenueSearch", () => {
  it("opens with the event's requirements and explains that the event is not changed", () => {
    renderSearch();

    expect(screen.getByText(/does not change the event or its agreed requirements/)).toBeInTheDocument();
    expect(startInput()).toHaveValue("2099-04-06T10:00");
    expect(endInput()).toHaveValue("2099-04-06T12:00");
    expect(capacityInput()).toHaveValue(30);
    expect(screen.getByLabelText("Location")).toHaveValue("Bugis");
    expect(screen.getByLabelText("Room layout")).toHaveValue("Theatre");
    expect(screen.getByLabelText("Accessibility keywords")).toHaveValue("wheelchair");
    expect(screen.getByRole("button", { name: "Pick facility (1)" })).toBeInTheDocument();
  });

  // SPM-21 AC: a valid start/end period and a positive capacity are required.
  describe("validation", () => {
    it("identifies a missing start and does not search", async () => {
      renderSearch();

      fireEvent.change(startInput(), { target: { value: "" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("Enter a start date and time")).toBeInTheDocument();
      expect(startInput()).toHaveAttribute("aria-invalid", "true");
      expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
    });

    it("rejects a capacity that is not positive and an end that is not after the start", async () => {
      renderSearch();

      fireEvent.change(capacityInput(), { target: { value: "0" } });
      fireEvent.change(endInput(), { target: { value: "2099-04-06T10:00" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("Enter a positive minimum capacity")).toBeInTheDocument();
      expect(screen.getByText("End time must be after start time")).toBeInTheDocument();
      expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
    });

    it("clears a field's error once that field is edited", async () => {
      renderSearch();

      fireEvent.change(capacityInput(), { target: { value: "0" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByText("Enter a positive minimum capacity")).toBeInTheDocument();

      fireEvent.change(capacityInput(), { target: { value: "25" } });

      expect(screen.queryByText("Enter a positive minimum capacity")).not.toBeInTheDocument();
    });
  });

  describe("results", () => {
    // SPM-21 AC: each result shows the details relevant to suitability and its availability.
    it("shows each matching venue's suitability details and availability", async () => {
      searchAvailableVenuesMock.mockResolvedValue([
        venue(),
        venue({ id: "venue-2", name: "Quiet Room", facilities: [], layouts: [], accessibilityNotes: null, setupTimeMinutes: undefined, turnaroundTimeMinutes: undefined }),
      ]);
      renderSearch();

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("heading", { name: "2 available venues" })).toBeInTheDocument();
      const first = screen.getByRole("heading", { name: "Conference Room A" }).closest("article") as HTMLElement;
      expect(within(first).getByText("Available")).toBeInTheDocument();
      expect(within(first).getByText("Capacity 50")).toBeInTheDocument();
      expect(within(first).getByText(/Hours:/)).toBeInTheDocument();
      expect(within(first).getByText("Layouts: Theatre")).toBeInTheDocument();
      expect(within(first).getByText("Facilities: Projector")).toBeInTheDocument();
      expect(within(first).getByText("Accessibility: Step-free entrance")).toBeInTheDocument();
      expect(within(first).getByText(/Setup 30 min/)).toHaveTextContent("Turnaround 15 min");
      const second = screen.getByRole("heading", { name: "Quiet Room" }).closest("article") as HTMLElement;
      expect(within(second).getByText("Layouts: None listed")).toBeInTheDocument();
      expect(within(second).getByText("Facilities: None listed")).toBeInTheDocument();
      expect(within(second).getByText("Accessibility: None listed")).toBeInTheDocument();
      expect(within(second).getByText(/Setup 0 min/)).toHaveTextContent("Turnaround 0 min");
    });

    it("searches with the event id and the values on screen", async () => {
      renderSearch();

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      await waitFor(() => expect(searchAvailableVenuesMock).toHaveBeenCalledTimes(1));
      expect(searchAvailableVenuesMock).toHaveBeenCalledWith("event-1", {
        startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00", minimumCapacity: "30",
        location: "Bugis", layout: "Theatre", facilities: ["Projector"], accessibility: "wheelchair",
      });
    });

    it("uses the singular for one result", async () => {
      renderSearch();

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("heading", { name: "1 available venue" })).toBeInTheDocument();
    });

    it("says no venue matched when the search finds none", async () => {
      searchAvailableVenuesMock.mockResolvedValue([]);
      renderSearch();

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("No matching venue was found.")).toBeInTheDocument();
      expect(screen.getByText("0 available venues")).toBeInTheDocument();
    });

    it("shows that it is searching, then the results", async () => {
      let finish: (venues: VenueSummary[]) => void = () => {};
      searchAvailableVenuesMock.mockReturnValue(new Promise<VenueSummary[]>((resolve) => { finish = resolve; }));
      renderSearch();

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("Checking venue availability…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Searching…/ })).toBeDisabled();
      finish([venue()]);
      expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    });

    it("reports a failed search and a failure that carries no message", async () => {
      searchAvailableVenuesMock.mockRejectedValueOnce(new Error("search unavailable"));
      renderSearch();
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent("search unavailable");

      searchAvailableVenuesMock.mockRejectedValueOnce("boom");
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Venue search failed.");
    });

    it("hides the results as soon as a filter changes", async () => {
      renderSearch();
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByText("Conference Room A")).toBeInTheDocument();

      fireEvent.change(capacityInput(), { target: { value: "45" } });

      expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
    });
  });

  describe("adjusting the filters", () => {
    // SPM-21 AC: when specified, location, layout, facilities and accessibility are all sent; blanks are not restrictions.
    it("sends every adjusted filter", async () => {
      renderSearch();

      await userEvent.selectOptions(screen.getByLabelText("Location"), "North");
      await userEvent.selectOptions(screen.getByLabelText("Room layout"), "Classroom");
      await userEvent.click(screen.getByRole("button", { name: /Pick facility/ }));
      fireEvent.change(screen.getByLabelText("Accessibility keywords"), { target: { value: "hearing loop" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      await waitFor(() => expect(searchAvailableVenuesMock).toHaveBeenCalled());
      expect(searchAvailableVenuesMock.mock.calls[0]?.[1]).toMatchObject({
        location: "North", layout: "Classroom", facilities: ["Microphone"], accessibility: "hearing loop",
      });
    });

    it("keeps a location or layout saved earlier that is no longer in the standard lists", () => {
      renderSearch({}, { venueSearch: { ...eventSearchDefaults(event), location: "Old Campus", layout: "U-shape" } });

      expect(screen.getByRole("option", { name: "Old Campus (previously saved)" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "U-shape" })).toBeInTheDocument();
    });

    it("returns to the event's requirements on reset", async () => {
      renderSearch();
      fireEvent.change(capacityInput(), { target: { value: "0" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByText("Enter a positive minimum capacity")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Reset to event requirements" }));

      expect(capacityInput()).toHaveValue(30);
      expect(screen.queryByText("Enter a positive minimum capacity")).not.toBeInTheDocument();
    });
  });

  // SPM-21 AC: changing the search dates does not change the event; a venue found for other dates cannot be requested.
  describe("dates other than the event's", () => {
    it("explains the results are for exploring and opens each venue in explore mode", async () => {
      renderSearch();

      fireEvent.change(startInput(), { target: { value: "2099-04-07T10:00" } });
      fireEvent.change(endInput(), { target: { value: "2099-04-07T12:00" } });
      expect(screen.getByRole("status")).toHaveTextContent("These dates differ from the event schedule");
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/venues/venue-1?forEvent=event-1&fromSearch=1&explore=1",
      );
    });

    it("opens a venue for requesting when the dates match the event and there is no active request", async () => {
      renderSearch();
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/venues/venue-1?forEvent=event-1&fromSearch=1",
      );
      expect(screen.queryByText(/These dates differ/)).not.toBeInTheDocument();
    });
  });

  // SPM-21 AC: manual search is available even when the event already has an active venue request.
  it("lets the coordinator browse when an active request exists, but not request another", async () => {
    renderSearch({ hasActiveBooking: true });

    expect(screen.getByText(/already has an active venue request/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
    expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/venues/venue-1?forEvent=event-1&fromSearch=1&explore=1",
    );
  });

  it("restores the search the coordinator came back from", () => {
    renderSearch({}, { venueSearch: { ...eventSearchDefaults(event), minimumCapacity: "77" } });

    expect(capacityInput()).toHaveValue(77);
  });

  it("ignores a saved search that belongs to the other kind of search", () => {
    renderSearch({}, { additional: true, bookingLabel: "Breakout 1", venueSearch: { ...eventSearchDefaults(event), minimumCapacity: "77" } });

    expect(capacityInput()).toHaveValue(30);
  });

  // SPM-82 AC: the disrupted venue is never offered as its own replacement.
  describe("replacing a disrupted booking", () => {
    it("leaves the disrupted venue out and carries the booking into each link", async () => {
      searchAvailableVenuesMock.mockResolvedValue([venue(), venue({ id: "venue-2", name: "Auditorium" })]);
      renderSearch({ replacing: { bookingId: "booking-1", venueId: "venue-1" } });

      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
      expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "1 available venue" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/venues/venue-2?forEvent=event-1&fromSearch=1&replaces=booking-1",
      );
    });
  });

  // SPM-85: an additional venue has its own label, period and headcount.
  describe("additional venue", () => {
    const additional = { defaultLocation: "Bugis" };

    it("starts from the event period and the main venue's area with no headcount", () => {
      renderSearch({ additional });

      expect(screen.getByText(/Describe the room this booking needs/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Booking label/)).toHaveValue("");
      expect(capacityInput()).toHaveValue(null);
      expect(screen.getByLabelText("Location")).toHaveValue("Bugis");
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    });

    it("requires a label before searching", async () => {
      renderSearch({ additional });

      fireEvent.change(capacityInput(), { target: { value: "20" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("Give this booking a label, for example Breakout 1")).toBeInTheDocument();
      expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
    });

    it("rejects a period outside the event", async () => {
      renderSearch({ additional });

      await userEvent.type(screen.getByLabelText(/Booking label/), "Breakout 1");
      fireEvent.change(capacityInput(), { target: { value: "20" } });
      fireEvent.change(startInput(), { target: { value: "2099-04-06T09:00" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByText("This booking's period must fall within the event's start and end time")).toBeInTheDocument();
      expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
    });

    // SPM-85: field feedback follows the event boundary that was exceeded.
    it.each([
      ["2099-04-06T09:00", "2099-04-06T12:00", true, false],
      ["2099-04-06T10:00", "2099-04-06T13:00", false, true],
      ["2099-04-06T09:00", "2099-04-06T13:00", true, true],
    ])("flags the correct boundary for %s to %s", async (start, end, invalidStart, invalidEnd) => {
      renderSearch({ additional });
      await userEvent.type(screen.getByLabelText(/Booking label/), "Breakout 1");
      fireEvent.change(capacityInput(), { target: { value: "20" } });
      fireEvent.change(startInput(), { target: { value: start } });
      fireEvent.change(endInput(), { target: { value: end } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      await screen.findAllByText("This booking's period must fall within the event's start and end time");
      expect(startInput()).toHaveAttribute("aria-invalid", String(invalidStart));
      expect(endInput()).toHaveAttribute("aria-invalid", String(invalidEnd));
      expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
      // Correcting the range lets the next search proceed.
      fireEvent.change(startInput(), { target: { value: "2099-04-06T10:00" } });
      fireEvent.change(endInput(), { target: { value: "2099-04-06T12:00" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByRole("link", { name: "View details" })).toBeInTheDocument();
      expect(startInput()).toHaveAttribute("aria-invalid", "false");
      expect(endInput()).toHaveAttribute("aria-invalid", "false");
    });

    it("rejects a period when the event has no schedule", async () => {
      renderSearch({ additional }, undefined, noDates);

      await userEvent.type(screen.getByLabelText(/Booking label/), "Breakout 1");
      fireEvent.change(capacityInput(), { target: { value: "20" } });
      fireEvent.change(startInput(), { target: { value: "2099-04-06T10:00" } });
      fireEvent.change(endInput(), { target: { value: "2099-04-06T11:00" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findAllByText(/must fall within the event's start and end time/)).toHaveLength(2);
    });

    it("finds venues for a labelled booking inside the event and opens them as an additional booking", async () => {
      renderSearch({ additional });

      await userEvent.type(screen.getByLabelText(/Booking label/), "Breakout 1");
      fireEvent.change(capacityInput(), { target: { value: "20" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));

      expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/venues/venue-1?forEvent=event-1&fromSearch=1&additional=1",
      );
      expect(screen.queryByText(/These dates differ/)).not.toBeInTheDocument();
    });

    it("clears the label error as soon as a label is typed, and the label on reset", async () => {
      renderSearch({ additional });
      fireEvent.change(capacityInput(), { target: { value: "20" } });
      await userEvent.click(screen.getByRole("button", { name: /Search venues/ }));
      expect(await screen.findByText("Give this booking a label, for example Breakout 1")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/Booking label/), "B");
      expect(screen.queryByText("Give this booking a label, for example Breakout 1")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(capacityInput()).toHaveValue(null);
    });

    it("restores the label and search the coordinator came back from", () => {
      renderSearch({ additional }, { additional: true, bookingLabel: "Breakout 2", venueSearch: { ...additionalSearchDefaults(event, "Bugis"), minimumCapacity: "15" } });

      expect(screen.getByLabelText(/Booking label/)).toHaveValue("Breakout 2");
      expect(capacityInput()).toHaveValue(15);
    });

    it("starts with a blank label when the saved search has none", () => {
      renderSearch({ additional }, { additional: true, venueSearch: { ...additionalSearchDefaults(event, "Bugis"), minimumCapacity: "15" } });

      expect(screen.getByLabelText(/Booking label/)).toHaveValue("");
    });
  });
});
