import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Sam Safety", role: "safety_officer" },
  user: { id: "safety-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { SafetyChecksPage } from "./SafetyChecksPage";

describe("SafetyChecksPage", () => {
  beforeEach(() => {
    authState.profile.role = "safety_officer";
  });

  // SPM-77 AC01 + AC03: the Safety Officer's own landing page.
  it("shows the placeholder for a signed-in safety officer", () => {
    render(
      <MemoryRouter initialEntries={["/safety-checks"]}>
        <SafetyChecksPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Safety Checks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Operational safety reviews for confirmed events will appear here.",
      ),
    ).toBeInTheDocument();
  });

  // SPM-77 AC03 + AC04: another role is denied the safety page with a clear message.
  it("denies another role with a clear message", () => {
    authState.profile.role = "event_coordinator_lead";

    render(
      <MemoryRouter initialEntries={["/safety-checks"]}>
        <SafetyChecksPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Safety Checks" })).not.toBeInTheDocument();
  });
});
