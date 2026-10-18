import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: { profile: { full_name: string; role: string } | null } = {
  profile: { full_name: "Sam Staff", role: "venue_staff" },
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

import { RoleGate } from "./RoleGate";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoleGate>
        <p>Protected content</p>
      </RoleGate>
    </MemoryRouter>,
  );
}

describe("RoleGate", () => {
  beforeEach(() => {
    authState.profile = { full_name: "Sam Staff", role: "venue_staff" };
  });

  describe("SPM-16: venue staff role scope", () => {
    // SPM-16 AC01: venue staff see the pages permitted for their role.
    it.each(["/venues", "/venue-requests", "/flagged-bookings"])(
      "shows venue staff the page at %s",
      (path) => {
        renderAt(path);

        expect(screen.getByText("Protected content")).toBeInTheDocument();
        expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
      },
    );

    // SPM-16 AC02: a page outside venue staff's scope is denied and its
    // content is never rendered.
    it.each([
      "/events",
      "/events/10000000-0000-0000-0000-000000000001",
      "/equipment",
      "/safety-checks",
    ])("denies venue staff the page at %s", (path) => {
      renderAt(path);

      expect(screen.getByText("Access denied")).toBeInTheDocument();
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    });

    // SPM-16 AC03: the denial explains itself and offers a way back to the
    // venue staff's own dashboard instead of an error or a blank page.
    it("explains the denial and links back to the venue staff dashboard", () => {
      renderAt("/events");

      expect(
        screen.getByRole("heading", { name: "You don't have access to this page" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute(
        "href",
        "/venues",
      );
    });
  });

  describe("SPM-48: technical support staff role scope", () => {
    beforeEach(() => {
      authState.profile = { full_name: "Tess Support", role: "technical_support_staff" };
    });

    // SPM-48 AC01: technical support staff see the pages permitted for their role.
    it.each(["/equipment", "/equipment/inventory", "/equipment/unavailability"])(
      "shows technical support staff the page at %s",
      (path) => {
        renderAt(path);

        expect(screen.getByText("Protected content")).toBeInTheDocument();
        expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
      },
    );

    // SPM-48 AC02: a page outside their scope is denied and its content is
    // never rendered.
    it.each([
      "/events",
      "/events/10000000-0000-0000-0000-000000000001",
      "/venues",
      "/venue-requests",
      "/safety-checks",
    ])("denies technical support staff the page at %s", (path) => {
      renderAt(path);

      expect(screen.getByText("Access denied")).toBeInTheDocument();
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    });

    // SPM-48 AC03: the denial explains itself and links back to their own dashboard.
    it("explains the denial and links back to the technical support dashboard", () => {
      renderAt("/venues");

      expect(
        screen.getByRole("heading", { name: "You don't have access to this page" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute(
        "href",
        "/equipment",
      );
    });
  });

  it("renders nothing while there is no profile yet", () => {
    authState.profile = null;

    const { container } = renderAt("/venues");

    expect(container).toBeEmptyDOMElement();
  });
});
