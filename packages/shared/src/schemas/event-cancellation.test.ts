import { describe, expect, it } from "vitest";

import { cancelEventBodySchema } from "./event-cancellation";

describe("cancelEventBodySchema", () => {
  // SPM-45 AC3: a reason is always required.
  it("accepts and trims a non-empty reason", () => {
    const result = cancelEventBodySchema.safeParse({ reason: "  The venue fell through.  " });

    expect(result.success).toBe(true);
    expect(result.data?.reason).toBe("The venue fell through.");
  });

  it("rejects an empty reason", () => {
    const result = cancelEventBodySchema.safeParse({ reason: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    const result = cancelEventBodySchema.safeParse({ reason: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const result = cancelEventBodySchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a reason over 2000 characters", () => {
    const result = cancelEventBodySchema.safeParse({ reason: "a".repeat(2_001) });

    expect(result.success).toBe(false);
  });

  it("accepts a reason exactly at the 2000 character limit", () => {
    const result = cancelEventBodySchema.safeParse({ reason: "a".repeat(2_000) });

    expect(result.success).toBe(true);
  });
});
