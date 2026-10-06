import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

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
});
