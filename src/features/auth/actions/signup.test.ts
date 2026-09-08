import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, signUp } = vi.hoisted(() => {
  const redirectMock = vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  const signUp = vi.fn();

  return { redirectMock, signUp };
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp },
  })),
}));

import { signup } from "./signup";

function formDataWith(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const validForm = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  password: "correct horse battery staple",
  confirmPassword: "correct horse battery staple",
  role: "event_organiser",
};

describe("signup action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns field errors without calling Supabase when validation fails", async () => {
    const state = await signup(
      undefined,
      formDataWith({ ...validForm, confirmPassword: "does-not-match" }),
    );

    expect(state?.errors?.confirmPassword).toEqual(["Passwords do not match"]);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("rejects administrator as a submitted role before calling Supabase", async () => {
    const state = await signup(
      undefined,
      formDataWith({ ...validForm, role: "administrator" }),
    );

    expect(state?.errors?.role).toBeDefined();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("passes full_name and role through signUp's options.data", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: {} },
      error: null,
    });

    await expect(
      signup(undefined, formDataWith(validForm)),
    ).rejects.toThrow("REDIRECT:/home");

    expect(signUp).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: "correct horse battery staple",
      options: {
        data: {
          full_name: "Jane Doe",
          role: "event_organiser",
        },
      },
    });
  });

  it("redirects using the submitted role's destination", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-2" }, session: {} },
      error: null,
    });

    await expect(
      signup(undefined, formDataWith({ ...validForm, role: "attendee" })),
    ).rejects.toThrow("REDIRECT:/home");

    expect(redirectMock).toHaveBeenCalledWith("/home");
  });

  it("maps a duplicate-email error without leaking whether the email exists", async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });

    const state = await signup(undefined, formDataWith(validForm));

    expect(state?.message).not.toContain("already registered");
    expect(state?.message).toBe(
      "We couldn't create your account with those details. Try signing in instead.",
    );
  });

  it("treats a user-without-session response as a duplicate email, not success", async () => {
    // Supabase returns a user object with no session and no error for an
    // already-registered email, to avoid confirming that fact via an error.
    signUp.mockResolvedValue({
      data: { user: { id: "user-3" }, session: null },
      error: null,
    });

    const state = await signup(undefined, formDataWith(validForm));

    expect(redirectMock).not.toHaveBeenCalled();
    expect(state?.message).toBe(
      "We couldn't create your account with those details. Try signing in instead.",
    );
  });
});
