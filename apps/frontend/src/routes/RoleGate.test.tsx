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

  it("renders nothing while there is no profile yet", () => {
    authState.profile = null;

    const { container } = renderAt("/venues");

    expect(container).toBeEmptyDOMElement();
  });
});
