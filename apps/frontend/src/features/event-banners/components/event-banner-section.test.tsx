import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadEventBannerMock = vi.fn();
const removeEventBannerMock = vi.fn();
vi.mock("@/features/event-banners/services/event-banners", () => ({
  eventBannerUrl: (path: string | null) => (path ? `https://storage.test/${path}` : null),
  uploadEventBanner: (...args: unknown[]) => uploadEventBannerMock(...args),
  removeEventBanner: (...args: unknown[]) => removeEventBannerMock(...args),
}));

import { EventBannerSection } from "./event-banner-section";

const onChanged = vi.fn();

function renderSection(bannerPath: string | null) {
  return render(
    <EventBannerSection eventId="event-1" organiserId="org-1" bannerPath={bannerPath} onChanged={onChanged} />,
  );
}

beforeEach(() => {
  onChanged.mockReset();
  uploadEventBannerMock.mockReset().mockResolvedValue("org-1/new.png");
  removeEventBannerMock.mockReset().mockResolvedValue(undefined);
});

describe("EventBannerSection", () => {
  it("offers an upload when the event has no banner", () => {
    renderSection(null);

    expect(screen.getByText("No banner yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload banner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("uploads the chosen image and shows the new banner", async () => {
    const user = userEvent.setup();
    renderSection(null);
    const file = new File(["x"], "banner.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose a banner image"), file);

    expect(uploadEventBannerMock).toHaveBeenCalledWith("event-1", "org-1", file, null);
    expect(onChanged).toHaveBeenCalledWith("org-1/new.png");
  });

  it("shows the current banner, which can be replaced or removed", async () => {
    const user = userEvent.setup();
    const { container } = renderSection("org-1/old.png");

    expect(container.querySelector("img")).toHaveAttribute("src", "https://storage.test/org-1/old.png");
    expect(screen.getByRole("button", { name: "Replace banner" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeEventBannerMock).toHaveBeenCalledWith("event-1", "org-1/old.png");
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("says why an upload failed", async () => {
    uploadEventBannerMock.mockRejectedValue(new Error("Upload a JPG, PNG or WebP image."));
    const user = userEvent.setup({ applyAccept: false });
    renderSection(null);

    await user.upload(screen.getByLabelText("Choose a banner image"), new File(["x"], "a.gif", { type: "image/gif" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a JPG, PNG or WebP image.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
