import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventForCoordinatorEditMock = vi.fn();
const updateEventAsCoordinatorMock = vi.fn();
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "20000000-0000-0000-0000-000000000002" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/coordinator-event-edit", () => ({
  loadEventForCoordinatorEdit: (...args: unknown[]) =>
    loadEventForCoordinatorEditMock(...args),
  updateEventAsCoordinator: (...args: unknown[]) => updateEventAsCoordinatorMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

// EventRequestForm loads the equipment catalogue and room layouts; without
// these the form reached the real Supabase client.
vi.mock("@/features/event-requests/services/equipment", () => ({
  loadEquipmentCatalogue: vi.fn().mockResolvedValue([
    { id: "a0000000-0000-0000-0000-000000000001", name: "Wireless microphone", category: "Audio" },
  ]),
}));

vi.mock("@/features/venues/hooks/use-room-layout-options", () => ({
  useRoomLayoutOptions: () => ["Theatre", "Classroom", "Banquet"],
}));

import { emptyEventRequestFormValues } from "@spm/shared";

import { CoordinatorEventEditPage } from "./CoordinatorEventEditPage";

const values = {
  ...emptyEventRequestFormValues,
  title: "Student Leadership Summit 2",
  expectedAttendance: "120",
  venue: {
    ...emptyEventRequestFormValues.venue,
    preferredLocation: "City centre",
  },
  registration: {
    ...emptyEventRequestFormValues.registration,
    required: true,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/coordinator-edit"]}>
      <Routes>
        <Route
          path="events/:eventId/coordinator-edit"
          element={<CoordinatorEventEditPage />}
        />
        <Route path="events/:eventId" element={<p>EVENT DETAIL PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.profile.role = "event_coordinator";
  loadEventForCoordinatorEditMock.mockReset().mockResolvedValue(values);
  updateEventAsCoordinatorMock.mockReset().mockResolvedValue("event-1");
});

describe("CoordinatorEventEditPage", () => {
  it("denies access to a non-coordinator", () => {
    authState.profile.role = "event_organiser";

    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(loadEventForCoordinatorEditMock).not.toHaveBeenCalled();
  });

  it("loads the Planning event and pre-fills the form", async () => {
    renderPage();

    expect(await screen.findByDisplayValue("Student Leadership Summit 2")).toBeInTheDocument();
    expect(loadEventForCoordinatorEditMock).toHaveBeenCalledWith("event-1");
  });

  it("locks overview, schedule and registration, leaving venue and equipment open", async () => {
    renderPage();

    await screen.findByDisplayValue("Student Leadership Summit 2");

    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
    expect(screen.getByLabelText(/Purpose/)).toBeDisabled();
    expect(screen.getByLabelText(/Expected attendance/)).toBeDisabled();
    expect(screen.getByLabelText(/Starts/)).toBeDisabled();
    expect(screen.getByLabelText(/Ends/)).toBeDisabled();
    expect(screen.getByLabelText(/Attendee registration is required/)).toBeDisabled();

    expect(screen.getByLabelText(/Preferred location/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeEnabled();
  });

  it("shows an error state when the event is unavailable", async () => {
    loadEventForCoordinatorEditMock.mockRejectedValue(
      new Error("This event is unavailable, not in Planning, or you do not have access to it."),
    );

    renderPage();

    expect(
      await screen.findByText(
        "This event is unavailable, not in Planning, or you do not have access to it.",
      ),
    ).toBeInTheDocument();
  });

  it("saves via update_event_as_coordinator and returns to the event", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue("Student Leadership Summit 2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateEventAsCoordinatorMock).toHaveBeenCalledWith(
        "event-1",
        expect.objectContaining({ title: "Student Leadership Summit 2" }),
      );
    });
    expect(await screen.findByText("EVENT DETAIL PAGE")).toBeInTheDocument();
  });

  describe("SPM-10: updating a Planning event's editable requirements", () => {
    const planningEvent = {
      ...emptyEventRequestFormValues,
      title: "Student Leadership Summit 2",
      purpose: "Workshops for student leaders",
      description: "A full day of workshops.",
      eventType: "Workshop",
      expectedAttendance: "120",
      startsAt: "2099-04-01T10:00",
      endsAt: "2099-04-01T12:00",
      venue: {
        preferredLocation: "Central Area",
        minimumCapacity: "",
        accessibilityNotes: "Ramp access",
        layoutNotes: "Theatre" as const,
        facilities: ["Parking"],
      },
      equipment: [
        {
          id: "requirement-1",
          equipmentItemId: "a0000000-0000-0000-0000-000000000001",
          legacyName: "",
          quantity: "2",
          requiredFrom: "2099-04-01T10:00",
          requiredUntil: "2099-04-01T12:00",
          notes: "",
        },
      ],
      registration: {
        required: true,
        opensAt: "2099-03-01T09:00",
        closesAt: "2099-03-20T17:00",
        capacity: "100",
        waitlistEnabled: true,
      },
      requirementsAcknowledged: true,
    };

    beforeEach(() => {
      loadEventForCoordinatorEditMock.mockResolvedValue(structuredClone(planningEvent));
    });

    // SPM-10 AC01: overview, schedule and registration are locked for the coordinator.
    it("locks every overview, schedule and registration field", async () => {
      renderPage();

      await screen.findByDisplayValue("Student Leadership Summit 2");
      expect(screen.getByLabelText(/Event name/)).toBeDisabled();
      expect(screen.getByLabelText(/Purpose/)).toBeDisabled();
      expect(screen.getByLabelText(/Description/)).toBeDisabled();
      expect(screen.getByLabelText(/Expected attendance/)).toBeDisabled();
      expect(screen.getByLabelText(/Starts/)).toBeDisabled();
      expect(screen.getByLabelText(/Ends/)).toBeDisabled();
      expect(screen.getByLabelText(/Attendee registration is required/)).toBeDisabled();
    });

    // SPM-10 AC01: event category and the registration details are not offered for editing at all.
    it("offers no control for event category or registration dates, capacity and waitlist", async () => {
      renderPage();

      await screen.findByDisplayValue("Student Leadership Summit 2");
      expect(screen.queryByLabelText(/Event category/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Registration opens/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Registration closes/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Registration capacity/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Waitlist/)).not.toBeInTheDocument();
    });

    // SPM-10 AC03: venue requirements and equipment stay editable while Planning.
    it("leaves every venue requirement and the equipment list editable", async () => {
      renderPage();

      await screen.findByDisplayValue("Student Leadership Summit 2");
      expect(screen.getByLabelText(/Preferred location/)).toBeEnabled();
      expect(screen.getByLabelText("Room layout")).toBeEnabled();
      expect(screen.getByLabelText("Accessibility needs")).toBeEnabled();
      expect(screen.getByRole("group", { name: "Required facilities" })).toBeEnabled();
      expect(screen.getByLabelText(/Quantity/)).toBeEnabled();
      expect(screen.getByRole("button", { name: "Add equipment" })).toBeEnabled();
    });

    // SPM-10 AC01 + AC03: venue and equipment edits are sent, and every locked
    // field is sent back exactly as it was loaded.
    it("sends the venue and equipment edits with every locked field unchanged", async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByDisplayValue("Student Leadership Summit 2");
      await user.selectOptions(screen.getByLabelText(/Preferred location/), "North");
      await user.selectOptions(screen.getByLabelText("Room layout"), "Classroom");
      await user.click(screen.getByRole("checkbox", { name: "Gym" }));
      await user.clear(screen.getByLabelText("Accessibility needs"));
      await user.type(screen.getByLabelText("Accessibility needs"), "Step-free entrance");
      await user.clear(screen.getByLabelText(/Quantity/));
      await user.type(screen.getByLabelText(/Quantity/), "3");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(updateEventAsCoordinatorMock).toHaveBeenCalledTimes(1));
      const [eventId, sent] = updateEventAsCoordinatorMock.mock.calls[0]!;
      expect(eventId).toBe("event-1");
      expect(sent).toMatchObject({
        title: planningEvent.title,
        purpose: planningEvent.purpose,
        description: planningEvent.description,
        eventType: planningEvent.eventType,
        expectedAttendance: planningEvent.expectedAttendance,
        startsAt: planningEvent.startsAt,
        endsAt: planningEvent.endsAt,
        registration: planningEvent.registration,
        venue: {
          preferredLocation: "North",
          layoutNotes: "Classroom",
          accessibilityNotes: "Step-free entrance",
          facilities: expect.arrayContaining(["Parking", "Gym"]),
        },
      });
      expect(sent.equipment).toEqual([
        expect.objectContaining({ id: "requirement-1", quantity: "3" }),
      ]);
    });

    // SPM-10 AC02: a rejected update keeps the coordinator on the form with the
    // database's reason and their unsaved edits, rather than reporting success.
    it("shows why an update was rejected and keeps the unsaved edits", async () => {
      updateEventAsCoordinatorMock.mockRejectedValue(
        new Error("Event name is locked once the event reaches Planning"),
      );
      const user = userEvent.setup();
      renderPage();

      await screen.findByDisplayValue("Student Leadership Summit 2");
      await user.selectOptions(screen.getByLabelText(/Preferred location/), "North");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(
        await screen.findByText("Event name is locked once the event reaches Planning"),
      ).toBeInTheDocument();
      expect(screen.queryByText("EVENT DETAIL PAGE")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Preferred location/)).toHaveValue("North");
    });
  });
});
