import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventForCoordinatorEditMock = vi.fn();
const listEventChangeRequestsMock = vi.fn();
const applyEventChangeRequestMock = vi.fn();
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
  loadEventForCoordinatorEdit: (...args: unknown[]) => loadEventForCoordinatorEditMock(...args),
}));

vi.mock("@/features/event-requests/services/change-requests", () => ({
  listEventChangeRequests: (...args: unknown[]) => listEventChangeRequestsMock(...args),
  applyEventChangeRequest: (...args: unknown[]) => applyEventChangeRequestMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

// EventRequestForm loads the equipment catalogue and room layouts.
vi.mock("@/features/event-requests/services/equipment", () => ({
  loadEquipmentCatalogue: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/venues/hooks/use-room-layout-options", () => ({
  useRoomLayoutOptions: () => ["Theatre", "Classroom", "Banquet"],
}));

import { emptyEventRequestFormValues } from "@spm/shared";

import { ChangeRequestApplyPage } from "./ChangeRequestApplyPage";

const values = {
  ...emptyEventRequestFormValues,
  title: "Student Leadership Summit",
  expectedAttendance: "120",
  startsAt: "2099-04-01T10:00",
  endsAt: "2099-04-01T12:00",
  requirementsAcknowledged: true,
};

const approvedRequest = {
  id: "change-request-1",
  requestedChanges: { description: "Move the start time to 2pm" },
  reason: "Speaker rescheduled",
  status: "approved" as const,
  reviewNotes: "Moving to the afternoon slot",
  requestedAt: "2099-01-01T02:00:00.000Z",
  reviewedAt: "2099-01-01T03:00:00.000Z",
  withdrawnAt: null,
  implementedAt: null,
};

function EventDetailStub() {
  const location = useLocation();
  return <p>EVENT DETAIL PAGE: {(location.state as { notice?: string } | null)?.notice}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/change-requests/change-request-1/apply"]}>
      <Routes>
        <Route
          path="events/:eventId/change-requests/:changeRequestId/apply"
          element={<ChangeRequestApplyPage />}
        />
        <Route path="events/:eventId" element={<EventDetailStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.profile.role = "event_coordinator";
  loadEventForCoordinatorEditMock.mockReset().mockResolvedValue(structuredClone(values));
  listEventChangeRequestsMock.mockReset().mockResolvedValue([approvedRequest]);
  applyEventChangeRequestMock
    .mockReset()
    .mockResolvedValue({ status: "implemented", returnedToPlanning: false });
});

describe("ChangeRequestApplyPage", () => {
  // SPM-39 AC03/AC07: only the assigned coordinator applies — a Lead never does.
  it("denies access to a Coordinator Lead", () => {
    authState.profile.role = "event_coordinator_lead";

    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(loadEventForCoordinatorEditMock).not.toHaveBeenCalled();
  });

  it("shows the approved change and loads the event in any applyable status", async () => {
    renderPage();

    expect(await screen.findByText("Move the start time to 2pm")).toBeInTheDocument();
    expect(screen.getByText("Speaker rescheduled")).toBeInTheDocument();
    expect(screen.getByText("Moving to the afternoon slot")).toBeInTheDocument();
    expect(loadEventForCoordinatorEditMock).toHaveBeenCalledWith("event-1", [
      "requested",
      "planning",
      "confirmed",
      "pending_safety_check",
    ]);
  });

  // SPM-39 AC07: fields Planning normally locks are open while applying.
  it("leaves the normally locked fields editable", async () => {
    renderPage();

    await screen.findByDisplayValue("Student Leadership Summit");
    expect(screen.getByLabelText(/Event name/)).toBeEnabled();
    expect(screen.getByLabelText(/Expected attendance/)).toBeEnabled();
    expect(screen.getByLabelText(/Starts/)).toBeEnabled();
    expect(screen.getByLabelText(/Ends/)).toBeEnabled();
  });

  it("refuses a request that is not waiting to be applied", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      { ...approvedRequest, status: "implemented" as const },
    ]);

    renderPage();

    expect(
      await screen.findByText("This change request is not waiting to be applied."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply change" })).not.toBeInTheDocument();
  });

  it("applies the change with the new details and returns to the event", async () => {
    const user = userEvent.setup();
    renderPage();

    const attendance = await screen.findByLabelText(/Expected attendance/);
    await user.clear(attendance);
    await user.type(attendance, "150");
    await user.click(screen.getByRole("button", { name: "Apply change" }));

    await waitFor(() =>
      expect(applyEventChangeRequestMock).toHaveBeenCalledWith(
        "change-request-1",
        expect.objectContaining({ expectedAttendance: "150" }),
      ),
    );
    expect(
      await screen.findByText(/Change applied\. Any affected arrangements are marked Needs Review\./),
    ).toBeInTheDocument();
  });

  // SPM-39 AC10: the coordinator is told when a new safety review is needed.
  it("says when the event went back to Planning for a new safety review", async () => {
    applyEventChangeRequestMock.mockResolvedValue({
      status: "implemented",
      returnedToPlanning: true,
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue("Student Leadership Summit");
    await user.click(screen.getByRole("button", { name: "Apply change" }));

    expect(
      await screen.findByText(/The event is back in Planning and needs a new safety review\./),
    ).toBeInTheDocument();
  });
});
