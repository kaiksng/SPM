import { describe, expect, it } from "vitest";

import { getRoleLabel } from "./role-label";

describe("role label", () => {
  it("formats snake_case roles as readable titles", () => {
    expect(getRoleLabel("event_organiser")).toBe("Event Organiser");
    expect(getRoleLabel("technical_support_staff")).toBe(
      "Technical Support Staff",
    );
    expect(getRoleLabel("safety_officer")).toBe("Safety Officer");
  });
});
