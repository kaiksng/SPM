import type { VenueBookingAtRisk, VenueFormValues } from "@spm/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createVenueMock = vi.fn();
const updateVenueMock = vi.fn();
const getVenueMock = vi.fn();
const listAtRiskBookingsMock = vi.fn();
const authState: { profile: { full_name: string; role: string } | null } = {
  profile: { full_name: "Daryl", role: "venue_staff" },
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/venues/services/venues", () => ({
  createVenue: (...args: unknown[]) => createVenueMock(...args),
  updateVenue: (...args: unknown[]) => updateVenueMock(...args),
  getVenue: (...args: unknown[]) => getVenueMock(...args),
  listAtRiskBookings: (...args: unknown[]) => listAtRiskBookingsMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

// VenueForm has its own tests (venue-form.test.tsx). Stubbed here so these
// tests cover only what the page owns: loading, access, and what happens
// after a save.
vi.mock("@/features/venues/components/venue-form", () => ({
  VenueForm: (props: {
    initialValues: VenueFormValues;
    atRiskBookings: VenueBookingAtRisk[];
    onSave: (values: VenueFormValues) => Promise<void>;
    onCancel: () => void;
    submitLabel: string;
  }) => (
    <div>
      <p>FORM name={props.initialValues.name || "(empty)"}</p>
      <p>FORM atRisk={props.atRiskBookings.length}</p>
      <button type="button" onClick={() => void props.onSave(props.initialValues)}>
        {props.submitLabel}
      </button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

import { VenueEditorPage } from "./VenueEditorPage";

const storedVenue = {
  name: "Innovation Hall",
  location: "Block A",
  capacity: "120",
  operatingHours: [{ days: ["mon"], opensAt: "09:00", closesAt: "18:00" }],
  facilities: ["Projector"],
  layouts: ["Theatre"],
  description: "",
  accessibilityNotes: "",
  updatedAt: "2026-09-25T06:20:00Z",
  updatedByName: "Daryl",
};

function VenuesListStub() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return <p>VENUES LIST {notice ?? ""}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="venues/new" element={<VenueEditorPage />} />
        <Route path="venues/:venueId/edit" element={<VenueEditorPage />} />
        <Route path="venues" element={<VenuesListStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  authState.profile = { full_name: "Daryl", role: "venue_staff" };
  createVenueMock.mockReset().mockResolvedValue({ venueId: "venue-1" });
  updateVenueMock.mockReset().mockResolvedValue({ venueId: "venue-1", flaggedBookingsCount: 0 });
  getVenueMock.mockReset().mockResolvedValue(storedVenue);
  listAtRiskBookingsMock.mockReset().mockResolvedValue([]);
});

describe("VenueEditorPage", () => {
  describe("access", () => {
    it("tells a role without venue-management permission that Venue Staff access is required", () => {
      authState.profile = { full_name: "Jasmine", role: "event_organiser" };
      renderAt("/venues/new");

      expect(screen.getByText("Venue Staff access is required")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Return to your workspace" })).toHaveAttribute(
        "href",
        "/events",
      );
      expect(screen.queryByText(/FORM/)).not.toBeInTheDocument();
    });

    it("renders nothing while there is no profile yet", () => {
      authState.profile = null;
      const { container } = renderAt("/venues/new");

      expect(container).toBeEmptyDOMElement();
      expect(getVenueMock).not.toHaveBeenCalled();
    });
  });

  describe("create mode", () => {
    it("opens an empty form without loading anything", () => {
      renderAt("/venues/new");

      expect(screen.getByRole("heading", { name: "Add a venue" })).toBeInTheDocument();
      expect(screen.getByText("FORM name=(empty)")).toBeInTheDocument();
      expect(screen.getByText("FORM atRisk=0")).toBeInTheDocument();
      expect(getVenueMock).not.toHaveBeenCalled();
      expect(listAtRiskBookingsMock).not.toHaveBeenCalled();
    });

    it("creates the venue and returns to the list with a notice", async () => {
      const user = userEvent.setup();
      renderAt("/venues/new");

      await user.click(screen.getByRole("button", { name: "Add venue" }));

      expect(createVenueMock).toHaveBeenCalledWith(expect.objectContaining({ name: "" }));
      expect(updateVenueMock).not.toHaveBeenCalled();
      expect(await screen.findByText("VENUES LIST Venue added.")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("shows a loading placeholder, then the form pre-filled with the stored venue", async () => {
      const venue = deferred<typeof storedVenue>();
      getVenueMock.mockReturnValue(venue.promise);
      listAtRiskBookingsMock.mockResolvedValue([{ id: "booking-1" }]);
      renderAt("/venues/venue-1/edit");

      expect(screen.getByRole("heading", { name: "Edit venue" })).toBeInTheDocument();
      expect(screen.queryByText(/FORM/)).not.toBeInTheDocument();

      venue.resolve(storedVenue);

      expect(await screen.findByText("FORM name=Innovation Hall")).toBeInTheDocument();
      expect(screen.getByText("FORM atRisk=1")).toBeInTheDocument();
      expect(getVenueMock).toHaveBeenCalledWith("venue-1");
      expect(listAtRiskBookingsMock).toHaveBeenCalledWith("venue-1");
    });

    it("updates the venue and returns to the list with a notice", async () => {
      const user = userEvent.setup();
      renderAt("/venues/venue-1/edit");

      await user.click(await screen.findByRole("button", { name: "Save changes" }));

      expect(updateVenueMock).toHaveBeenCalledWith(
        "venue-1",
        expect.objectContaining({ name: "Innovation Hall" }),
      );
      expect(createVenueMock).not.toHaveBeenCalled();
      expect(await screen.findByText("VENUES LIST Venue updated.")).toBeInTheDocument();
    });

    it.each([
      ["an Error", new Error("This venue is unavailable or you do not have access to it."), "This venue is unavailable or you do not have access to it."],
      ["a non-Error value", "boom", "This venue could not be loaded."],
    ])("shows Venue unavailable when loading throws %s", async (_label, failure, message) => {
      getVenueMock.mockRejectedValue(failure);
      renderAt("/venues/venue-1/edit");

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("heading", { name: "Venue unavailable" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Return to venues" })).toHaveAttribute(
        "href",
        "/venues",
      );
      expect(screen.queryByText(/FORM/)).not.toBeInTheDocument();
    });

    it.each([
      ["resolves", (load: ReturnType<typeof deferred<typeof storedVenue>>) => load.resolve(storedVenue)],
      ["fails", (load: ReturnType<typeof deferred<typeof storedVenue>>) => load.reject(new Error("late"))],
    ])("ignores a load that %s after the page has been left", async (_label, settle) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const load = deferred<typeof storedVenue>();
      getVenueMock.mockReturnValue(load.promise);
      const { unmount } = renderAt("/venues/venue-1/edit");

      unmount();
      settle(load);
      await load.promise.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // A state update after unmount would log a React warning.
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  it("returns to the venue list on cancel", async () => {
    const user = userEvent.setup();
    renderAt("/venues/new");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("VENUES LIST")).toBeInTheDocument();
  });
});
