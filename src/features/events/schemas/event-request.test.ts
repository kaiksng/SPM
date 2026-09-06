import { describe, expect, it } from "vitest";

import { eventDraftSchema } from "./event-request";

describe("event draft validation", () => {
  it("accepts a valid partial draft", () => {
    expect(
      eventDraftSchema.safeParse({ title: "Orientation briefing" }).success,
    ).toBe(true);
  });

  it("rejects an end time before the start time", () => {
    const result = eventDraftSchema.safeParse({
      title: "Orientation briefing",
      startsAt: "2026-09-10T14:00:00+08:00",
      endsAt: "2026-09-10T13:00:00+08:00",
    });

    expect(result.success).toBe(false);
  });
});
