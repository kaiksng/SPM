import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { getSession, onAuthStateChange, fromMock } = vi.hoisted(() => {
  const singleMock = vi.fn(async () => ({
    data: { full_name: "Jane Doe", role: "attendee" },
    error: null,
  }));
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    fromMock,
  };
});

vi.mock("@/lib/supabase-client", () => ({
  supabase: {
    auth: { getSession, onAuthStateChange },
    from: fromMock,
  },
}));

import { AuthProvider } from "@/context/auth-context";
import { RequireSession } from "./require-session";

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Sign-in page</div>} />
          <Route element={<RequireSession />}>
            <Route path="/home" element={<div>Protected workspace</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RequireSession", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    renderProtectedRoute();

    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "a@example.com" } } },
    });

    renderProtectedRoute();

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
  });
});
