import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, uploadMock, removeMock, getPublicUrlMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: {
    rpc: rpcMock,
    storage: {
      from: () => ({ upload: uploadMock, remove: removeMock, getPublicUrl: getPublicUrlMock }),
    },
  },
}));

import { eventBannerUrl, removeEventBanner, uploadEventBanner } from "./event-banners";

const image = (type = "image/png", size = 1024) => {
  const file = new File(["x"], "banner.png", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: "path", error: null });
  uploadMock.mockReset().mockResolvedValue({ data: {}, error: null });
  removeMock.mockReset().mockResolvedValue({ data: [], error: null });
  getPublicUrlMock.mockReset().mockImplementation((path: string) => ({
    data: { publicUrl: `https://storage.test/event-banners/${path}` },
  }));
});

describe("eventBannerUrl", () => {
  it("gives the public URL of a stored banner, or null without one", () => {
    expect(eventBannerUrl("org-1/banner.png")).toBe("https://storage.test/event-banners/org-1/banner.png");
    expect(eventBannerUrl(null)).toBeNull();
  });
});

describe("uploadEventBanner", () => {
  it("uploads into the organiser's own folder and sets it on the event", async () => {
    const path = await uploadEventBanner("event-1", "org-1", image(), null);

    expect(path).toMatch(/^org-1\/[\w-]+\.png$/);
    expect(uploadMock).toHaveBeenCalledWith(path, expect.any(File), { contentType: "image/png" });
    expect(rpcMock).toHaveBeenCalledWith("set_event_banner", { p_event_id: "event-1", p_banner_path: path });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("removes the banner it replaces", async () => {
    await uploadEventBanner("event-1", "org-1", image(), "org-1/old.png");

    expect(removeMock).toHaveBeenCalledWith(["org-1/old.png"]);
  });

  it("refuses other file types and large files before uploading", async () => {
    await expect(uploadEventBanner("event-1", "org-1", image("image/gif"), null)).rejects.toThrow(
      "Upload a JPG, PNG or WebP image.",
    );
    await expect(uploadEventBanner("event-1", "org-1", image("image/png", 6 * 1024 * 1024), null)).rejects.toThrow(
      "The image must be smaller than 5MB.",
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("deletes the upload and keeps the old banner when the event refuses it", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the event's organiser can change its banner" },
    });

    await expect(uploadEventBanner("event-1", "org-1", image(), "org-1/old.png")).rejects.toThrow(
      "Only the event's organiser can change its banner",
    );
    const uploadedPath = uploadMock.mock.calls[0]![0] as string;
    expect(removeMock).toHaveBeenCalledWith([uploadedPath]);
    expect(removeMock).not.toHaveBeenCalledWith(["org-1/old.png"]);
  });
});

describe("removeEventBanner", () => {
  it("clears the event's banner and deletes its file", async () => {
    await removeEventBanner("event-1", "org-1/old.png");

    expect(rpcMock).toHaveBeenCalledWith("set_event_banner", { p_event_id: "event-1" });
    expect(removeMock).toHaveBeenCalledWith(["org-1/old.png"]);
  });

  it("keeps the file when the event could not be updated", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    await expect(removeEventBanner("event-1", "org-1/old.png")).rejects.toThrow(
      "The banner could not be removed. Try again.",
    );
    expect(removeMock).not.toHaveBeenCalled();
  });
});
