import { describe, expect, it } from "vitest";
import { isSafetyCheckFlag, SAFETY_CHECK_FLAG_LABELS, SAFETY_CHECK_FLAGS } from "./safety-review";

describe("safety check flags", () => {
  it("recognises every known flag", () => {
    for (const flag of SAFETY_CHECK_FLAGS) {
      expect(isSafetyCheckFlag(flag)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isSafetyCheckFlag("fire_drill")).toBe(false);
    expect(isSafetyCheckFlag("")).toBe(false);
  });

  it("labels every flag", () => {
    for (const flag of SAFETY_CHECK_FLAGS) {
      expect(SAFETY_CHECK_FLAG_LABELS[flag].length).toBeGreaterThan(0);
    }
  });
});
