import { describe, expect, it } from "vitest";

import {
  clarificationPermittedFieldKeys,
  clarificationPermittedFieldLabels,
  isUnresolvedClarificationStatus,
} from "./clarification";

describe("clarification permitted fields", () => {
  it("defines a label for every permitted field key", () => {
    expect(Object.keys(clarificationPermittedFieldLabels).sort()).toEqual(
      [...clarificationPermittedFieldKeys].sort(),
    );
  });

  it("has no duplicate keys", () => {
    expect(new Set(clarificationPermittedFieldKeys).size).toBe(
      clarificationPermittedFieldKeys.length,
    );
  });
});

describe("isUnresolvedClarificationStatus", () => {
  it("treats open and answered as unresolved", () => {
    expect(isUnresolvedClarificationStatus("open")).toBe(true);
    expect(isUnresolvedClarificationStatus("answered")).toBe(true);
  });

  it("treats resolved as not unresolved", () => {
    expect(isUnresolvedClarificationStatus("resolved")).toBe(false);
  });
});
