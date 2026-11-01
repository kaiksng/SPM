import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: {
  user: { id: string } | null;
  profile: { role: string } | null;
  loading: boolean;
} = { user: null, profile: null, loading: false };

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));

import { AuthLayout } from "./AuthLayout";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<p>SIGN-IN FORM</p>} />
        </Route>
        <Route path="*" element={<p>LANDED ELSEWHERE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = null;
  authState.profile = null;
  authState.loading = false;
});

describe("AuthLayout", () => {
  it("shows the sign-in form to a signed-out visitor", () => {
    renderLogin();

    expect(screen.getByText("SIGN-IN FORM")).toBeInTheDocument();
  });

  it("shows nothing while the session is still being read", () => {
    authState.loading = true;

    renderLogin();

    expect(screen.queryByText("SIGN-IN FORM")).not.toBeInTheDocument();
    expect(screen.queryByText("LANDED ELSEWHERE")).not.toBeInTheDocument();
  });

  it("keeps the form until a signed-in user's profile has loaded", () => {
    authState.user = { id: "user-1" };

    renderLogin();

    expect(screen.getByText("SIGN-IN FORM")).toBeInTheDocument();
  });

  // SPM-13 AC01 / SPM-17 AC01: a signed-in user goes to their own page, not the sign-in form.
  it.each([
    ["event_organiser", "/events"],
    ["event_coordinator", "/events"],
    ["event_coordinator_lead", "/events"],
    ["venue_staff", "/venue-requests"],
    ["technical_support_staff", "/equipment"],
    ["attendee", "/browse-events"],
    ["safety_officer", "/safety-checks"],
  ])("SPM-17 AC01: sends a signed-in %s to %s", (role, destination) => {
    authState.user = { id: "user-1" };
    authState.profile = { role };

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="login" element={<p>SIGN-IN FORM</p>} />
          </Route>
          <Route path={destination} element={<p>{`PAGE ${destination}`}</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(`PAGE ${destination}`)).toBeInTheDocument();
    expect(screen.queryByText("SIGN-IN FORM")).not.toBeInTheDocument();
  });
});
