import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, getUser } = vi.hoisted(() => {
  const redirectMock = vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  const getUser = vi.fn();

  return { redirectMock, getUser };
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

import { requireUserForPage } from "./require-user-for-page";

describe("requireUserForPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireUserForPage()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns the user without redirecting when authenticated", async () => {
    const user = { id: "user-1" };
    getUser.mockResolvedValue({ data: { user } });

    await expect(requireUserForPage()).resolves.toBe(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
