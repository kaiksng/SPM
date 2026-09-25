import { describe, expect, it } from "vitest";

import { signupSchema } from "./signup";

const validFields = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  password: "correct horse battery staple",
  confirmPassword: "correct horse battery staple",
  role: "attendee",
};

describe("signup validation", () => {
  it("accepts well-formed, matching fields", () => {
    const result = signupSchema.safeParse(validFields);
    expect(result.success).toBe(true);
  });

  it("rejects a full name that is too short", () => {
    const result = signupSchema.safeParse({ ...validFields, fullName: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = signupSchema.safeParse({
      ...validFields,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords with a single user-facing error", () => {
    const result = signupSchema.safeParse({
      ...validFields,
      confirmPassword: "something-else",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.confirmPassword).toEqual(["Passwords do not match"]);
    }
  });

  it("accepts every valid self-signup role", () => {
    for (const role of [
      "event_organiser",
      "event_coordinator",
      "venue_staff",
      "technical_support_staff",
      "attendee",
    ]) {
      expect(signupSchema.safeParse({ ...validFields, role }).success).toBe(
        true,
      );
    }
  });
});
