import { describe, expect, it } from "vitest";

import { loginSchema } from "./login";

describe("login validation", () => {
  it("accepts a well-formed email and non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
  });

  it("trims the email", () => {
    const result = loginSchema.safeParse({
      email: "  person@example.com  ",
      password: "anything",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("person@example.com");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "anything",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});
