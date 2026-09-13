import { describe, expect, it } from "vitest";

import { selectLeastLoadedCoordinator } from "./coordinator-assignment";

describe("selectLeastLoadedCoordinator", () => {
  it("picks the coordinator with the fewest active events", () => {
    const result = selectLeastLoadedCoordinator([
      { id: "b", activeEventCount: 3 },
      { id: "a", activeEventCount: 1 },
      { id: "c", activeEventCount: 2 },
    ]);

    expect(result?.id).toBe("a");
  });

  // A deterministic tie-break matters: two concurrent submissions computing
  // the same candidate list must agree on who wins before locking is applied.
  it("breaks a tie deterministically by id", () => {
    const result = selectLeastLoadedCoordinator([
      { id: "20000000-0000-0000-0000-000000000002", activeEventCount: 1 },
      { id: "10000000-0000-0000-0000-000000000001", activeEventCount: 1 },
    ]);

    expect(result?.id).toBe("10000000-0000-0000-0000-000000000001");
  });

  it("returns undefined when there is no coordinator to assign", () => {
    expect(selectLeastLoadedCoordinator([])).toBeUndefined();
  });

  it("does not mutate the input list", () => {
    const candidates = [
      { id: "b", activeEventCount: 2 },
      { id: "a", activeEventCount: 1 },
    ];
    const original = [...candidates];

    selectLeastLoadedCoordinator(candidates);

    expect(candidates).toEqual(original);
  });
});
