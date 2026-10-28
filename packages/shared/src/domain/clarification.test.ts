import { describe, expect, it } from "vitest";

import {
  clarificationPermittedFieldKeys,
  clarificationPermittedFieldLabels,
  isUnresolvedClarificationStatus,
} from "./clarification";

describe("clarification permitted fields", () => {
  it("defines a label for every permitted field key", () => {
    for (const key of clarificationPermittedFieldKeys) {
      expect(clarificationPermittedFieldLabels[key]).toBeTruthy();
    }
  });

  it("also labels the retired legacy 'requirements' bucket for old rows", () => {
    expect(clarificationPermittedFieldLabels.requirements).toBeTruthy();
    expect(clarificationPermittedFieldKeys).not.toContain("requirements");
  });

  // The event form has no Event type field, so it can't be offered for a new
  // clarification; old rows that granted it still get a label.
  it("no longer offers Event type but still labels it for old rows", () => {
    expect(clarificationPermittedFieldKeys).not.toContain("eventType");
    expect(clarificationPermittedFieldLabels.eventType).toBe("Event type");
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
