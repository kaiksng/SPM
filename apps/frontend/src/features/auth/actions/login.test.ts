import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithPassword, singleMock, fromMock } = vi.hoisted(() => {
  const signInWithPassword = vi.fn();
  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return { signInWithPassword, singleMock, fromMock };
});

vi.mock("@/lib/supabase-client", () => ({
  supabase: {
    auth: { signInWithPassword },
    from: fromMock,
  },
}));

import { login } from "./login";

function formDataWith(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { role: "attendee" }, error: null });
  });

  it("returns field errors without calling Supabase when validation fails", async () => {
    const state = await login(undefined, formDataWith({ email: "", password: "" }));

    expect(state?.errors?.email).toBeDefined();
    expect(state?.errors?.password).toBeDefined();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic message and never leaks the raw Supabase error", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const state = await login(
      undefined,
      formDataWith({ email: "person@example.com", password: "wrong-password" }),
    );

    expect(state?.message).toBe("Invalid email or password.");
    expect(state?.message).not.toContain("Invalid login credentials");
  });

  it("falls back to a generic message for unrecognized Supabase errors", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "some_new_unmapped_code", message: "Some internal detail" },
    });

    const state = await login(
      undefined,
      formDataWith({ email: "person@example.com", password: "whatever" }),
    );

    expect(state?.message).toBe("Something went wrong. Please try again.");
  });

  it("returns the role destination on success instead of redirecting server-side", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const state = await login(
      undefined,
      formDataWith({ email: "person@example.com", password: "correct-password" }),
    );

    expect(state?.redirectTo).toBe("/browse-events");
  });
});
