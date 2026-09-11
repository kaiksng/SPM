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
});
