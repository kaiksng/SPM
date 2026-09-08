import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, signOutMock } = vi.hoisted(() => {
  const redirectMock = vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  const signOutMock = vi.fn(async () => ({ error: null }));

  return { redirectMock, signOutMock };
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: signOutMock },
  })),
}));

import { logout } from "./logout";

describe("logout action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs the user out and redirects to /login", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");

    expect(signOutMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
