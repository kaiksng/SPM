import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: {
    auth: { signOut: signOutMock },
  },
}));

import { logout } from "./logout";

describe("logout action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs the user out via Supabase", async () => {
    await logout();

    expect(signOutMock).toHaveBeenCalledOnce();
  });

  // Shared test accounts: signing out must not end other people's sessions
  // of the same account.
  it("signs out this browser only, not the account's other sessions", async () => {
    await logout();

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
