import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/notifications/services/notifications", () => ({
  getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

import { WorkspaceShell } from "./workspace-shell";

function renderShell() {
  return render(
    <MemoryRouter>
      <WorkspaceShell role="event_organiser" email="jane@example.com" fullName="Jane Doe">
        <p>Page content</p>
      </WorkspaceShell>
    </MemoryRouter>,
  );
}

describe("WorkspaceShell mobile drawer", () => {
  it("shows branding and a close button in the drawer's own header, not overlapping the nav list", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const closeButton = screen.getByRole("button", { name: "Close menu" });
    const drawer = closeButton.closest("div")!.parentElement!;
    const firstNavLink = within(drawer).getByRole("link", { name: /events/i });

    // The close button must not be positioned over the first nav link —
    // they're siblings in separate rows (header, then nav), not stacked.
    expect(closeButton.compareDocumentPosition(firstNavLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(drawer).getByText("ConnectSphere")).toBeInTheDocument();
  });

  it("closes the drawer when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });

  it("closes the drawer when a nav link is clicked", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = screen.getByRole("button", { name: "Close menu" }).closest("div")!.parentElement!;
    await user.click(within(drawer).getByRole("link", { name: /events/i }));

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });

  it("closes the drawer when the ConnectSphere brand link is clicked", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = screen.getByRole("button", { name: "Close menu" }).closest("div")!.parentElement!;
    await user.click(within(drawer).getByText("ConnectSphere"));

    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });
});
