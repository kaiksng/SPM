import { describe, expect, it } from "vitest";

import { mapAuthError } from "./map-auth-error";

describe("mapAuthError", () => {
  it("maps known codes to safe messages", () => {
    expect(mapAuthError({ code: "invalid_credentials" })).toBe(
      "Invalid email or password.",
    );
    expect(mapAuthError({ code: "email_not_confirmed" })).toBe(
      "Please confirm your email before signing in.",
    );
    expect(mapAuthError({ code: "over_request_rate_limit" })).toBe(
      "Too many attempts. Please try again later.",
    );
  });

  it("never returns a raw/unmapped error message", () => {
    expect(mapAuthError({ code: "totally_unexpected_code" })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(mapAuthError(null)).toBe("Something went wrong. Please try again.");
    expect(mapAuthError(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("never reveals whether an email is already registered", () => {
    const message = mapAuthError({ code: "user_already_exists" });

    expect(message).not.toMatch(/already (registered|exists|in use)/i);
    expect(mapAuthError({ code: "email_exists" })).toBe(message);
  });

  it("maps a weak password to a safe policy message", () => {
    expect(mapAuthError({ code: "weak_password" })).toBe(
      "That password doesn't meet the minimum requirements.",
    );
  });
});
