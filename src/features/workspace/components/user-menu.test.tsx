import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const logoutMock = vi.fn();

vi.mock("@/features/auth/actions/logout", () => ({
  logout: (...args: unknown[]) => logoutMock(...args),
}));

import { UserMenu } from "./user-menu";

describe("UserMenu", () => {
  it("renders closed by default, hiding role and email", () => {
    render(
      <UserMenu
        role="event_coordinator"
        email="jane.doe@example.com"
        fullName="Jane Doe"
      />,
    );

    expect(screen.getByRole("button", { name: "Open user menu" })).toHaveTextContent(
      "JD",
    );
    expect(screen.queryByText("Event Coordinator")).not.toBeInTheDocument();
    expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument();
  });

  it("opens on click showing the role label and email", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        role="event_coordinator"
        email="jane.doe@example.com"
        fullName="Jane Doe"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open user menu" }));

    expect(await screen.findByText("Event Coordinator")).toBeInTheDocument();
    expect(screen.getByText("jane.doe@example.com")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        role="event_coordinator"
        email="jane.doe@example.com"
        fullName="Jane Doe"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open user menu" }));
    expect(await screen.findByText("jane.doe@example.com")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument(),
    );
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UserMenu
          role="event_coordinator"
          email="jane.doe@example.com"
          fullName="Jane Doe"
        />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Open user menu" }));
    expect(await screen.findByText("jane.doe@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() =>
      expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument(),
    );
  });

  it("renders a sign-out form wired to the logout action", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        role="event_coordinator"
        email="jane.doe@example.com"
        fullName="Jane Doe"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open user menu" }));

    const signOutButton = await screen.findByRole("button", {
      name: "Sign out",
    });
    expect(signOutButton).toHaveAttribute("type", "submit");

    await user.click(signOutButton);

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });

  it("falls back to email initials when no full name is available", () => {
    render(
      <UserMenu role="attendee" email="al@example.com" fullName={null} />,
    );

    expect(screen.getByRole("button", { name: "Open user menu" })).toHaveTextContent(
      "AL",
    );
  });
});
