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
});
